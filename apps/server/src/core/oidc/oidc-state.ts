import { createHmac, timingSafeEqual } from 'node:crypto';

export const OIDC_FLOW_COOKIE = 'oidc_flow';
export const OIDC_ROUTE_PREFIX = '/api/oidc';
export const OIDC_FLOW_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_POST_LOGIN_PATH = '/home';

/**
 * Data that must survive the round trip to the identity provider.
 * It lives in a short-lived, HMAC-signed, httpOnly cookie so the
 * server stays stateless between the login and callback requests.
 */
export interface OidcFlowState {
  providerId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirect: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`oidc-flow.${body}`)
    .digest('base64url');
}

export function signOidcFlowState(
  payload: OidcFlowState,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyOidcFlowState(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): OidcFlowState | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }

  let payload: OidcFlowState;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.providerId !== 'string' ||
    typeof payload.state !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.codeVerifier !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp < now
  ) {
    return null;
  }

  return payload;
}

/**
 * Only allow same-origin relative paths as post-login targets to
 * prevent open redirects (e.g. "//evil.com" or "/\\evil.com").
 */
export function sanitizeRedirectPath(redirect?: string | null): string {
  if (!redirect || typeof redirect !== 'string') return DEFAULT_POST_LOGIN_PATH;
  if (redirect.length > 2048) return DEFAULT_POST_LOGIN_PATH;
  if (!redirect.startsWith('/')) return DEFAULT_POST_LOGIN_PATH;
  if (redirect.startsWith('//') || redirect.startsWith('/\\')) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(redirect)) return DEFAULT_POST_LOGIN_PATH;
  return redirect;
}
