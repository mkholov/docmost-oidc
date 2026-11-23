import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { Transform, TransformFnParams } from 'class-transformer';

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

export class TemplateIdDto {
  @IsUUID()
  templateId: string;
}

export class ListTemplatesDto extends PaginationOptions {
  /** A space id, "workspace" for workspace-wide templates, or omitted for all. */
  @IsOptional()
  @IsString()
  scope?: string;
}

export class CreateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  /** null / omitted = available in the whole workspace. */
  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;

  /** ProseMirror JSON document. */
  @IsOptional()
  @IsObject()
  content?: Record<string, any>;

  /** Copy title, icon and content from an existing page. */
  @IsOptional()
  @IsUUID()
  fromPageId?: string;
}

export class UpdateTemplateDto extends TemplateIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, any>;
}

export class TemplateInfoDto extends TemplateIdDto {
  @IsOptional()
  @IsBoolean()
  includeContent?: boolean;
}

export const TEMPLATE_SCOPE_WORKSPACE = 'workspace';
