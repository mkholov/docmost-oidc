import { NotFoundException } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { TemplateAccessService } from '../template/template-access.service';

jest.mock(
  '../../ee/template/services/template-access.service',
  () => {
    throw new Error('not bundled');
  },
  { virtual: true },
);

describe('AttachmentController without the EE template module', () => {
  it('falls back to the community template access service', async () => {
    const template = { id: 'template-id', spaceId: null };
    const accessService = {
      findEditableTemplate: jest.fn().mockResolvedValue(template),
    };
    const moduleRef = { get: jest.fn().mockReturnValue(accessService) };
    const controller = new (AttachmentController as any)(
      ...Array(13).fill({}),
      moduleRef,
    );

    await expect(
      controller.findEditableTemplate(
        'template-id',
        { id: 'user-id' },
        { id: 'workspace-id' },
      ),
    ).resolves.toBe(template);
    expect(moduleRef.get).toHaveBeenCalledWith(TemplateAccessService, {
      strict: false,
    });
  });

  it('answers 404 when no template access service is registered', async () => {
    const moduleRef = {
      get: jest.fn(() => {
        throw new Error('not found');
      }),
    };
    const controller = new (AttachmentController as any)(
      ...Array(13).fill({}),
      moduleRef,
    );

    await expect(
      controller.findEditableTemplate(
        'template-id',
        { id: 'user-id' },
        { id: 'workspace-id' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
