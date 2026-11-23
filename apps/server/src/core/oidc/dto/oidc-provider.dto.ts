import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateOidcProviderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name: string;

  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  @Transform(trim)
  oidcIssuer: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trim)
  oidcClientId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  oidcClientSecret?: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateOidcProviderDto {
  @IsUUID()
  providerId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  @Transform(trim)
  oidcIssuer?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trim)
  oidcClientId?: string;

  /** Empty or omitted keeps the stored secret. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  oidcClientSecret?: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class OidcProviderIdDto {
  @IsUUID()
  providerId: string;
}
