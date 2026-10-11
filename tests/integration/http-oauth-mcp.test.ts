import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAnkiAdapter } from '../../src/anki/index.js';
import { startBridgeClient } from '../../src/bridge/cli.js';
import { loadConfig } from '../../src/infra/config.js';
import { computeS256CodeChallenge } from '../../src/mcp/auth/oauth.js';
import { createHttpApp } from '../../src/mcp/http-server.js';

describe('HTTP Server, OAuth 2.1 + PKCE, Streamable HTTP MCP & WebSocket Bridge Integration', () => {
  it('completes OAuth 2.1 discovery, DCR, PKCE S256 token exchange, rejects invalid tokens with 401 (C7), and serves /mcp', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '0',
      PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
      ANKI_BACKEND: 'memory',
      OAUTH_JWT_SECRET: 'integration-test-secret-key-at-least-32-bytes!!',
      OAUTH_AUTHORIZE_PIN: 'test-pin-1234',
      MCP_ALLOW_UNAUTHENTICATED: '0',
    });
    const { adapter } = createAnkiAdapter(config);
    const { app } = createHttpApp({ config, anki: adapter });
    const request = supertest(app);

    // 1. Healthcheck & compliance pages
    const healthRes = await request.get('/health').expect(200);
    expect(healthRes.body.status).toBe('ok');

    await request.get('/privacy').expect(200);
    await request.get('/terms').expect(200);
    await request.get('/metrics').expect(200);

    // 2. OAuth 2.1 Discovery (RFC 9728 & RFC 8414)
    const prmRes = await request.get('/.well-known/oauth-protected-resource').expect(200);
    expect(prmRes.body.resource).toBe('http://127.0.0.1:3000/mcp');

    const asMetaRes = await request.get('/.well-known/oauth-authorization-server').expect(200);
    expect(asMetaRes.body.code_challenge_methods_supported).toEqual(['S256']);

    // 3. Unauthenticated request to /mcp must return 401 with WWW-Authenticate header (C7)
    const unauthRes = await request
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .expect(401);
    expect(unauthRes.headers['www-authenticate']).toContain('resource_metadata=');

    // Invalid token must return 401
    await request
      .post('/mcp')
      .set('Authorization', 'Bearer invalid.jwt.token')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .expect(401);

    // 4. Dynamic Client Registration (RFC 7591)
    const dcrRes = await request
      .post('/oauth/register')
      .send({
        client_name: 'ChatGPT Test Client',
        redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
      })
      .expect(201);
    const clientId = dcrRes.body.client_id as string;
    expect(clientId).toMatch(/^client_/);

    // 5. Authorization Code + PKCE (S256)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = computeS256CodeChallenge(codeVerifier);
    const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';

    // Render HTML consent page on GET without PIN
    const consentHtmlRes = await request
      .get('/oauth/authorize')
      .query({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        scope: 'anki:read anki:write anki:review anki:delete',
        state: 'xyz-state',
      })
      .expect(200);
    expect(consentHtmlRes.text).toContain('Conectar ChatGPT ao seu Anki');

    // Submit consent via POST with PIN
    const authorizeRes = await request
      .post('/oauth/authorize')
      .type('form')
      .send({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        scope: 'anki:read anki:write anki:review anki:delete',
        state: 'xyz-state',
        pin: 'test-pin-1234',
      })
      .expect(302);

    const locationUrl = new URL(authorizeRes.headers.location!);
    const authCode = locationUrl.searchParams.get('code')!;
    expect(authCode).toMatch(/^ac_/);
    expect(locationUrl.searchParams.get('state')).toBe('xyz-state');

    // Wrong code_verifier must fail PKCE validation
    await request
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code: authCode,
        code_verifier: 'wrong-verifier',
        redirect_uri: redirectUri,
      })
      .expect(400);

    // Issue a fresh code and exchange with valid PKCE code_verifier
    const authorizeRes2 = await request
      .get('/oauth/authorize')
      .query({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        scope: 'anki:read anki:write anki:review anki:delete',
        pin: 'test-pin-1234',
      })
      .expect(302);
    const validCode = new URL(authorizeRes2.headers.location!).searchParams.get('code')!;

    const tokenRes = await request
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code: validCode,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      })
      .expect(200);

    const accessToken = tokenRes.body.access_token as string;
    const refreshToken = tokenRes.body.refresh_token as string;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    // 6. Refresh token flow
    const refreshedRes = await request
      .post('/oauth/token')
      .send({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
      .expect(200);
    expect(refreshedRes.body.access_token).toBeTruthy();

    // 7. Call POST /mcp with Bearer token (initialize + tools/list)
    const mcpInitRes = await request
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'chatgpt-test', version: '1.0.0' },
        },
      })
      .expect(200);
    expect(mcpInitRes.text).toContain('chatgpt-anki-plugin');

    // 8. Revoke token and confirm subsequent /mcp call returns 401
    await request.post('/oauth/revoke').send({ token: accessToken }).expect(200);
    await request
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
      .expect(401);
  });

  it('tunnels JSON-RPC calls over the WebSocket /bridge endpoint end-to-end', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '0',
      ANKI_BACKEND: 'bridge',
      BRIDGE_SHARED_TOKEN: 'bridge-secret-xyz',
      MCP_ALLOW_UNAUTHENTICATED: '1',
    });

    const { adapter, bridgeAdapter } = createAnkiAdapter(config);
    const { createHttpServer } = createHttpApp({ config, anki: adapter, bridgeAdapter });
    const httpServer = createHttpServer();

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (httpServer.address() as AddressInfo).port;

    // Mock a fake local AnkiConnect HTTP server
    const fakeAnkiServer = createHttpApp({
      config: loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', MCP_ALLOW_UNAUTHENTICATED: '1' }),
      anki: adapter,
    }).app;
    fakeAnkiServer.post('/ankiconnect-mock', (req, res) => {
      const action = req.body?.action;
      if (action === 'version') {
        res.json({ result: 6, error: null });
        return;
      }
      if (action === 'deckNamesAndIds') {
        res.json({ result: { Default: 1, 'Ponte::Remota': 2 }, error: null });
        return;
      }
      if (action === 'getDeckStats') {
        res.json({
          result: {
            '1': { deck_id: 1, name: 'Default', new_count: 0, learn_count: 0, review_count: 0, total_in_deck: 0 },
            '2': {
              deck_id: 2,
              name: 'Ponte::Remota',
              new_count: 3,
              learn_count: 1,
              review_count: 5,
              total_in_deck: 9,
            },
          },
          error: null,
        });
        return;
      }
      res.json({ result: null, error: null });
    });

    const mockAnkiHttp = await new Promise<ReturnType<typeof fakeAnkiServer.listen>>((resolve) => {
      const srv = fakeAnkiServer.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const mockAnkiPort = (mockAnkiHttp.address() as AddressInfo).port;

    const bridgeClient = startBridgeClient({
      serverUrl: `ws://127.0.0.1:${port}/bridge`,
      token: 'bridge-secret-xyz',
      ankiConnectUrl: `http://127.0.0.1:${mockAnkiPort}/ankiconnect-mock`,
    });

    // Wait for WebSocket tunnel to connect
    for (let i = 0; i < 30 && !bridgeAdapter?.isBridgeConnected(); i++) {
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(bridgeAdapter?.isBridgeConnected()).toBe(true);

    const decks = await adapter.listDecks();
    expect(decks.map((d) => d.name)).toContain('Ponte::Remota');

    bridgeClient.close();
    mockAnkiHttp.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});
