import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PageRestrictionService } from './page-restriction.service';

const page = {
  id: 'p1',
  spaceId: 's1',
  workspaceId: 'w1',
  title: 'Secret',
  deletedAt: null,
};
const user: any = { id: 'u1' };
const workspace: any = { id: 'w1' };

function build(opts: {
  canView?: boolean;
  canEdit?: boolean;
  isSpaceAdmin?: boolean;
  restricted?: boolean;
  member?: { role: string } | null;
  writers?: number;
}) {
  const pageRepo: any = { findById: jest.fn().mockResolvedValue(page) };
  const repo: any = {
    findPageAccessByPageId: jest
      .fn()
      .mockResolvedValue(opts.restricted ? { id: 'pa1' } : undefined),
    findRestrictedAncestor: jest.fn().mockResolvedValue(undefined),
    insertPageAccess: jest.fn().mockResolvedValue({ id: 'pa-new' }),
    insertPagePermissions: jest.fn(),
    deletePageAccess: jest.fn(),
    findPagePermissionByUserId: jest.fn().mockResolvedValue(opts.member),
    findPagePermissionByGroupId: jest.fn().mockResolvedValue(opts.member),
    countWritersByPageAccessId: jest.fn().mockResolvedValue(opts.writers ?? 1),
    deletePagePermissionByUserId: jest.fn(),
    updatePagePermissionRole: jest.fn(),
  };
  const pageAccess: any = {
    validateCanViewWithPermissions: jest.fn(async () => {
      if (opts.canView === false) throw new ForbiddenException();
      return { canEdit: !!opts.canEdit, hasRestriction: !!opts.restricted };
    }),
  };
  const spaceAbility: any = {
    createForUser: jest.fn().mockResolvedValue({ can: () => !!opts.isSpaceAdmin }),
  };
  const trx = {};
  const db: any = {
    transaction: () => ({ execute: (fn: any) => fn(trx) }),
  };
  const ws: any = { invalidateSpaceRestrictionCache: jest.fn() };
  const collab: any = { recheckAccess: jest.fn() };
  const audit: any = { log: jest.fn() };
  const service = new PageRestrictionService(
    db,
    pageRepo,
    repo,
    pageAccess,
    spaceAbility,
    ws,
    collab,
    audit,
  );
  return { service, repo, ws, collab, audit };
}

describe('PageRestrictionService', () => {
  it('lets page editors restrict a page and keeps them as writer', async () => {
    const { service, repo, ws, collab } = build({ canEdit: true });
    await service.restrict('p1', user, workspace);

    expect(repo.insertPageAccess).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'p1', accessLevel: 'restricted' }),
      expect.anything(),
    );
    expect(repo.insertPagePermissions).toHaveBeenCalledWith(
      [expect.objectContaining({ userId: 'u1', role: 'writer' })],
      expect.anything(),
    );
    expect(ws.invalidateSpaceRestrictionCache).toHaveBeenCalledWith('s1');
    expect(collab.recheckAccess).toHaveBeenCalledWith({ pageIds: ['p1'] });
  });

  it('rejects readers', async () => {
    const { service } = build({ canEdit: false });
    await expect(service.restrict('p1', user, workspace)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets space admins manage even without page access', async () => {
    const { service, repo } = build({
      canView: false,
      isSpaceAdmin: true,
      restricted: true,
    });
    await service.unrestrict('p1', user, workspace);
    expect(repo.deletePageAccess).toHaveBeenCalledWith('p1');
  });

  it('hides restriction info from people without access', async () => {
    const { service } = build({ canView: false });
    await expect(service.info('p1', user, workspace)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to remove or demote the last writer', async () => {
    const { service } = build({
      canEdit: true,
      restricted: true,
      member: { role: 'writer' },
      writers: 1,
    });
    await expect(
      service.removeMember({ pageId: 'p1', userId: 'u2' }, user, workspace),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateRole(
        { pageId: 'p1', userId: 'u2', role: 'reader' },
        user,
        workspace,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes a writer when another writer remains and rechecks that user', async () => {
    const { service, repo, collab } = build({
      canEdit: true,
      restricted: true,
      member: { role: 'writer' },
      writers: 2,
    });
    await service.removeMember({ pageId: 'p1', userId: 'u2' }, user, workspace);
    expect(repo.deletePagePermissionByUserId).toHaveBeenCalledWith('pa1', 'u2');
    expect(collab.recheckAccess).toHaveBeenCalledWith({
      pageIds: ['p1'],
      userIds: ['u2'],
    });
  });

  it('requires a restriction before adding members', async () => {
    const { service } = build({ canEdit: true, restricted: false });
    await expect(
      service.addMembers(
        { pageId: 'p1', userIds: ['u2'], role: 'reader' },
        user,
        workspace,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
