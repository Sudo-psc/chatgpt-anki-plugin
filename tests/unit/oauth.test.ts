import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OAuthError, OAuthService } from '../../src/mcp/auth/oauth.js';

const ALLOWED = 'https://chatgpt.com/connector_platform_oauth_redirect';

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const TEST_SIGNING_SECRET = 'unit-signing-secret-0123456789abcdef';

function service(overrides: Partial<ConstructorParameters<typeof OAuthService>[0]> = {}): OAuthService {
  return new OAuthService({
    allowedRedirectUris: [ALLOWED, 'http://localhost:3000/callback'],
    defaultScopes: ['anki:read', 'anki:write', 'anki:review'],
    allowDcr: true,
    now: () => 1_700_000_000_000,
    signingSecret: TEST_SIGNING_SECRET,
    envClient: { clientId: 'chatgpt', redirectUris: [ALLOWED, 'http://localhost:3000/callback'] },
    ...overrides,
  });
}

function validParams(svc: OAuthService, overrides: Record<string, string> = {}) {
  const verifier = randomBytes(32).toString('base64url');
  return {
    params: {
      client_id: 'chatgpt',
      redirect_uri: ALLOWED,
      response_type: 'code',
      code_challenge: challengeFor(verifier),
      code_challenge_method: 'S256',
      scope: 'anki:read',
      state: 'abc',
      ...overrides,
    },
    verifier,
  };
}

describe('OAuthService.validateAuthorize', () => {
  it('accepts a valid request and echoes scope/state', () => {
    const svc = service();
    const { params } = validParams(svc);
    const result = svc.validateAuthorize(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope).toEqual(['anki:read']);
      expect(result.state).toBe('abc');
      expect(result.redirectUri).toBe(ALLOWED);
    }
  });

  it('defaults the scope when omitted', () => {
    const svc = service();
    const { params } = validParams(svc, { scope: '' });
    const result = svc.validateAuthorize({ ...params, scope: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scope).toEqual(['anki:read', 'anki:write', 'anki:review']);
  });

  it('rejects unknown clients without a redirect target', () => {
    const result = service().validateAuthorize(validParams(service()).params);
    const unknown = service().validateAuthorize({ ...validParams(service()).params, client_id: 'nope' });
    expect(result.ok).toBe(true);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.redirectUri).toBeUndefined();
  });

  it('rejects unregistered redirect_uri', () => {
    const svc = service();
    const { params } = validParams(svc, { redirect_uri: 'https://evil.example.com/cb' });
    const result = svc.validateAuthorize(params);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.redirectUri).toBeUndefined();
  });

  it('redirects supported error classes after redirect_uri validation', () => {
    const svc = service();
    const base = validParams(svc).params;
    for (const [patch, expectedError] of [
      [{ response_type: 'token' }, 'unsupported_response_type'],
      [{ code_challenge: 'short' }, 'invalid_request'],
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ scope: 'anki:admin anki:nope' }, 'invalid_scope'],
    ] as Array<[Record<string, string>, string]>) {
      const result = svc.validateAuthorize({ ...base, ...patch });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(expectedError);
        expect(result.redirectUri).toBe(ALLOWED);
        expect(result.state).toBe('abc');
      }
    }
  });
});

describe('OAuthService code exchange (PKCE)', () => {
  it('exchanges a code with the correct verifier', () => {
    const svc = service();
    const { params, verifier } = validParams(svc);
    const code = svc.createAuthorizationCode({
      clientId: 'chatgpt',
      redirectUri: ALLOWED,
      codeChallenge: params.code_challenge,
      scope: ['anki:read'],
      subject: 'owner',
    });
    const result = svc.exchangeCode({ code, clientId: 'chatgpt', redirectUri: ALLOWED, codeVerifier: verifier });
    expect(result).toEqual({ subject: 'owner', scope: ['anki:read'] });
  });

  it('rejects a wrong verifier', () => {
    const svc = service();
    const { params } = validParams(svc);
    const code = svc.createAuthorizationCode({
      clientId: 'chatgpt',
      redirectUri: ALLOWED,
      codeChallenge: params.code_challenge,
      scope: ['anki:read'],
      subject: 'owner',
    });
    expect(() =>
      svc.exchangeCode({ code, clientId: 'chatgpt', redirectUri: ALLOWED, codeVerifier: 'wrong-verifier' }),
    ).toThrowError(OAuthError);
  });

  it('enforces single use', () => {
    const svc = service();
    const { params, verifier } = validParams(svc);
    const code = svc.createAuthorizationCode({
      clientId: 'chatgpt',
      redirectUri: ALLOWED,
      codeChallenge: params.code_challenge,
      scope: ['anki:read'],
      subject: 'owner',
    });
    svc.exchangeCode({ code, clientId: 'chatgpt', redirectUri: ALLOWED, codeVerifier: verifier });
    expect(() =>
      svc.exchangeCode({ code, clientId: 'chatgpt', redirectUri: ALLOWED, codeVerifier: verifier }),
    ).toThrowError(/already used/);
  });

  it('rejects client and redirect mismatches and expiry (fresh code per attempt)', () => {
    let nowMs = 1_700_000_000_000;
    const svc = service({ now: () => nowMs, codeTtlMs: 1000 });
    const makeCode = (): { code: string; verifier: string } => {
      const { params, verifier } = validParams(svc);
      const code = svc.createAuthorizationCode({
        clientId: 'chatgpt',
        redirectUri: ALLOWED,
        codeChallenge: params.code_challenge,
        scope: ['anki:read'],
        subject: 'owner',
      });
      return { code, verifier };
    };

    const wrongClient = makeCode();
    expect(() =>
      svc.exchangeCode({ code: wrongClient.code, clientId: 'other', redirectUri: ALLOWED, codeVerifier: wrongClient.verifier }),
    ).toThrowError(/different client/);

    const wrongRedirect = makeCode();
    expect(() =>
      svc.exchangeCode({
        code: wrongRedirect.code,
        clientId: 'chatgpt',
        redirectUri: 'http://localhost:3000/callback',
        codeVerifier: wrongRedirect.verifier,
      }),
    ).toThrowError(/redirect_uri/);

    const expiring = makeCode();
    nowMs += 2000;
    expect(() =>
      svc.exchangeCode({ code: expiring.code, clientId: 'chatgpt', redirectUri: ALLOWED, codeVerifier: expiring.verifier }),
    ).toThrowError(/expired/);
  });

  it('revokes the code even when an exchange attempt fails (anti-bruteforce)', () => {
    const svc = service();
    const { params, verifier } = validParams(svc);
    const code = svc.createAuthorizationCode({
      clientId: 'chatgpt',
      redirectUri: ALLOWED,
      codeChallenge: params.code_challenge,
      scope: ['anki:read'],
      subject: 'owner',
    });
    expect(() =>
      svc.exchangeCode({ code, clientId: 'chatgpt', redirectUri: ALLOWED, codeVerifier: 'bad' }),
    ).toThrowError(/PKCE/);
    expect(() =>
      svc.exchangeCode({ code, clientId: 'chatgpt', redirectUri: ALLOWED, codeVerifier: verifier }),
    ).toThrowError(/already used/);
  });
});

