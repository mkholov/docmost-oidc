import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import {
  jsonToText,
  parseDocumentJson,
  templateExtensions,
} from '../../collaboration/collaboration.util';
import { PageAccessService } from '../page/page-access/page-access.service';
import { TemplateAccessService } from './template-access.service';
import {
  CreateTemplateDto,
  ListTemplatesDto,
  TEMPLATE_SCOPE_WORKSPACE,
  UpdateTemplateDto,
} from './dto/template.dto';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

@Injectable()
export class TemplateService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly templateRepo: TemplateRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly access: TemplateAccessService,
  ) {}

  async list(dto: ListTemplatesDto, user: User, workspace: Workspace) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);

    let query = this.db
      .selectFrom('templates')
      .select([
        'templates.id',
        'templates.title',
        'templates.description',
        'templates.icon',
        'templates.spaceId',
        'templates.creatorId',
        'templates.createdAt',
        'templates.updatedAt',
      ])
      .select((eb) => [
        this.templateRepo.withCreator(eb),
        eb
          .selectFrom('spaces')
          .select('spaces.name')
          .whereRef('spaces.id', '=', 'templates.spaceId')
          .as('spaceName'),
      ])
      .where('templates.workspaceId', '=', workspace.id)
      .where('templates.deletedAt', 'is', null);

    if (dto.scope === TEMPLATE_SCOPE_WORKSPACE) {
      query = query.where('templates.spaceId', 'is', null);
    } else if (dto.scope) {
      query = spaceIds.includes(dto.scope)
        ? query.where('templates.spaceId', '=', dto.scope)
        : query.where(sql<boolean>`false`);
    } else {
      query = query.where((eb) =>
        eb.or([
          eb('templates.spaceId', 'is', null),
          ...(spaceIds.length
            ? [eb('templates.spaceId', 'in', spaceIds)]
            : []),
        ]),
      );
    }

    if (dto.query) {
      const term = `%${dto.query}%`;
      query = query.where((eb) =>
        eb.or([
          eb(sql`f_unaccent(templates.title)`, 'ilike', sql`f_unaccent(${term})`),
          eb(
            sql`f_unaccent(templates.description)`,
            'ilike',
            sql`f_unaccent(${term})`,
          ),
        ]),
      );
    }

    return executeWithCursorPagination(query, {
      perPage: dto.limit ?? 50,
      cursor: dto.cursor,
      beforeCursor: dto.beforeCursor,
      fields: [{ expression: 'templates.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  async info(
    templateId: string,
    user: User,
    workspace: Workspace,
    includeContent = true,
  ) {
    const template = await this.access.findViewableTemplate(
      templateId,
      user,
      workspace,
      { includeContent },
    );
    const canEdit = await this.access.canEdit(template.spaceId, user, workspace);
    return { ...template, canEdit };
  }

  async create(dto: CreateTemplateDto, user: User, workspace: Workspace) {
    const spaceId = dto.spaceId ?? null;
    await this.assertSpaceInWorkspace(spaceId, workspace.id);
    await this.access.assertCanEditScope(spaceId, user, workspace);

    let title = dto.title;
    let icon = dto.icon;
    let content: any = dto.content;

    if (dto.fromPageId) {
      const page = await this.pageRepo.findById(dto.fromPageId, {
        includeContent: true,
      });
      if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
        throw new NotFoundException('Page not found');
      }
      await this.pageAccessService.validateCanView(page, user);
      title = title ?? page.title;
      icon = icon ?? page.icon;
      content = content ?? page.content;
    }

    const normalized = this.normalizeContent(content ?? EMPTY_DOC);

    const { id } = await this.templateRepo.insertTemplate({
      title: title || null,
      description: dto.description ?? null,
      icon: icon ?? null,
      spaceId,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
      content: normalized.content,
      textContent: normalized.textContent,
    });

    return this.info(id, user, workspace);
  }

  async update(dto: UpdateTemplateDto, user: User, workspace: Workspace) {
    const template = await this.access.findEditableTemplate(
      dto.templateId,
      user,
      workspace,
    );

    const changes: Record<string, any> = { lastUpdatedById: user.id };
    if (dto.title !== undefined) changes.title = dto.title || null;
    if (dto.description !== undefined) changes.description = dto.description;
    if (dto.icon !== undefined) changes.icon = dto.icon || null;

    if (dto.spaceId !== undefined && dto.spaceId !== template.spaceId) {
      const spaceId = dto.spaceId ?? null;
      await this.assertSpaceInWorkspace(spaceId, workspace.id);
      // moving a template requires rights on the destination as well
      await this.access.assertCanEditScope(spaceId, user, workspace);
      changes.spaceId = spaceId;
    }

    if (dto.content !== undefined) {
      const normalized = this.normalizeContent(dto.content);
      changes.content = normalized.content;
      changes.textContent = normalized.textContent;
    }

    await this.templateRepo.updateTemplate(changes, template.id, workspace.id);
    return this.info(template.id, user, workspace);
  }

  async delete(templateId: string, user: User, workspace: Workspace) {
    const template = await this.access.findEditableTemplate(
      templateId,
      user,
      workspace,
    );
    await this.templateRepo.deleteTemplate(template.id, workspace.id);
  }

  private normalizeContent(content: any): {
    content: any;
    textContent: string;
  } {
    if (!content || typeof content !== 'object' || content.type !== 'doc') {
      throw new BadRequestException('Template content must be a document');
    }
    try {
      const parsed = parseDocumentJson(content, templateExtensions);
      return {
        content: parsed.content,
        textContent: jsonToText(parsed.content),
      };
    } catch {
      throw new BadRequestException('Invalid template content');
    }
  }

  private async assertSpaceInWorkspace(
    spaceId: string | null,
    workspaceId: string,
  ) {
    if (!spaceId) return;
    const space = await this.db
      .selectFrom('spaces')
      .select(['id'])
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!space) {
      throw new NotFoundException('Space not found');
    }
  }
}
