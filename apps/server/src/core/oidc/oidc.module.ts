import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OidcController } from './oidc.controller';
import { OidcAuthService } from './oidc-auth.service';
import { OidcProviderService } from './oidc-provider.service';
import { OidcClientService } from './oidc-client.service';

/**
 * Community implementation of OpenID Connect single sign-on.
 * Uses the existing auth_providers / auth_accounts tables.
 */
@Module({
  imports: [AuthModule],
  controllers: [OidcController],
  providers: [OidcAuthService, OidcProviderService, OidcClientService],
})
export class OidcModule {}
