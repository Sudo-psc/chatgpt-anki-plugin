import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { AnkiGateway } from '../../src/anki/index.js';
import { MockAnkiConnect } from '../../src/anki/mock/mock-anki-connect.js';
import { seedCollection } from '../../src/anki/mock/seed.js';
import { loadConfig, type AppConfig } from '../../src/infra/config.js';
import { createLogger } from '../../src/infra/logger.js';
import { OAuthService } from '../../src/mcp/auth/oauth.js';
import { FixedWindowLimiter } from '../../src/mcp/ratelimit.js';

export interface TestAppOptions {
  env?: Record<string, string>;
  configureMock?: (mock: MockAnkiConnect) => void;
}

export interface TestApp {
  baseUrl: string;
  config: AppConfig;
  mock: MockAnkiConnect;
  mockUrl: string;
  close: () => Promise<void>;
}

const TEST_TOKEN_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const mock = MockAnkiConnect.withSeed(seedCollection());
  options.configureMock?.(mock);
  const mockListener = await mock.listen(0);

  const env: Record<string, string> = {
    NODE_ENV: 'test',
    PUBLIC_BASE_URL: 'http://localhost:8080',
    LOG_LEVEL: 'error',
    ANKI_BACKEND: 'connect',
    ANKI_CONNECT_URL: mockListener.url,
    TOKEN_SECRET: TEST_TOKEN_SECRET,
    RATE_LIMIT_PER_MINUTE: '10000',
    AUTH_REQUIRED: 'true',
    ...options.env,
  };
  const config = loadConfig(env as NodeJS.ProcessEnv);

  const logger = createLogger('error', () => {});
  const gateway = new AnkiGateway({
    url: config.anki.url,
    timeoutMs: config.anki.timeoutMs,
  });
  const oauth = new OAuthService({
    allowedRedirectUris: config.auth.allowedRedirectUris,
    defaultScopes: config.auth.defaultScopes,
    allowDcr: config.auth.allowDcr,
    signingSecret: TEST_TOKEN_SECRET,
    envClient: {
      clientId: config.auth.clientId,
      redirectUris: config.auth.allowedRedirectUris,
    },
  });
  const limiter = new FixedWindowLimiter(config.limits.ratePerMinute);

  const app = await createApp({ config, logger, gateway, oauth, limiter });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    config,
    mock,
    mockUrl: mockListener.url,
    close: async () => {
      await app.close();
      await mockListener.close();
    },
  };
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export const ALL_SCOPES = 'anki:read anki:write anki:review anki:admin';
/** Mirrors the server's DEFAULT_SCOPE: everything except anki:admin. */
export const DEFAULT_SCOPES = 'anki:read anki:write anki:review';

export interface ObtainTokenOptions {
  scope?: string;
  clientId?: string;
  redirectUri?: string;
  ownerPassword?: string;
}

export async function obtainToken(baseUrl: string, options: ObtainTokenOptions = {}): Promise<string> {
  const { verifier, challenge } = pkcePair();
  const redirectUri = options.redirectUri ?? 'http://localhost:3000/callback';
  const clientId = options.clientId ?? 'chatgpt';
  const scope = options.scope ?? DEFAULT_SCOPES;

  const approveParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope,
    state: 'state-1',
    decision: 'approve',
  });
  if (options.ownerPassword) approveParams.set('owner_password', options.ownerPassword);
  const approveResponse = await fetch(`${baseUrl}/oauth/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: approveParams,
    redirect: 'manual',
  });
  const location = approveResponse.headers.get('location');
  if (!location) {
    throw new Error(`approve did not redirect (${approveResponse.status}): ${await approveResponse.text()}`);
  }
  const code = new URL(location).searchParams.get('code');
  if (!code) throw new Error(`no authorization code in redirect location: ${location}`);

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenParams,
  });
  if (tokenResponse.status !== 200) {
    throw new Error(`token exchange failed (${tokenResponse.status}): ${await tokenResponse.text()}`);
  }
  const body = (await tokenResponse.json()) as { access_token: string };
  return body.access_token;
}

export interface McpResponse<T = unknown> {
  status: number;
  body: T;
}

export async function initializeMcp(baseUrl: string, token: string | undefined): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '0.0.1' },
      },
    }),
  });
  await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { ...headers, 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
}

export async function mcpPost(
  baseUrl: string,
  token: string | undefined,
  message: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<McpResponse> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
    ...extraHeaders,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { status: response.status, body };
}

export interface ToolCallResult {
  status: number;
  isError: boolean;
  /** Parsed JSON payload from content[0].text (structured tool result or error payload). */
  payload: Record<string, unknown> | null;
  structuredContent: Record<string, unknown> | null;
  raw: unknown;
}

export async function callTool(
  baseUrl: string,
  token: string | undefined,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const response = await mcpPost(baseUrl, token, {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1_000_000),
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const envelope = response.body as {
    result?: { content?: Array<{ text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
    error?: { message?: string };
  };
  const result = envelope.result;
  let payload: Record<string, unknown> | null = null;
  const text = result?.content?.[0]?.text;
  if (typeof text === 'string') {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = { message: text };
    }
  }
  return {
    status: response.status,
    isError: result?.isError === true || Boolean(envelope.error),
    payload,
    structuredContent: result?.structuredContent ?? null,
    raw: response.body,
  };
}
