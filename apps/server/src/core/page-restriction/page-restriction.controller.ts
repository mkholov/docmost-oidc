import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { PageRestrictionService } from './page-restriction.service';
import {
  AddPageMembersDto,
  PageMemberDto,
  PageRestrictionMembersDto,
  PageRestrictionPageDto,
  UpdatePageMemberRoleDto,
} from './page-restriction.dto';

@UseGuards(JwtAuthGuard)
@Controller('page-access')
export class PageRestrictionController {
  constructor(private readonly service: PageRestrictionService) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(
    @Body() dto: PageRestrictionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.info(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  members(
    @Body() dto: PageRestrictionMembersDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.members(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  restrict(
    @Body() dto: PageRestrictionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.restrict(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unrestrict')
  unrestrict(
    @Body() dto: PageRestrictionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.unrestrict(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('add')
  add(
    @Body() dto: AddPageMembersDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.addMembers(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  async remove(
    @Body() dto: PageMemberDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.service.removeMember(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('role')
  async role(
    @Body() dto: UpdatePageMemberRoleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.service.updateRole(dto, user, workspace);
  }
}
