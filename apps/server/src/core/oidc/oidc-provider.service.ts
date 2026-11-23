import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  CreateOidcProviderDto,
  UpdateOidcProviderDto,
} from './dto/oidc-provider.dto';
import { OidcClientService } from './oidc-client.service';

export const OIDC_PROVIDER_TYPE = 'oidc';

export interface OidcProviderRecord {
  id: string;
  name: string;
  type: string;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  allowSignup: boolean;
  isEnabled: boolean;
  workspaceId: string;
  updatedAt: Date;
}

/** Shape returned to admins: the client secret never leaves the server. */
export interface OidcProviderView {
  id: string;
  name: string;
  type: string;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  hasClientSecret: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OidcProviderService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly oidcClientService: OidcClientService,
  ) {}

  async list(workspaceId: string): Promise<OidcProviderView[]> {
    const rows = await this.db
      .selectFrom('authProviders')
      .select([
        'id',
        'name',
        'type',
        'oidcIssuer',
        'oidcClientId',
        'oidcClientSecret',
        'allowSignup',
        'isEnabled',
        'createdAt',
        'updatedAt',
      ])
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();

    return rows.map((row) => this.toView(row));
  }

  async findEnabled(
    providerId: string,
    workspaceId: string,
  ): Promise<OidcProviderRecord | undefined> {
    return this.db
      .selectFrom('authProviders')
      .select([
        'id',
        'name',
        'type',
        'oidcIssuer',
        'oidcClientId',
        'oidcClientSecret',
        'allowSignup',
        'isEnabled',
        'workspaceId',
        'updatedAt',
      ])
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .executeTakeFirst() as Promise<OidcProviderRecord | undefined>;
  }

  async create(
    dto: CreateOidcProviderDto,
    creatorId: string,
    workspaceId: string,
  ): Promise<OidcProviderView> {
    const isEnabled = dto.isEnabled ?? false;
    if (isEnabled) {
      await this.assertDiscoverable(
        dto.oidcIssuer,
        dto.oidcClientId,
        dto.oidcClientSecret,
      );
    }

    const row = await this.db
      .insertInto('authProviders')
      .values({
        name: dto.name,
        type: OIDC_PROVIDER_TYPE,
        oidcIssuer: dto.oidcIssuer,
        oidcClientId: dto.oidcClientId,
        oidcClientSecret: dto.oidcClientSecret || null,
        allowSignup: dto.allowSignup ?? false,
        isEnabled,
        creatorId,
        workspaceId,
      })
      .returningAll()
      .executeTakeFirst();

    return this.toView(row);
  }

  async update(
    dto: UpdateOidcProviderDto,
    workspaceId: string,
  ): Promise<OidcProviderView> {
    const existing = await this.getOrThrow(dto.providerId, workspaceId);

    const next = {
      name: dto.name ?? existing.name,
      oidcIssuer: dto.oidcIssuer ?? existing.oidcIssuer,
      oidcClientId: dto.oidcClientId ?? existing.oidcClientId,
      oidcClientSecret: dto.oidcClientSecret
        ? dto.oidcClientSecret
        : existing.oidcClientSecret,
      allowSignup: dto.allowSignup ?? existing.allowSignup,
      isEnabled: dto.isEnabled ?? existing.isEnabled,
    };

    if (existing.isEnabled && !next.isEnabled) {
      await this.assertNotLastEnforcedProvider(existing.id, workspaceId);
    }

    if (next.isEnabled) {
      await this.assertDiscoverable(
        next.oidcIssuer,
        next.oidcClientId,
        next.oidcClientSecret,
      );
    }

    const row = await this.db
      .updateTable('authProviders')
      .set({ ...next, updatedAt: new Date() })
      .where('id', '=', existing.id)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();

    this.oidcClientService.invalidate(existing.id);
    return this.toView(row);
  }

  async delete(providerId: string, workspaceId: string): Promise<void> {
    const existing = await this.getOrThrow(providerId, workspaceId);
    if (existing.isEnabled) {
      await this.assertNotLastEnforcedProvider(existing.id, workspaceId);
    }

    // auth_accounts rows cascade with the provider
    await this.db
      .deleteFrom('authProviders')
      .where('id', '=', existing.id)
      .where('workspaceId', '=', workspaceId)
      .execute();

    this.oidcClientService.invalidate(existing.id);
  }

  private async getOrThrow(providerId: string, workspaceId: string) {
    const row = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundException('SSO provider not found');
    }
    return row;
  }

  /**
   * Refuse to remove the only way in when the workspace enforces SSO,
   * otherwise nobody (including admins) could sign in anymore.
   */
  private async assertNotLastEnforcedProvider(
    providerId: string,
    workspaceId: string,
  ) {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select(['enforceSso'])
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    if (!workspace?.enforceSso) return;

    const others = await this.db
      .selectFrom('authProviders')
      .select(['id'])
      .where('workspaceId', '=', workspaceId)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .where('id', '!=', providerId)
      .execute();

    if (others.length === 0) {
      throw new BadRequestException(
        'This is the last active SSO provider. Turn off "Enforce SSO" first.',
      );
    }
  }

  private async assertDiscoverable(
    issuer: string | null,
    clientId: string | null,
    clientSecret: string | null | undefined,
  ) {
    if (!issuer || !clientId) {
      throw new BadRequestException('Issuer URL and client ID are required');
    }
    try {
      await this.oidcClientService.discover(issuer, clientId, clientSecret);
    } catch (err: any) {
      throw new BadRequestException(
        `Could not load OpenID configuration from the issuer: ${err?.message ?? 'unknown error'}`,
      );
    }
  }

  private toView(row: any): OidcProviderView {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      oidcIssuer: row.oidcIssuer,
      oidcClientId: row.oidcClientId,
      hasClientSecret: !!row.oidcClientSecret,
      allowSignup: row.allowSignup,
      isEnabled: row.isEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
