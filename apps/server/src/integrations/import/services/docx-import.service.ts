import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import * as mammoth from 'mammoth';
import { v7 as uuid7 } from 'uuid';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../storage/storage.service';
import { getAttachmentFolderPath } from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
};

/**
 * Word heading/quote/code styles commonly found in Russian and English
 * documents, mapped onto HTML the page importer understands.
 */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Заголовок'] => h1:fresh",
  "p[style-name='Подзаголовок'] => h2:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p[style-name='Цитата'] => blockquote:fresh",
  "p[style-name='Code'] => pre:separator('\\n')",
  "p[style-name='HTML Preformatted'] => pre:separator('\\n')",
  "r[style-name='Code Char'] => code",
  "r[style-name='HTML Code'] => code",
];

export interface DocxImportResult {
  html: string;
  warnings: string[];
}

/**
 * Community DOCX importer: converts a Word document to HTML with mammoth
 * and stores embedded images as attachments of the page being created.
 */
@Injectable()
export class DocxImportService {
  private readonly logger = new Logger(DocxImportService.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async convertDocxToHtml(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const { html } = await this.convert(fileBuffer, {
      workspaceId,
      spaceId,
      pageId,
      userId,
    });
    return html;
  }

  async convert(
    fileBuffer: Buffer,
    target: {
      workspaceId: string;
      spaceId: string;
      pageId: string;
      userId: string;
    },
  ): Promise<DocxImportResult> {
    let imageIndex = 0;

    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        styleMap: STYLE_MAP,
        convertImage: mammoth.images.imgElement(async (image) => {
          imageIndex += 1;
          try {
            const buffer = await image.readAsBuffer();
            const src = await this.saveImage(
              buffer,
              image.contentType,
              `image-${imageIndex}`,
              target,
            );
            return { src };
          } catch (err: any) {
            this.logger.warn(`Skipping DOCX image: ${err?.message}`);
            return { src: '' };
          }
        }),
      },
    );

    const warnings = result.messages
      .filter((m) => m.type === 'warning')
      .map((m) => m.message);
    if (warnings.length) {
      this.logger.debug(`DOCX import warnings: ${warnings.slice(0, 10).join('; ')}`);
    }

    // drop images that failed to upload
    const html = result.value.replace(/<img[^>]*src=""[^>]*>/g, '');
    return { html, warnings };
  }

  private async saveImage(
    buffer: Buffer,
    contentType: string,
    baseName: string,
    target: {
      workspaceId: string;
      spaceId: string;
      pageId: string;
      userId: string;
    },
  ): Promise<string> {
    const ext = IMAGE_EXTENSIONS[contentType?.toLowerCase()] ?? '.png';
    const fileName = `${baseName}${ext}`;
    const attachmentId = uuid7();
    const filePath = `${getAttachmentFolderPath(
      AttachmentType.File,
      target.workspaceId,
    )}/${attachmentId}/${fileName}`;

    await this.storageService.upload(filePath, buffer);

    await this.db
      .insertInto('attachments')
      .values({
        id: attachmentId,
        filePath,
        fileName,
        fileSize: buffer.length,
        mimeType: contentType || 'image/png',
        type: 'file',
        fileExt: ext,
        creatorId: target.userId,
        workspaceId: target.workspaceId,
        pageId: target.pageId,
        spaceId: target.spaceId,
      })
      .execute();

    return `/api/files/${attachmentId}/${fileName}`;
  }
}
