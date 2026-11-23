import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { ApiKeyScope } from '../../../common/decorators/api-key-scope.decorator';
import { PageAccessService } from '../../../core/page/page-access/page-access.service';
import { getPageTitle, sanitizeFileName } from '../../../common/helpers';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import { AUDIT_SERVICE, IAuditService } from '../../audit/audit.service';
import { DocxExportService } from './docx-export.service';
import { IsString, IsNotEmpty } from 'class-validator';

class DocxExportDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

@Controller()
export class DocxExportController {
  constructor(
    private readonly docxExportService: DocxExportService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @ApiKeyScope('read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('docx-export')
  async exportDocx(
    @Body() dto: DocxExportDto,
    @AuthUser() user: User,
    @Res() res: FastifyReply,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
    });
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);
    await this.pageAccessService.validateCanExport(
      page.spaceId,
      page.workspaceId,
    );

    const buffer = await this.docxExportService.exportPage(page);

    this.auditService.log({
      event: AuditEvent.PAGE_EXPORTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        format: 'docx',
        spaceId: page.spaceId,
      },
    });

    const fileName =
      sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) +
      '.docx';

    res.headers({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':
        'attachment; filename="' + encodeURIComponent(fileName) + '"',
    });
    res.send(buffer);
  }
}
