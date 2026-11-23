import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SessionService } from '../session/session.service';
import { SignupService } from '../auth/services/signup.service';
import { isUserDisabled } from '../../common/helpers';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { OidcClientService } from './oidc-client.service';
import { OidcProviderRecord, OidcProviderService } from './oidc-provider.service';
import {
  OIDC_FLOW_TTL_MS,
  OIDC_ROUTE_PREFIX,
  OidcFlowState,
  sanitizeRedirectPath,
  signOidcFlowState,
  verifyOidcFlowState,
} from './oidc-state';

export type OidcErrorCode =
  | 'provider_not_found'
  | 'invalid_state'
  | 'idp_error'
  | 'token_exchange_failed'
  | 'email_missing'
  | 'email_not_verified'
  | 'signup_disabled'
  | 'domain_not_allowed'
  | 'account_conflict'
  | 'user_disabled';

export class OidcLoginError extends Error {
  constructor(
    public readonly code: OidcErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface OidcProfile {
  sub: string;
  email: string | null;
  emailVerified: boolean | undefined;
  name: string | null;
}

@Injectable()
export class OidcAuthService {
  private readonly logger = new Logger(OidcAuthService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly providerService: OidcProviderService,
    private readonly oidcClient: OidcClientService,
    private readonly environmentService: EnvironmentService,
    private readonly sessionService: SessionService,
    private readonly signupService: SignupService,
    private readonly userRepo: UserRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  getCallbackUrl(providerId: string): string {
    return `${this.environmentService.getAppUrl()}${OIDC_ROUTE_PREFIX}/${providerId}/callback`;
  }

  /** Builds the IdP authorization URL and the signed flow-state cookie. */
  async startLogin(
    providerId: string,
    workspace: Workspace,
    redirect?: string,
  ): Promise<{ authorizationUrl: string; flowCookie: string }> {
    const provider = await this.getProvider(providerId, workspace.id);
    const config = await this.oidcClient.getConfig(provider);

    const codeVerifier = this.oidcClient.randomPKCECodeVerifier();
    const codeChallenge =
      await this.oidcClient.calculatePKCECodeChallenge(codeVerifier);
    const state = this.oidcClient.randomState();
    const nonce = this.oidcClient.randomNonce();

    const url = this.oidcClient.buildAuthorizationUrl(config, {
      redirect_uri: this.getCallbackUrl(provider.id),
      scope: 'openid email profile',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    const flow: OidcFlowState = {
      providerId: provider.id,
      state,
      nonce,
      codeVerifier,
      redirect: sanitizeRedirectPath(redirect),
      exp: Date.now() + OIDC_FLOW_TTL_MS,
    };

    return {
      authorizationUrl: url.href,
      flowCookie: signOidcFlowState(flow, this.environmentService.getAppSecret()),
    };
  }

  /**
   * Completes the authorization code flow and returns a Docmost session
   * token plus the path the user wanted to reach.
   */
  async handleCallback(opts: {
    providerId: string;
    workspace: Workspace;
    requestUrl: string;
    flowCookie: string | undefined;
  }): Promise<{ authToken: string; redirect: string }> {
    const flow = verifyOidcFlowState(
      opts.flowCookie,
      this.environmentService.getAppSecret(),
    );
    if (!flow || flow.providerId !== opts.providerId) {
      throw new OidcLoginError('invalid_state');
    }

    const provider = await this.getProvider(opts.providerId, opts.workspace.id);
    const config = await this.oidcClient.getConfig(provider);

    // openid-client validates redirect_uri against the URL it was given,
    // so rebuild it on the public app URL rather than the proxy-facing one.
    const currentUrl = new URL(
      opts.requestUrl,
      this.environmentService.getAppUrl(),
    );

    if (currentUrl.searchParams.has('error')) {
      throw new OidcLoginError(
        'idp_error',
        `${currentUrl.searchParams.get('error')}: ${currentUrl.searchParams.get('error_description') ?? ''}`,
      );
    }

    let profile: OidcProfile;
    try {
      const tokens = await this.oidcClient.exchangeCode(config, currentUrl, {
        codeVerifier: flow.codeVerifier,
        state: flow.state,
        nonce: flow.nonce,
      });
      const claims = tokens.claims();
      if (!claims?.sub) {
        throw new Error('ID token has no subject');
      }

      let source: Record<string, unknown> = claims;
      if (!claims.email && tokens.access_token) {
        source = {
          ...(await this.oidcClient.fetchUserInfo(
            config,
            tokens.access_token,
            claims.sub,
          )),
          ...claims,
        };
      }
      profile = extractProfile(claims.sub, source);
    } catch (err: any) {
      if (err instanceof OidcLoginError) throw err;
      this.logger.warn(`OIDC token exchange failed: ${err?.message}`);
      throw new OidcLoginError('token_exchange_failed', err?.message);
    }

    const user = await this.resolveUser(provider, opts.workspace, profile);

    await this.userRepo.updateLastLogin(user.id, opts.workspace.id);
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source: 'oidc', providerId: provider.id },
    });

    const authToken = await this.sessionService.createSessionAndToken(user);
    return { authToken, redirect: flow.redirect };
  }

  async resolveUser(
    provider: OidcProviderRecord,
    workspace: Workspace,
    profile: OidcProfile,
  ): Promise<User> {
    if (!profile.email) {
      throw new OidcLoginError('email_missing');
    }
    if (profile.emailVerified === false) {
      throw new OidcLoginError('email_not_verified');
    }

    const linked = await this.db
      .selectFrom('authAccounts')
      .select(['userId'])
      .where('authProviderId', '=', provider.id)
      .where('providerUserId', '=', profile.sub)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    let user: User | undefined;

    if (linked) {
      user = await this.userRepo.findById(linked.userId, workspace.id);
    } else {
      user = await this.userRepo.findByEmail(profile.email, workspace.id);

      if (user) {
        const otherLink = await this.db
          .selectFrom('authAccounts')
          .select(['id'])
          .where('authProviderId', '=', provider.id)
          .where('userId', '=', user.id)
          .executeTakeFirst();
        if (otherLink) {
          // The user is already linked to a different identity at this IdP.
          throw new OidcLoginError('account_conflict');
        }
      } else {
        user = await this.signupUser(provider, workspace, profile);
      }

      await this.db
        .insertInto('authAccounts')
        .values({
          userId: user.id,
          providerUserId: profile.sub,
          authProviderId: provider.id,
          workspaceId: workspace.id,
        })
        .execute();
    }

    if (!user || isUserDisabled(user)) {
      throw new OidcLoginError('user_disabled');
    }

    return user;
  }

  private async signupUser(
    provider: OidcProviderRecord,
    workspace: Workspace,
    profile: OidcProfile,
  ): Promise<User> {
    if (!provider.allowSignup) {
      throw new OidcLoginError('signup_disabled');
    }

    const domain = profile.email.split('@')[1]?.toLowerCase();
    if (
      workspace.emailDomains?.length > 0 &&
      !workspace.emailDomains.includes(domain)
    ) {
      throw new OidcLoginError('domain_not_allowed');
    }

    const user = await this.signupService.signup(
      {
        name: profile.name?.slice(0, 50) || undefined,
        email: profile.email,
        // SSO users never see this password; they can reset it if they
        // are later allowed to use password login.
        password: randomBytes(32).toString('base64url'),
      },
      workspace.id,
    );

    await this.userRepo.updateUser(
      { hasGeneratedPassword: true, emailVerifiedAt: new Date() },
      user.id,
      workspace.id,
    );

    return user;
  }

  private async getProvider(providerId: string, workspaceId: string) {
    const provider = await this.providerService.findEnabled(
      providerId,
      workspaceId,
    );
    if (!provider || !provider.oidcIssuer || !provider.oidcClientId) {
      throw new OidcLoginError('provider_not_found');
    }
    return provider;
  }
}

export function extractProfile(
  sub: string,
  claims: Record<string, unknown>,
): OidcProfile {
  const rawEmail =
    (typeof claims.email === 'string' && claims.email) ||
    // Azure AD / Entra often only sends preferred_username or upn
    (typeof claims.preferred_username === 'string' &&
      claims.preferred_username.includes('@') &&
      claims.preferred_username) ||
    (typeof claims.upn === 'string' && claims.upn.includes('@') && claims.upn) ||
    null;

  const email = rawEmail ? rawEmail.trim().toLowerCase() : null;

  let emailVerified: boolean | undefined;
  if (typeof claims.email_verified === 'boolean') {
    emailVerified = claims.email_verified;
  } else if (claims.email_verified === 'true' || claims.email_verified === 'false') {
    emailVerified = claims.email_verified === 'true';
  }

  const given = typeof claims.given_name === 'string' ? claims.given_name : '';
  const family = typeof claims.family_name === 'string' ? claims.family_name : '';
  const name =
    (typeof claims.name === 'string' && claims.name.trim()) ||
    `${given} ${family}`.trim() ||
    null;

  return { sub, email, emailVerified, name };
}
