import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TemplateAccessService } from './template-access.service';

function build(opts: {
  template?: any;
  isWorkspaceAdmin?: boolean;
  spaceRead?: boolean;
  spaceEdit?: boolean;
}) {
  const templateRepo: any = {
    findById: jest.fn().mockResolvedValue(opts.template),
  };
  const spaceAbility: any = {
    createForUser: jest.fn().mockResolvedValue({
      can: (action: string) =>
        action === 'read' ? !!opts.spaceRead : !!opts.spaceEdit,
    }),
  };
  const workspaceAbility: any = {
    createForUser: jest.fn().mockReturnValue({
      can: () => !!opts.isWorkspaceAdmin,
    }),
  };
  return new TemplateAccessService(templateRepo, spaceAbility, workspaceAbility);
}

const user: any = { id: 'u1' };
const workspace: any = { id: 'w1' };

describe('TemplateAccessService', () => {
  it('lets every member view workspace templates', async () => {
    const svc = build({ template: { id: 't', spaceId: null } });
    await expect(
      svc.findViewableTemplate('t', user, workspace),
    ).resolves.toMatchObject({ id: 't' });
  });

  it('hides space templates from non-members', async () => {
    const svc = build({ template: { id: 't', spaceId: 's' }, spaceRead: false });
    await expect(
      svc.findViewableTemplate('t', user, workspace),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only lets workspace admins edit workspace templates', async () => {
    const member = build({ template: { id: 't', spaceId: null } });
    await expect(
      member.findEditableTemplate('t', user, workspace),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const admin = build({
      template: { id: 't', spaceId: null },
      isWorkspaceAdmin: true,
    });
    await expect(
      admin.findEditableTemplate('t', user, workspace),
    ).resolves.toMatchObject({ id: 't' });
  });

  it('lets space editors edit space templates, but not readers', async () => {
    const reader = build({
      template: { id: 't', spaceId: 's' },
      spaceRead: true,
      spaceEdit: false,
    });
    await expect(
      reader.findEditableTemplate('t', user, workspace),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const writer = build({
      template: { id: 't', spaceId: 's' },
      spaceRead: true,
      spaceEdit: true,
    });
    await expect(
      writer.findEditableTemplate('t', user, workspace),
    ).resolves.toMatchObject({ id: 't' });
  });

  it('returns 404 for unknown templates', async () => {
    const svc = build({ template: undefined });
    await expect(
      svc.findViewableTemplate('missing', user, workspace),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
