import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Template, User, Workspace } from '@docmost/db/types/entity.types';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';

/**
 * Access rules for templates:
 * - workspace-wide templates (spaceId = null): every member can view and
 *   use them; only workspace admins can create, edit or delete them.
 * - space templates: space members can view and use them; members who can
 *   edit pages in that space can create, edit or delete them.
 */
@Injectable()
export class TemplateAccessService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  async canView(
    spaceId: string | null,
    user: User,
  ): Promise<boolean> {
    if (!spaceId) return true;
    try {
      const ability = await this.spaceAbility.createForUser(user, spaceId);
      return ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page);
    } catch {
      // not a member of the space
      return false;
    }
  }

  async canEdit(
    spaceId: string | null,
    user: User,
    workspace: Workspace,
  ): Promise<boolean> {
    if (!spaceId) {
      const ability = this.workspaceAbility.createForUser(user, workspace);
      return ability.can(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Settings,
      );
    }
    try {
      const ability = await this.spaceAbility.createForUser(user, spaceId);
      return ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
    } catch {
      return false;
    }
  }

  async assertCanEditScope(
    spaceId: string | null,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    if (!(await this.canEdit(spaceId, user, workspace))) {
      throw new ForbiddenException(
        spaceId
          ? 'You need edit access to this space to manage its templates'
          : 'Only workspace admins can manage workspace templates',
      );
    }
  }

  async findViewableTemplate(
    templateId: string,
    user: User,
    workspace: Workspace,
    opts?: { includeContent?: boolean },
  ): Promise<Template> {
    const template = await this.templateRepo.findById(templateId, workspace.id, {
      includeContent: opts?.includeContent,
    });
    if (!template || !(await this.canView(template.spaceId, user))) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  /** Used by the attachment controller for template image uploads. */
  async findEditableTemplate(
    templateId: string,
    user: User,
    workspace: Workspace,
  ): Promise<Template> {
    const template = await this.findViewableTemplate(
      templateId,
      user,
      workspace,
    );
    await this.assertCanEditScope(template.spaceId, user, workspace);
    return template;
  }
}
