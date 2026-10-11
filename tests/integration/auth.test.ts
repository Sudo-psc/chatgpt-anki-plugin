import { afterEach, describe, expect, it } from 'vitest';
import { signAccessToken } from '../../src/mcp/auth/tokens.js';
import {
  callTool,
  initializeMcp,
  mcpPost,
  obtainToken,
  pkcePair,
  startTestApp,
  type TestApp,
} from '../helpers/test-app.js';

let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function expiredToken(testApp: TestApp): string {
  return signAccessToken({
    subject: 'owner',
    scopes: ['anki:read'],
    secret: testApp.config.auth.tokenSecret,
    issuer: testApp.config.issuer,
    audience: testApp.config.audience,
    ttlSeconds: -10,
  });
}

describe('MCP endpoint authentication (C7)', () => {
  it('returns 401 with WWW-Authenticate resource metadata when no token is sent', async () => {
    app = await startTestApp();
    const response = await mcpPost(app.baseUrl, undefined, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.status).toBe(401);
    const raw = response.body as { error: { message: string } };
    expect(raw.error.message).toContain('Unauthorized');
  });

  it('includes the WWW-Authenticate header pointing at protected resource metadata', async () => {
    app = await startTestApp();
    const response = await fetch(`${app.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(response.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource');
  });

  it('rejects non-Bearer schemes and garbage tokens with 401', async () => {
    app = await startTestApp();
    const basic = await fetch(`${app.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic abc' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(basic.status).toBe(401);

    const garbage = await mcpPost(app.baseUrl, 'garbage.token.value', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(garbage.status).toBe(401);
  });

  it('rejects expired tokens and wrong-audience tokens', async () => {
    app = await startTestApp();
    const expired = await mcpPost(app.baseUrl, expiredToken(app), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(expired.status).toBe(401);
    expect(JSON.stringify(expired.body)).toContain('expired');

    const wrongAudience = signAccessToken({
      subject: 'owner',
      scopes: ['anki:read'],
      secret: app.config.auth.tokenSecret,
      issuer: app.config.issuer,
      audience: 'https://other.example.com',
      ttlSeconds: 60,
    });
    const response = await mcpPost(app.baseUrl, wrongAudience, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).toContain('wrong_audience');
  });

  it('accepts a token obtained through the full PKCE flow', async () => {
    app = await startTestApp();
    const token = await obtainToken(app.baseUrl);
    await initializeMcp(app.baseUrl, token);
    const result = await callTool(app.baseUrl, token, 'list_decks', {});
    expect(result.status).toBe(200);
    expect(result.isError).toBe(false);
  });

  it('serves the consent page and handles deny', async () => {
    app = await startTestApp();
    const { challenge } = pkcePair();
    const query = new URLSearchParams({
      client_id: 'chatgpt',
      redirect_uri: 'http://localhost:3000/callback',
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'anki:read',
      state: 's1',
    });
    const page = await fetch(`${app.baseUrl}/oauth/authorize?${query}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Autorizar');
    expect(html).toContain('anki:read');

    const deny = await fetch(`${app.baseUrl}/oauth/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...Object.fromEntries(query), decision: 'deny' }),
      redirect: 'manual',
    });
    expect(deny.status).toBe(302);
    expect(deny.headers.get('location')).toContain('error=access_denied');
  });

  it('enforces PKCE: a wrong code_verifier cannot redeem the code', async () => {
    app = await startTestApp();
    const { challenge } = pkcePair();
    const approve = await fetch(`${app.baseUrl}/oauth/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'chatgpt',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'anki:read',
        decision: 'approve',
      }),
      redirect: 'manual',
    });
    const code = new URL(approve.headers.get('location') as string).searchParams.get('code') as string;
    const tokenResponse = await fetch(`${app.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: 'chatgpt',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: 'definitely-the-wrong-verifier',
      }),
    });
    expect(tokenResponse.status).toBe(400);
    expect(await tokenResponse.text()).toContain('PKCE verification failed');
  });

  it('enforces single-use authorization codes', async () => {
    app = await startTestApp();
    const { verifier, challenge } = pkcePair();
    const approve = await fetch(`${app.baseUrl}/oauth/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'chatgpt',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'anki:read',
        decision: 'approve',
      }),
      redirect: 'manual',
    });
    const code = new URL(approve.headers.get('location') as string).searchParams.get('code') as string;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: 'chatgpt',
      redirect_uri: 'http://localhost:3000/callback',
      code_verifier: verifier,
    });
    const first = await fetch(`${app.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    expect(first.status).toBe(200);
    const second = await fetch(`${app.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    expect(second.status).toBe(400);
    expect(await second.text()).toContain('already used');
  });

  it('rejects unsupported grants and unknown clients on the token endpoint', async () => {
    app = await startTestApp();
    const refresh = await fetch(`${app.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token' }),
    });
    expect(refresh.status).toBe(400);
    expect(await refresh.text()).toContain('unsupported_grant_type');

    const unknownClient = await fetch(`${app.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'x',
        client_id: 'nope',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: 'x',
      }),
    });
    expect(unknownClient.status).toBe(401);
  });

  it('supports dynamic client registration end to end', async () => {
    app = await startTestApp();
    const register = await fetch(`${app.baseUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
        client_name: 'ChatGPT Test',
      }),
    });
    expect(register.status).toBe(201);
    const client = (await register.json()) as { client_id: string };
    expect(client.client_id).toMatch(/^mcp_/);

    const token = await obtainToken(app.baseUrl, {
      clientId: client.client_id,
      redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      scope: 'anki:read',
    });
    const result = await callTool(app.baseUrl, token, 'list_decks', {});
    expect(result.isError).toBe(false);

    const evil = await fetch(`${app.baseUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://evil.example.com/cb'] }),
    });
    expect(evil.status).toBe(400);
  });

  it('supports a dev token for local testing (documented, dev-only)', async () => {
    app = await startTestApp({ env: { MCP_DEV_TOKEN: 'unit-dev-token-0123456789abcdef' } });
    const result = await callTool(app.baseUrl, 'unit-dev-token-0123456789abcdef', 'list_decks', {});
    expect(result.isError).toBe(false);
  });

  it('can run without auth when AUTH_REQUIRED=false (dev only)', async () => {
    app = await startTestApp({ env: { AUTH_REQUIRED: 'false' } });
    const result = await callTool(app.baseUrl, undefined, 'list_decks', {});
    expect(result.isError).toBe(false);
  });
});

describe('scope enforcement per operation (C7)', () => {
  it('allows reads with a read-only token and denies writes with FORBIDDEN', async () => {
    app = await startTestApp();
    const readToken = await obtainToken(app.baseUrl, { scope: 'anki:read' });
    const read = await callTool(app.baseUrl, readToken, 'list_decks', {});
    expect(read.isError).toBe(false);

    const write = await callTool(app.baseUrl, readToken, 'create_deck', { name: 'X' });
    expect(write.isError).toBe(true);
    expect(write.payload?.code).toBe('FORBIDDEN');
    expect(String(write.payload?.hint)).toContain('anki:write');
  });

  it('requires anki:review for review operations', async () => {
    app = await startTestApp();
    const readToken = await obtainToken(app.baseUrl, { scope: 'anki:read' });
    const denied = await callTool(app.baseUrl, readToken, 'get_due_cards', {});
    expect(denied.payload?.code).toBe('FORBIDDEN');
  });

  it('requires anki:admin for template management (not granted by default)', async () => {
    app = await startTestApp();
    const defaultToken = await obtainToken(app.baseUrl);
    const denied = await callTool(app.baseUrl, defaultToken, 'update_model_templates', { model: 'Basic', css: '.x{}' });
    expect(denied.payload?.code).toBe('FORBIDDEN');

    const adminToken = await obtainToken(app.baseUrl, { scope: 'anki:admin' });
    const allowed = await callTool(app.baseUrl, adminToken, 'update_model_templates', { model: 'Basic', css: '.x{}' });
    expect(allowed.isError).toBe(false);
  });
});
