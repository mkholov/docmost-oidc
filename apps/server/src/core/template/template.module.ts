import { Global, Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateAccessService } from './template-access.service';

/**
 * Community implementation of page templates on top of the existing
 * `templates` table. Global so the attachment controller can check
 * template upload permissions.
 */
@Global()
@Module({
  controllers: [TemplateController],
  providers: [TemplateService, TemplateAccessService],
  exports: [TemplateAccessService],
})
export class TemplateModule {}
