import { Module } from '@nestjs/common';
import { PageRestrictionController } from './page-restriction.controller';
import { PageRestrictionService } from './page-restriction.service';

/** Community management API for page-level access restrictions. */
@Module({
  controllers: [PageRestrictionController],
  providers: [PageRestrictionService],
})
export class PageRestrictionModule {}
