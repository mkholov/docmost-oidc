import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import {
  PageAccessLevel,
  PagePermissionRole,
} from '../../common/helpers/types/permission';
import { WsService } from '../../ws/ws.service';
import { CollabAccessService } from '../../collaboration/services/collab-access.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AddPageMembersDto,
  PageMemberDto,
  PageRestrictionMembersDto,
  UpdatePageMemberRoleDto,
} from './page-restriction.dto';

export interface PageRestrictionInfo {
  pageId: string;
  spaceId: string;
  /** this page has its own restriction */
  isRestricted: boolean;
  /** nearest restricted ancestor, if access is limited by a parent page */
  inheritedFrom: { pageId: string; slugId: string; title: string | null } | null;
  canManage: boolean;
  canEdit: boolean;
}

/**
 * Community management API for page-level restrictions. Enforcement
 * (page access checks, tree filtering, collab rechecks) already lives in
 * the core; this only creates and edits the restriction records.
 *
 * Who can manage restrictions on a page:
 * - members who can edit the page (space writers on an unrestricted page,
 *   page writers on a restricted one);
 * - space admins, even without page access, so a page can never become
 *   unrecoverable.
 */
@Injectable()
export class PageRestrictionService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly wsService: WsService,
    private readonly collabAccessService: CollabAccessService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async info(pageId: string, user: User, workspace: Workspace) {
    const page = await this.getPage(pageId, workspace);
    const { canView, canEdit, isSpaceAdmin } = await this.getAccess(page, user);
    if (!canView && !isSpaceAdmin) {
      throw new NotFoundException('Page not found');
    }

    const access = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    const ancestor = await this.pagePermissionRepo.findRestrictedAncestor(page.id);
    let inheritedFrom: PageRestrictionInfo['inheritedFrom'] = null;
    if (ancestor && ancestor.depth > 0) {
      const parent = await this.pageRepo.findById(ancestor.pageId);
      if (parent) {
        inheritedFrom = {
          pageId: parent.id,
          slugId: parent.slugId,
          title: parent.title,
        };
      }
    }

    return {
      pageId: page.id,
      spaceId: page.spaceId,
      isRestricted: !!access,
      inheritedFrom,
      canManage: canEdit || isSpaceAdmin,
      canEdit,
    } satisfies PageRestrictionInfo;
  }

  async members(dto: PageRestrictionMembersDto, user: User, workspace: Workspace) {
    const page = await this.getPage(dto.pageId, workspace);
    const { canView, isSpaceAdmin } = await this.getAccess(page, user);
    if (!canView && !isSpaceAdmin) {
      throw new NotFoundException('Page not found');
    }

    const access = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    if (!access) {
      return {
        items: [],
        meta: {
          limit: dto.limit,
          hasNextPage: false,
          hasPrevPage: false,
          nextCursor: null,
          prevCursor: null,
        },
      };
    }
    return this.pagePermissionRepo.getPagePermissionsPaginated(access.id, dto);
  }

  async restrict(pageId: string, user: User, workspace: Workspace) {
    const page = await this.getPage(pageId, workspace);
    await this.assertCanManage(page, user);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    if (existing) return this.info(page.id, user, workspace);

    await executeTx(this.db, async (trx) => {
      const access = await this.pagePermissionRepo.insertPageAccess(
        {
          pageId: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          accessLevel: PageAccessLevel.RESTRICTED,
          creatorId: user.id,
        },
        trx,
      );
      // the person restricting keeps access, so nobody locks themselves out
      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: access.id,
            userId: user.id,
            role: PagePermissionRole.WRITER,
            addedById: user.id,
          },
        ],
        trx,
      );
    });

    await this.afterChange(page, { pageIds: [page.id] });
    this.audit(AuditEvent.PAGE_RESTRICTED, page);
    return this.info(page.id, user, workspace);
  }

  async unrestrict(pageId: string, user: User, workspace: Workspace) {
    const page = await this.getPage(pageId, workspace);
    await this.assertCanManage(page, user);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    if (existing) {
      await this.pagePermissionRepo.deletePageAccess(page.id);
      await this.afterChange(page, { pageIds: [page.id] });
      this.audit(AuditEvent.PAGE_RESTRICTION_REMOVED, page);
    }
    return this.info(page.id, user, workspace);
  }

  async addMembers(dto: AddPageMembersDto, user: User, workspace: Workspace) {
    const page = await this.getPage(dto.pageId, workspace);
    await this.assertCanManage(page, user);
    const access = await this.getRestrictionOrThrow(page.id);

    const userIds = [...new Set(dto.userIds ?? [])];
    const groupIds = [...new Set(dto.groupIds ?? [])];
    if (!userIds.length && !groupIds.length) {
      throw new BadRequestException('Select at least one user or group');
    }

    const validUsers = userIds.length
      ? await this.db
          .selectFrom('users')
          .select('id')
          .where('id', 'in', userIds)
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .execute()
      : [];
    const validGroups = groupIds.length
      ? await this.db
          .selectFrom('groups')
          .select('id')
          .where('id', 'in', groupIds)
          .where('workspaceId', '=', workspace.id)
          .execute()
      : [];
    if (
      validUsers.length !== userIds.length ||
      validGroups.length !== groupIds.length
    ) {
      throw new BadRequestException('Some users or groups were not found');
    }

    const existing = await this.db
      .selectFrom('pagePermissions')
      .select(['userId', 'groupId'])
      .where('pageAccessId', '=', access.id)
      .execute();
    const existingUsers = new Set(existing.map((e) => e.userId).filter(Boolean));
    const existingGroups = new Set(existing.map((e) => e.groupId).filter(Boolean));

    const rows = [
      ...userIds
        .filter((id) => !existingUsers.has(id))
        .map((userId) => ({
          pageAccessId: access.id,
          userId,
          role: dto.role,
          addedById: user.id,
        })),
      ...groupIds
        .filter((id) => !existingGroups.has(id))
        .map((groupId) => ({
          pageAccessId: access.id,
          groupId,
          role: dto.role,
          addedById: user.id,
        })),
    ];
    await this.pagePermissionRepo.insertPagePermissions(rows);

    await this.afterChange(page, { pageIds: [page.id] });
    this.audit(AuditEvent.PAGE_PERMISSION_ADDED, page, {
      userIds,
      groupIds,
      role: dto.role,
    });
    return { added: rows.length };
  }

  async removeMember(dto: PageMemberDto, user: User, workspace: Workspace) {
    const page = await this.getPage(dto.pageId, workspace);
    await this.assertCanManage(page, user);
    const access = await this.getRestrictionOrThrow(page.id);
    const target = await this.getMemberOrThrow(access.id, dto);

    if (target.role === PagePermissionRole.WRITER) {
      await this.assertNotLastWriter(access.id);
    }

    if (dto.userId) {
      await this.pagePermissionRepo.deletePagePermissionByUserId(
        access.id,
        dto.userId,
      );
    } else {
      await this.pagePermissionRepo.deletePagePermissionByGroupId(
        access.id,
        dto.groupId,
      );
    }

    await this.afterChange(page, {
      pageIds: [page.id],
      userIds: dto.userId ? [dto.userId] : [],
    });
    this.audit(AuditEvent.PAGE_PERMISSION_REMOVED, page, {
      userId: dto.userId,
      groupId: dto.groupId,
    });
  }

  async updateRole(dto: UpdatePageMemberRoleDto, user: User, workspace: Workspace) {
    const page = await this.getPage(dto.pageId, workspace);
    await this.assertCanManage(page, user);
    const access = await this.getRestrictionOrThrow(page.id);
    const target = await this.getMemberOrThrow(access.id, dto);

    if (target.role === dto.role) return;
    if (
      target.role === PagePermissionRole.WRITER &&
      dto.role !== PagePermissionRole.WRITER
    ) {
      await this.assertNotLastWriter(access.id);
    }

    await this.pagePermissionRepo.updatePagePermissionRole(access.id, dto.role, {
      userId: dto.userId,
      groupId: dto.groupId,
    });

    await this.afterChange(page, {
      pageIds: [page.id],
      userIds: dto.userId ? [dto.userId] : [],
    });
    this.audit(AuditEvent.PAGE_PERMISSION_ROLE_CHANGED, page, {
      userId: dto.userId,
      groupId: dto.groupId,
      role: dto.role,
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  private async getPage(pageId: string, workspace: Workspace): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async getAccess(page: Page, user: User) {
    let isSpaceAdmin = false;
    try {
      const ability = await this.spaceAbility.createForUser(user, page.spaceId);
      isSpaceAdmin = ability.can(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Settings,
      );
    } catch {
      isSpaceAdmin = false;
    }

    let canView = true;
    let canEdit = false;
    try {
      const result = await this.pageAccessService.validateCanViewWithPermissions(
        page,
        user,
      );
      canEdit = result.canEdit;
    } catch {
      canView = false;
    }
    return { canView, canEdit, isSpaceAdmin };
  }

  private async assertCanManage(page: Page, user: User) {
    const { canEdit, isSpaceAdmin } = await this.getAccess(page, user);
    if (!canEdit && !isSpaceAdmin) {
      throw new ForbiddenException(
        'You need edit access to this page to change who can see it',
      );
    }
  }

  private async getRestrictionOrThrow(pageId: string) {
    const access = await this.pagePermissionRepo.findPageAccessByPageId(pageId);
    if (!access) {
      throw new BadRequestException('This page is not restricted');
    }
    return access;
  }

  private async getMemberOrThrow(pageAccessId: string, dto: PageMemberDto) {
    if (!!dto.userId === !!dto.groupId) {
      throw new BadRequestException('Specify either a user or a group');
    }
    const member = dto.userId
      ? await this.pagePermissionRepo.findPagePermissionByUserId(
          pageAccessId,
          dto.userId,
        )
      : await this.pagePermissionRepo.findPagePermissionByGroupId(
          pageAccessId,
          dto.groupId,
        );
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  private async assertNotLastWriter(pageAccessId: string) {
    const writers =
      await this.pagePermissionRepo.countWritersByPageAccessId(pageAccessId);
    if (writers <= 1) {
      throw new BadRequestException(
        'A restricted page needs at least one member who can edit',
      );
    }
  }

  private async afterChange(
    page: Page,
    recheck: { pageIds?: string[]; userIds?: string[] },
  ) {
    // realtime events and open editors re-evaluate access
    await this.wsService.invalidateSpaceRestrictionCache(page.spaceId);
    await this.collabAccessService.recheckAccess(recheck);
  }

  private audit(event: string, page: Page, metadata: Record<string, any> = {}) {
    this.auditService.log({
      event: event as any,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { title: page.title, ...metadata },
    });
  }
}
