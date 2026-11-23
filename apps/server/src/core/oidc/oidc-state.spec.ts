import {
  DEFAULT_POST_LOGIN_PATH,
  OidcFlowState,
  sanitizeRedirectPath,
  signOidcFlowState,
  verifyOidcFlowState,
} from './oidc-state';

const secret = 'test-secret-0123456789';

function flow(overrides: Partial<OidcFlowState> = {}): OidcFlowState {
  return {
    providerId: '0195c3d2-0000-7000-8000-000000000001',
    state: 'state-value',
    nonce: 'nonce-value',
    codeVerifier: 'verifier-value',
    redirect: '/s/general',
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

describe('oidc flow state cookie', () => {
  it('round-trips a signed payload', () => {
    const payload = flow();
    const token = signOidcFlowState(payload, secret);
    expect(verifyOidcFlowState(token, secret)).toEqual(payload);
  });

  it('rejects a token signed with another secret', () => {
    const token = signOidcFlowState(flow(), secret);
    expect(verifyOidcFlowState(token, 'other-secret')).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signOidcFlowState(flow(), secret);
    const [, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify(flow({ redirect: '//evil.example' })),
    ).toString('base64url');
    expect(verifyOidcFlowState(`${forged}.${sig}`, secret)).toBeNull();
  });

  it('rejects an expired payload', () => {
    const token = signOidcFlowState(flow({ exp: Date.now() - 1 }), secret);
    expect(verifyOidcFlowState(token, secret)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyOidcFlowState(undefined, secret)).toBeNull();
    expect(verifyOidcFlowState('', secret)).toBeNull();
    expect(verifyOidcFlowState('abc', secret)).toBeNull();
    expect(verifyOidcFlowState('a.b.c', secret)).toBeNull();
  });
});

describe('sanitizeRedirectPath', () => {
  it.each([
    ['/s/general/p/abc', '/s/general/p/abc'],
    ['/home?x=1', '/home?x=1'],
  ])('keeps relative path %s', (input, expected) => {
    expect(sanitizeRedirectPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/foo\nbar',
  ])('falls back for unsafe value %p', (input) => {
    expect(sanitizeRedirectPath(input as any)).toBe(DEFAULT_POST_LOGIN_PATH);
  });
});
