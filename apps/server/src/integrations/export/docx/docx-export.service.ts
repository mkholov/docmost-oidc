import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { imageSize } from 'image-size';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page } from '@docmost/db/types/entity.types';
import { StorageService } from '../../storage/storage.service';
import { EnvironmentService } from '../../environment/environment.service';
import { LoadedImage, prosemirrorToDocx } from './prosemirror-to-docx';

const UUID_RE =
  /\/files\/(?:public\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Extracts the attachment id from a Docmost file URL. */
export function attachmentIdFromSrc(src: string): string | null {
  const match = typeof src === 'string' ? src.match(UUID_RE) : null;
  return match ? match[1].toLowerCase() : null;
}

/**
 * Community DOCX exporter. Images are embedded only when they are
 * attachments of the same page or space, so an export can never pull in
 * files the reader could not open from the page itself.
 */
@Injectable()
export class DocxExportService {
  private readonly logger = new Logger(DocxExportService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async exportPage(page: Page): Promise<Buffer> {
    return prosemirrorToDocx(page.content as any, {
      title: page.title || undefined,
      baseUrl: this.environmentService.getAppUrl(),
      loadImage: (src) => this.loadImage(src, page),
    });
  }

  private async loadImage(src: string, page: Page): Promise<LoadedImage | null> {
    const attachmentId = attachmentIdFromSrc(src);
    if (!attachmentId) return null;

    const attachment = await this.db
      .selectFrom('attachments')
      .select(['filePath', 'fileSize', 'pageId', 'spaceId', 'workspaceId'])
      .where('id', '=', attachmentId)
      .where('workspaceId', '=', page.workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (
      !attachment ||
      (attachment.pageId !== page.id && attachment.spaceId !== page.spaceId)
    ) {
      return null;
    }
    if (Number(attachment.fileSize ?? 0) > MAX_IMAGE_BYTES) return null;

    try {
      const data = await this.storageService.read(attachment.filePath);
      const type = imageSize(data).type;
      if (type === 'png' || type === 'gif' || type === 'bmp') {
        return { data, type };
      }
      if (type === 'jpg') return { data, type: 'jpg' };
      return null; // svg, webp, etc. are not supported by Word as-is
    } catch (err: any) {
      this.logger.debug(`Skipping image ${attachmentId}: ${err?.message}`);
      return null;
    }
  }
}