describe('OAuthService dynamic client registration', () => {
  it('registers an allowlisted client', () => {
    const svc = service();
    const client = svc.registerClient({ redirect_uris: [ALLOWED], client_name: 'ChatGPT' });
    expect(client.clientId).toMatch(/^mcp_/);
    expect(svc.getClient(client.clientId)?.clientName).toBe('ChatGPT');
  });

  it('rejects invalid or third-party redirect URIs and accepts ChatGPT-hosted callbacks', () => {
    const svc = service();
    expect(() => svc.registerClient({ redirect_uris: ['https://evil.example.com/cb'] })).toThrowError(/not allowed/);
    expect(() => svc.registerClient({ redirect_uris: ['not a url'] })).toThrowError(/not a valid URL/);
    // Callbacks hospedados pelo ChatGPT (padrão do conector) são aceitos via DCR:
    const gptClient = svc.registerClient({ redirect_uris: ['https://chatgpt.com/connector/oauth/ws-123'] });
    expect(gptClient.dynamic).toBe(true);
    expect(gptClient.redirectUris).toEqual(['https://chatgpt.com/connector/oauth/ws-123']);
    // Registro sem redirect_uris também é aceito (o conector pode operar com callback padrão):
    const noRedirects = svc.registerClient({});
    expect(noRedirects.redirectUris).toEqual([]);
  });

  it('signed client ids survive restarts: reconstructed without any server state', () => {
    const first = service();
    const client = first.registerClient({ redirect_uris: [ALLOWED], client_name: 'ChatGPT' });

    // "Novo processo" (memória zerada): o client é reconstruído pela assinatura.
    const restarted = service();
    const restored = restarted.getClient(client.clientId);
    expect(restored).toBeDefined();
    expect(restored?.redirectUris).toEqual([ALLOWED]);
    expect(restored?.clientName).toBe('ChatGPT');
    expect(restored?.dynamic).toBe(true);

    // Assinatura adulterada é rejeitada.
    const tampered = `${client.clientId.slice(0, -4)}AAAA`;
    expect(restarted.getClient(tampered)).toBeUndefined();

    // Segredo diferente (outra instalação) rejeita o id.
    const otherSecret = service({ signingSecret: 'another-signing-secret-0123456789ab' });
    expect(otherSecret.getClient(client.clientId)).toBeUndefined();
  });

  it('dynamic clients accept ChatGPT-hosted redirects at authorize; env client stays strict', () => {
    const svc = service();
    const dynamic = svc.registerClient({});
    const { params } = validParams(svc);
    const result = svc.validateAuthorize({
      ...params,
      client_id: dynamic.clientId,
      redirect_uri: 'https://chatgpt.com/connector/oauth/abc-456',
    });
    expect(result.ok).toBe(true);

    const strict = svc.validateAuthorize({
      ...params,
      client_id: 'chatgpt', // cliente pré-registrado via env: igualdade exata apenas
      redirect_uri: 'https://chatgpt.com/connector/oauth/abc-456',
    });
    expect(strict.ok).toBe(false);
  });

  it('respects the allowDcr flag', () => {
    const svc = service({ allowDcr: false });
    expect(() => svc.registerClient({ redirect_uris: [ALLOWED] })).toThrowError(/disabled/);
  });
});
