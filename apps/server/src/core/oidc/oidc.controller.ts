import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { addMilliseconds } from 'date-fns';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { OidcAuthService, OidcLoginError } from './oidc-auth.service';
import { OidcProviderService } from './oidc-provider.service';
import {
  CreateOidcProviderDto,
  OidcProviderIdDto,
  UpdateOidcProviderDto,
} from './dto/oidc-provider.dto';
import {
  OIDC_FLOW_COOKIE,
  OIDC_FLOW_TTL_MS,
  OIDC_ROUTE_PREFIX,
} from './oidc-state';

@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard, JwtAuthGuard)
@Controller('oidc')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidcAuthService: OidcAuthService,
    private readonly providerService: OidcProviderService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
  ) {}

  /* ----------------------------- sign-in flow ----------------------------- */

  @Public()
  @Get(':providerId/login')
  async login(
    @Param('providerId', new ParseUUIDPipe()) providerId: string,
    @Query('redirect') redirect: string | undefined,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    try {
      const { authorizationUrl, flowCookie } =
        await this.oidcAuthService.startLogin(providerId, workspace, redirect);

      res.setCookie(OIDC_FLOW_COOKIE, flowCookie, {
        httpOnly: true,
        sameSite: 'lax',
        path: OIDC_ROUTE_PREFIX,
        secure: this.environmentService.isHttps(),
        expires: addMilliseconds(new Date(), OIDC_FLOW_TTL_MS),
      });
      return res.redirect(authorizationUrl, 302);
    } catch (err) {
      return this.redirectWithError(res, err);
    }
  }

  @Public()
  @Get(':providerId/callback')
  async callback(
    @Param('providerId', new ParseUUIDPipe()) providerId: string,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const flowCookie = req.cookies?.[OIDC_FLOW_COOKIE];
    res.clearCookie(OIDC_FLOW_COOKIE, { path: OIDC_ROUTE_PREFIX });

    try {
      const { authToken, redirect } = await this.oidcAuthService.handleCallback(
        {
          providerId,
          workspace,
          requestUrl: req.url,
          flowCookie,
        },
      );

      res.setCookie('authToken', authToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: this.environmentService.getCookieExpiresIn(),
        secure: this.environmentService.isHttps(),
      });
      return res.redirect(redirect, 302);
    } catch (err) {
      return this.redirectWithError(res, err);
    }
  }

  private redirectWithError(res: FastifyReply, err: unknown) {
    let code = 'sso_failed';
    if (err instanceof OidcLoginError) {
      code = err.code;
      this.logger.warn(`OIDC sign-in failed (${err.code}): ${err.message}`);
    } else {
      this.logger.error('OIDC sign-in failed', err as Error);
    }
    return res.redirect(`/login?sso_error=${encodeURIComponent(code)}`, 302);
  }

  /* ---------------------------- admin endpoints --------------------------- */

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  async listProviders(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return {
      callbackUrlTemplate: this.oidcAuthService.getCallbackUrl('{providerId}'),
      items: await this.providerService.list(workspace.id),
    };
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @HttpCode(HttpStatus.OK)
  @Post('providers/create')
  async createProvider(
    @Body() dto: CreateOidcProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.providerService.create(dto, user.id, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @HttpCode(HttpStatus.OK)
  @Post('providers/update')
  async updateProvider(
    @Body() dto: UpdateOidcProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.providerService.update(dto, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @HttpCode(HttpStatus.OK)
  @Post('providers/delete')
  async deleteProvider(
    @Body() dto: OidcProviderIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    await this.providerService.delete(dto.providerId, workspace.id);
  }

  private assertCanManage(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }
}
