import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PagePermissionRole } from '../../common/helpers/types/permission';

const ROLES = [PagePermissionRole.READER, PagePermissionRole.WRITER];

export class PageRestrictionPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class PageRestrictionMembersDto extends PaginationOptions {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class AddPageMembersDto extends PageRestrictionPageDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  @IsIn(ROLES)
  role: string;
}

export class PageMemberDto extends PageRestrictionPageDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class UpdatePageMemberRoleDto extends PageMemberDto {
  @IsIn(ROLES)
  role: string;
}
