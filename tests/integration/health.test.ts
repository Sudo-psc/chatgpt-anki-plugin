import { afterEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/test-app.js';

let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('health, routes and static assets', () => {
  it('serves /health with 200 and server metadata', async () => {
    app = await startTestApp();
    const response = await fetch(`${app.baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.name).toBe('chatgpt-anki-mcp');
    expect(typeof body.version).toBe('string');
  });

  it('serves /ready as ready when AnkiConnect responds', async () => {
    app = await startTestApp();
    const response = await fetch(`${app.baseUrl}/ready`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ready');
  });

  it('serves /ready as degraded (503) when AnkiConnect is unreachable', async () => {
    app = await startTestApp({
      env: { ANKI_CONNECT_URL: 'http://127.0.0.1:1', ANKI_TIMEOUT_MS: '500' },
    });
    const response = await fetch(`${app.baseUrl}/ready`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('degraded');
    expect(body.anki).toBe('unreachable');
  });

  it('serves a JSON index at / and 404 for unknown routes', async () => {
    app = await startTestApp();
    const index = await fetch(`${app.baseUrl}/`);
    expect(index.status).toBe(200);
    expect(((await index.json()) as { mcp_endpoint: string }).mcp_endpoint).toBe('/mcp');
    const missing = await fetch(`${app.baseUrl}/nope`);
    expect(missing.status).toBe(404);
  });

  it('exposes OAuth discovery metadata', async () => {
    app = await startTestApp();
    const as = await fetch(`${app.baseUrl}/.well-known/oauth-authorization-server`);
    const asBody = (await as.json()) as Record<string, unknown>;
    expect(asBody.issuer).toBe('http://localhost:8080');
    expect(asBody.code_challenge_methods_supported).toEqual(['S256']);
    expect(asBody.registration_endpoint).toBe('http://localhost:8080/oauth/register');

    const prm = await fetch(`${app.baseUrl}/.well-known/oauth-protected-resource`);
    const prmBody = (await prm.json()) as Record<string, unknown>;
    expect(prmBody.resource).toBe('http://localhost:8080');
    expect(prmBody.authorization_servers).toEqual(['http://localhost:8080']);
  });

  it('serves widgets with CSP and rejects unknown or traversing paths', async () => {
    app = await startTestApp();
    const decks = await fetch(`${app.baseUrl}/widgets/decks.html`);
    expect(decks.status).toBe(200);
    expect(decks.headers.get('content-type')).toContain('text/html');
    expect(decks.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await decks.text()).toContain('Baralhos');

    const unknown = await fetch(`${app.baseUrl}/widgets/nope.html`);
    expect(unknown.status).toBe(404);

    const traversal = await fetch(`${app.baseUrl}/widgets/..%2F..%2Fpackage.json`);
    expect(traversal.status).toBe(404);
  });

  it('rejects oversized bodies with 413', async () => {
    app = await startTestApp({ env: { MAX_BODY_BYTES: '1024' } });
    const response = await fetch(`${app.baseUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['x'.repeat(2000)] }),
    });
    expect(response.status).toBe(413);
  });

  it('rejects invalid JSON on /mcp with a parse error (authenticated)', async () => {
    app = await startTestApp({ env: { MCP_DEV_TOKEN: 'unit-dev-token-0123456789abcdef' } });
    const response = await fetch(`${app.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer unit-dev-token-0123456789abcdef',
        accept: 'application/json',
      },
      body: '{not json',
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it('rejects GET on /mcp with 405 (JSON response mode, no SSE stream)', async () => {
    app = await startTestApp();
    const response = await fetch(`${app.baseUrl}/mcp`, { method: 'GET' });
    expect(response.status).toBe(405);
  });

  it('blocks disallowed Origins with 403', async () => {
    app = await startTestApp();
    const response = await fetch(`${app.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(response.status).toBe(403);
  });
});
