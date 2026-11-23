import { Injectable, Logger } from '@nestjs/common';
import * as oidc from 'openid-client';

const DISCOVERY_TTL_MS = 60 * 60 * 1000;

interface CachedConfig {
  key: string;
  config: oidc.Configuration;
  expiresAt: number;
}

/**
 * Thin wrapper around openid-client so the rest of the module does not
 * depend on the library directly, and so discovery documents are cached.
 */
@Injectable()
export class OidcClientService {
  private readonly logger = new Logger(OidcClientService.name);
  private readonly cache = new Map<string, CachedConfig>();

  async discover(
    issuer: string,
    clientId: string,
    clientSecret?: string | null,
  ): Promise<oidc.Configuration> {
    const issuerUrl = new URL(issuer);
    const options: oidc.DiscoveryRequestOptions = {};

    if (issuerUrl.protocol === 'http:') {
      this.logger.warn(
        `OIDC issuer ${issuerUrl.origin} uses plain HTTP; only use this for local testing`,
      );
      options.execute = [oidc.allowInsecureRequests];
    }

    const clientAuth = clientSecret
      ? oidc.ClientSecretPost(clientSecret)
      : oidc.None();

    const config = await oidc.discovery(
      issuerUrl,
      clientId,
      undefined,
      clientAuth,
      options,
    );

    // Prefer client_secret_post, but fall back to client_secret_basic for
    // providers that only advertise the latter (e.g. some Okta setups).
    const methods = config.serverMetadata().token_endpoint_auth_methods_supported;
    if (
      clientSecret &&
      Array.isArray(methods) &&
      !methods.includes('client_secret_post') &&
      methods.includes('client_secret_basic')
    ) {
      const basic = new oidc.Configuration(
        config.serverMetadata(),
        clientId,
        undefined,
        oidc.ClientSecretBasic(clientSecret),
      );
      if (options.execute?.length) {
        oidc.allowInsecureRequests(basic);
      }
      return basic;
    }

    return config;
  }

  async getConfig(provider: {
    id: string;
    oidcIssuer: string;
    oidcClientId: string;
    oidcClientSecret?: string | null;
    updatedAt: Date;
  }): Promise<oidc.Configuration> {
    const key = [
      provider.oidcIssuer,
      provider.oidcClientId,
      provider.oidcClientSecret ?? '',
      new Date(provider.updatedAt).getTime(),
    ].join('|');

    const cached = this.cache.get(provider.id);
    if (cached && cached.key === key && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    const config = await this.discover(
      provider.oidcIssuer,
      provider.oidcClientId,
      provider.oidcClientSecret,
    );
    this.cache.set(provider.id, {
      key,
      config,
      expiresAt: Date.now() + DISCOVERY_TTL_MS,
    });
    return config;
  }

  invalidate(providerId: string) {
    this.cache.delete(providerId);
  }

  randomPKCECodeVerifier() {
    return oidc.randomPKCECodeVerifier();
  }

  calculatePKCECodeChallenge(verifier: string) {
    return oidc.calculatePKCECodeChallenge(verifier);
  }

  randomState() {
    return oidc.randomState();
  }

  randomNonce() {
    return oidc.randomNonce();
  }

  buildAuthorizationUrl(
    config: oidc.Configuration,
    params: Record<string, string>,
  ): URL {
    return oidc.buildAuthorizationUrl(config, params);
  }

  async exchangeCode(
    config: oidc.Configuration,
    currentUrl: URL,
    checks: { codeVerifier: string; state: string; nonce: string },
  ) {
    return oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
  }

  async fetchUserInfo(
    config: oidc.Configuration,
    accessToken: string,
    expectedSubject: string,
  ) {
    return oidc.fetchUserInfo(config, accessToken, expectedSubject);
  }
}
