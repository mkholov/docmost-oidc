// openid-client is ESM-only; the logic under test does not need it.
jest.mock('openid-client', () => ({}));

import { OidcAuthService, extractProfile } from './oidc-auth.service';

describe('extractProfile', () => {
  it('reads standard claims', () => {
    expect(
      extractProfile('sub-1', {
        email: ' Jane@Example.COM ',
        email_verified: true,
        name: 'Jane Doe',
      }),
    ).toEqual({
      sub: 'sub-1',
      email: 'jane@example.com',
      emailVerified: true,
      name: 'Jane Doe',
    });
  });

  it('falls back to preferred_username / upn and given+family name', () => {
    expect(
      extractProfile('sub-2', {
        preferred_username: 'john@corp.example',
        given_name: 'John',
        family_name: 'Smith',
      }),
    ).toEqual({
      sub: 'sub-2',
      email: 'john@corp.example',
      emailVerified: undefined,
      name: 'John Smith',
    });

    expect(extractProfile('sub-3', { upn: 'a@b.example' }).email).toBe(
      'a@b.example',
    );
  });

  it('ignores a preferred_username that is not an email', () => {
    expect(
      extractProfile('sub-4', { preferred_username: 'jdoe' }).email,
    ).toBeNull();
  });

  it('parses string email_verified', () => {
    expect(
      extractProfile('s', { email: 'a@b.c', email_verified: 'false' })
        .emailVerified,
    ).toBe(false);
  });
});

/** Minimal stand-in for the Kysely query builder used by resolveUser. */
function fakeDb(state: { links: any[] }) {
  const inserted: any[] = [];
  const db: any = {
    selectFrom: () => {
      const filters: Record<string, unknown> = {};
      const chain: any = {
        select: () => chain,
        where: (col: string, _op: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        executeTakeFirst: async () =>
          state.links.find(
            (l) =>
              l.authProviderId === filters.authProviderId &&
              (filters.providerUserId === undefined ||
                l.providerUserId === filters.providerUserId) &&
              (filters.userId === undefined || l.userId === filters.userId),
          ),
      };
      return chain;
    },
    insertInto: () => ({
      values: (v: any) => ({
        execute: async () => {
          inserted.push(v);
          state.links.push(v);
        },
      }),
    }),
  };
  return { db, inserted };
}

describe('OidcAuthService.resolveUser', () => {
  const workspace: any = { id: 'ws-1', emailDomains: [] };
  const provider: any = { id: 'prov-1', allowSignup: false };
  const existingUser = { id: 'user-1', email: 'jane@example.com' };

  function build(opts: {
    links?: any[];
    userByEmail?: any;
    userById?: any;
    allowSignup?: boolean;
    emailDomains?: string[];
  }) {
    const { db, inserted } = fakeDb({ links: opts.links ?? [] });
    const userRepo: any = {
      findByEmail: jest.fn().mockResolvedValue(opts.userByEmail),
      findById: jest.fn().mockResolvedValue(opts.userById),
      updateUser: jest.fn().mockResolvedValue(undefined),
    };
    const signupService: any = {
      signup: jest
        .fn()
        .mockImplementation(async (dto) => ({ id: 'new-user', ...dto })),
    };
    const service = new OidcAuthService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      signupService,
      userRepo,
      { log: jest.fn() } as any,
    );
    return { service, inserted, userRepo, signupService };
  }

  const profile = {
    sub: 'idp-sub-1',
    email: 'jane@example.com',
    emailVerified: true,
    name: 'Jane',
  };

  it('uses an existing link', async () => {
    const { service, inserted } = build({
      links: [
        {
          authProviderId: 'prov-1',
          providerUserId: 'idp-sub-1',
          userId: 'user-1',
        },
      ],
      userById: existingUser,
    });
    await expect(
      service.resolveUser(provider, workspace, profile),
    ).resolves.toBe(existingUser);
    expect(inserted).toHaveLength(0);
  });

  it('links an existing user by email', async () => {
    const { service, inserted } = build({ userByEmail: existingUser });
    await expect(
      service.resolveUser(provider, workspace, profile),
    ).resolves.toBe(existingUser);
    expect(inserted).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        providerUserId: 'idp-sub-1',
        authProviderId: 'prov-1',
      }),
    ]);
  });

  it('refuses to link a user already bound to another identity', async () => {
    const { service } = build({
      userByEmail: existingUser,
      links: [
        { authProviderId: 'prov-1', providerUserId: 'other', userId: 'user-1' },
      ],
    });
    await expect(
      service.resolveUser(provider, workspace, profile),
    ).rejects.toMatchObject({ code: 'account_conflict' });
  });

  it('rejects unknown users when signup is disabled', async () => {
    const { service, signupService } = build({});
    await expect(
      service.resolveUser(provider, workspace, profile),
    ).rejects.toMatchObject({ code: 'signup_disabled' });
    expect(signupService.signup).not.toHaveBeenCalled();
  });

  it('creates users when signup is allowed', async () => {
    const { service, signupService, userRepo, inserted } = build({});
    const user = await service.resolveUser(
      { ...provider, allowSignup: true },
      workspace,
      profile,
    );
    expect(user.id).toBe('new-user');
    expect(signupService.signup).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com', name: 'Jane' }),
      'ws-1',
    );
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ hasGeneratedPassword: true }),
      'new-user',
      'ws-1',
    );
    expect(inserted).toHaveLength(1);
  });

  it('enforces workspace email domains on signup', async () => {
    const { service } = build({});
    await expect(
      service.resolveUser(
        { ...provider, allowSignup: true },
        { ...workspace, emailDomains: ['corp.example'] },
        profile,
      ),
    ).rejects.toMatchObject({ code: 'domain_not_allowed' });
  });

  it('rejects unverified or missing emails', async () => {
    const { service } = build({ userByEmail: existingUser });
    await expect(
      service.resolveUser(provider, workspace, {
        ...profile,
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ code: 'email_not_verified' });
    await expect(
      service.resolveUser(provider, workspace, { ...profile, email: null }),
    ).rejects.toMatchObject({ code: 'email_missing' });
  });

  it('rejects deactivated users', async () => {
    const { service } = build({
      userByEmail: { ...existingUser, deactivatedAt: new Date() },
    });
    await expect(
      service.resolveUser(provider, workspace, profile),
    ).rejects.toMatchObject({ code: 'user_disabled' });
  });
});
