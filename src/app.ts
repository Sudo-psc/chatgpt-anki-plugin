import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { AppConfig } from './infra/config.js';
import type { Logger } from './infra/logger.js';
import type { AnkiGateway } from './anki/index.js';
import { OAuthError, type OAuthService } from './mcp/auth/oauth.js';
import { verifyAccessToken, TokenError, signAccessToken } from './mcp/auth/tokens.js';
import { authorizationServerMetadata, protectedResourceMetadata } from './mcp/auth/metadata.js';
import { FixedWindowLimiter } from './mcp/ratelimit.js';
import { buildMcpServer } from './mcp/server.js';
import { ALL_TOOLS } from './tools/registry.js';
import { TOOL_SCOPES } from './tools/types.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

export interface CreateAppDeps {
  config: AppConfig;
  logger: Logger;
  gateway: AnkiGateway;
  oauth: OAuthService;
  limiter: FixedWindowLimiter;
}

export interface App {
  server: Server;
  close: () => Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const WIDGET_FILES: Record<string, string> = {
  'decks.html': 'text/html; charset=utf-8',
  'decks.js': 'text/javascript; charset=utf-8',
  'review.html': 'text/html; charset=utf-8',
  'review.js': 'text/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
};

const WIDGET_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://chatgpt.com https://*.chatgpt.com";

/** A tela de consentimento nunca pode ser emoldurada (clickjacking) nem cacheada. */
// Sem `form-action`: Chrome/Firefox aplicam a diretiva também ao 302 que segue o
// POST, o que bloquearia o redirect para o redirect_uri do cliente.
const CONSENT_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";

/** Senhas erradas por IP e no total, por minuto. Acertos não consomem a cota. */
const CONSENT_FAILURES_PER_IP = 10;
const CONSENT_FAILURES_GLOBAL = 50;

export async function createApp(deps: CreateAppDeps): Promise<App> {
  const { config, logger } = deps;

  const ownerPasswordRequired = config.auth.ownerPassword !== undefined;
  const ownerPasswordDigest = config.auth.ownerPassword
    ? createHash('sha256').update(config.auth.ownerPassword).digest()
    : undefined;
  const consentFailuresByIp = new FixedWindowLimiter(CONSENT_FAILURES_PER_IP);
  const consentFailuresGlobal = new FixedWindowLimiter(CONSENT_FAILURES_GLOBAL);

  function ownerPasswordMatches(candidate: string | undefined): boolean {
    if (!ownerPasswordDigest || typeof candidate !== 'string') return false;
    return timingSafeEqual(createHash('sha256').update(candidate).digest(), ownerPasswordDigest);
  }

  if (!ownerPasswordRequired && config.auth.required) {
    logger.warn('oauth_consent_unauthenticated', {
      note: 'OWNER_PASSWORD não definido: qualquer visitante pode aprovar acesso na tela de consentimento.',
    });
  }

  /**
   * Stateless MCP mode: the SDK requires a fresh server + transport pair per
   * HTTP request (a stateless transport rejects reuse). This keeps the server
   * horizontally scalable with no session state (ADR-0007).
   */
  const activePairs = new Set<{ transport: StreamableHTTPServerTransport; mcpServer: ReturnType<typeof buildMcpServer> }>();

  function createMcpPair(): { transport: StreamableHTTPServerTransport; mcpServer: ReturnType<typeof buildMcpServer> } {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    transport.onerror = (error: Error) => {
      logger.error('mcp_transport_error', {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join(' | '),
      });
    };
    const mcpServer = buildMcpServer({
      tools: ALL_TOOLS,
      gateway: deps.gateway,
      logger,
      limiter: deps.limiter,
    });
    const pair = { transport, mcpServer };
    activePairs.add(pair);
    return pair;
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startedAt = Date.now();
    const url = new URL(req.url ?? '/', config.publicBaseUrl);
    try {
      await route(req, res, url);
    } catch (error) {
      if (!(error instanceof HttpError) || res.headersSent) {
        logger.error('unhandled_request_error', {
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
          headers_sent: res.headersSent,
        });
      }
      // Um erro depois de a resposta começar (ex.: no transporte MCP) não pode
      // reescrever headers: writeHead lançaria ERR_HTTP_HEADERS_SENT fora do try.
      if (res.headersSent) {
        res.end();
      } else if (error instanceof HttpError) {
        sendJson(res, error.status, { error: 'request_error', message: error.message }, error.headers);
      } else {
        sendJson(res, 500, { error: 'internal_error', message: 'Unexpected internal error.' });
      }
    } finally {
      logger.info('http_request', {
        method: req.method,
        path: url.pathname,
        status: res.statusCode,
        ms: Date.now() - startedAt,
      });
    }
  };

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method === 'GET' && url.pathname === '/') {
      return sendJson(res, 200, {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcp_endpoint: '/mcp',
        health: '/health',
        ready: '/ready',
        docs: 'https://github.com/Sudo-psc/chatgpt-anki-plugin',
      });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        name: SERVER_NAME,
        version: SERVER_VERSION,
        uptime_seconds: Math.round(process.uptime()),
      });
    }

    if (req.method === 'GET' && url.pathname === '/ready') {
      try {
        const result = await withTimeout(deps.gateway.ready(), 2_000);
        return sendJson(res, 200, { status: 'ready', anki: 'ok', anki_connect_version: result.version });
      } catch (error) {
        return sendJson(res, 503, {
          status: 'degraded',
          anki: 'unreachable',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (req.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
      return sendJson(res, 200, authorizationServerMetadata(config));
    }

    if (req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
      return sendJson(res, 200, protectedResourceMetadata(config));
    }

    if (req.method === 'POST' && url.pathname === '/oauth/register') {
      return handleRegister(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/oauth/authorize') {
      return handleAuthorize(req, res, url);
    }

    if (req.method === 'POST' && url.pathname === '/oauth/approve') {
      return handleApprove(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      return handleToken(req, res);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/widgets/')) {
      return handleWidget(res, url.pathname.slice('/widgets/'.length));
    }

    if (url.pathname === '/mcp') {
      return handleMcp(req, res);
    }

    sendJson(res, 404, { error: 'not_found', message: `No route for ${req.method} ${url.pathname}` });
  }

  async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req, config.limits.maxBodyBytes);
    if (typeof body !== 'object' || body === null) {
      return sendJson(res, 400, { error: 'invalid_request', error_description: 'Body must be a JSON object.' });
    }
    try {
      const client = deps.oauth.registerClient(body as Record<string, unknown>);
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 201, {
        client_id: client.clientId,
        ...(client.clientName ? { client_name: client.clientName } : {}),
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
      });
    } catch (error) {
      logger.warn('oauth_register_rejected', {
        reason: error instanceof Error ? error.message : String(error),
        redirect_uris: (body as Record<string, unknown>).redirect_uris,
      });
      return oauthErrorResponse(res, error);
    }
  }

  async function handleAuthorize(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const params = Object.fromEntries(url.searchParams.entries());
    const validation = deps.oauth.validateAuthorize(params);
    if (!validation.ok) {
      if (validation.redirectUri) {
        return redirectWithError(res, validation.redirectUri, validation.error, validation.description, validation.state);
      }
      return sendJson(res, 400, { error: validation.error, error_description: validation.description });
    }
    return sendConsentPage(res, 200, consentPageHtml(validation, params, { requirePassword: ownerPasswordRequired }));
  }

  async function handleApprove(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const form = await readFormBody(req);
    const params = Object.fromEntries(form.entries());
    const validation = deps.oauth.validateAuthorize(params);
    if (!validation.ok) {
      if (validation.redirectUri) {
        return redirectWithError(res, validation.redirectUri, validation.error, validation.description, validation.state);
      }
      return sendJson(res, 400, { error: validation.error, error_description: validation.description });
    }
    if (params.decision !== 'approve') {
      return redirectWithError(res, validation.redirectUri, 'access_denied', 'The user denied the authorization request.', validation.state);
    }
    if (ownerPasswordRequired) {
      // Só falhas contam: um visitante não consegue trancar o dono que acerta a senha
      // de outro IP. O teto global limita brute force distribuído / IP forjado.
      const clientIp = clientAddress(req);
      const byIp = consentFailuresByIp.blocked(clientIp);
      const decision = byIp.allowed ? consentFailuresGlobal.blocked('global') : byIp;
      if (!decision.allowed) {
        logger.warn('oauth_consent_throttled', { retry_after_seconds: decision.retryAfterSeconds });
        res.setHeader('Retry-After', String(decision.retryAfterSeconds));
        return sendConsentPage(
          res,
          429,
          consentPageHtml(validation, params, {
            requirePassword: true,
            error: `Muitas tentativas. Tente novamente em ${decision.retryAfterSeconds}s.`,
          }),
        );
      }
      if (!ownerPasswordMatches(params.owner_password)) {
        consentFailuresByIp.check(clientIp);
        consentFailuresGlobal.check('global');
        logger.warn('oauth_consent_bad_password', { client_id_prefix: validation.client.clientId.slice(0, 12) });
        return sendConsentPage(
          res,
          401,
          consentPageHtml(validation, params, { requirePassword: true, error: 'Senha incorreta.' }),
        );
      }
    }
    let code: string;
    try {
      code = deps.oauth.createAuthorizationCode({
        clientId: validation.client.clientId,
        redirectUri: validation.redirectUri,
        codeChallenge: validation.codeChallenge,
        scope: validation.scope,
        subject: 'owner',
      });
    } catch (error) {
      return oauthErrorResponse(res, error);
    }
    const location = new URL(validation.redirectUri);
    location.searchParams.set('code', code);
    if (validation.state !== undefined) location.searchParams.set('state', validation.state);
    res.writeHead(302, { location: location.toString(), 'Cache-Control': 'no-store' });
    res.end();
  }

  async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const contentType = String(req.headers['content-type'] ?? '');
    if (!contentType.startsWith('application/x-www-form-urlencoded')) {
      return sendJson(res, 400, {
        error: 'invalid_request',
        error_description: 'Content-Type must be application/x-www-form-urlencoded.',
      });
    }
    const form = await readFormBody(req);
    const grantType = form.get('grant_type');
    if (grantType !== 'authorization_code') {
      return oauthErrorResponse(
        res,
        new OAuthError('unsupported_grant_type', 'Only grant_type=authorization_code is supported.'),
      );
    }
    const code = form.get('code');
    const clientId = form.get('client_id');
    const redirectUri = form.get('redirect_uri');
    const codeVerifier = form.get('code_verifier');
    if (!code || !clientId || !redirectUri || !codeVerifier) {
      return oauthErrorResponse(
        res,
        new OAuthError('invalid_request', 'code, client_id, redirect_uri and code_verifier are required.'),
      );
    }
    const client = deps.oauth.getClient(clientId);
    if (!client) {
      // Cliente legado (pré-ids-assinados): o code + PKCE são as credenciais; o
      // exchangeCode valida o vínculo com o clientId. Observabilidade:
      logger.warn('oauth_legacy_client_token_exchange', { client_id_prefix: clientId.slice(0, 12) });
    } else if (client.clientSecret) {
      const provided = form.get('client_secret');
      if (provided !== client.clientSecret) {
        return oauthErrorResponse(res, new OAuthError('invalid_client', 'Invalid client_secret.', 401));
      }
    }
    try {
      const exchanged = deps.oauth.exchangeCode({ code, clientId, redirectUri, codeVerifier });
      const accessToken = signAccessToken({
        subject: exchanged.subject,
        scopes: exchanged.scope,
        secret: config.auth.tokenSecret,
        issuer: config.issuer,
        audience: config.audience,
        ttlSeconds: config.auth.tokenTtlSeconds,
      });
      return sendJson(res, 200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: config.auth.tokenTtlSeconds,
        scope: exchanged.scope.join(' '),
      });
    } catch (error) {
      return oauthErrorResponse(res, error);
    }
  }

  async function handleWidget(res: ServerResponse, file: string): Promise<void> {
    const contentType = WIDGET_FILES[file];
    if (!contentType) {
      return sendJson(res, 404, { error: 'not_found', message: `Unknown widget file "${file}".` });
    }
    const widgetsDir = fileURLToPath(new URL('./widgets/', import.meta.url));
    try {
      const content = await readFile(`${widgetsDir}${file}`, 'utf8');
      res.writeHead(200, {
        'content-type': contentType,
        'content-security-policy': WIDGET_CSP,
        'cache-control': 'public, max-age=300',
      });
      res.end(content);
      return;
    } catch {
      return sendJson(res, 404, { error: 'not_found', message: `Widget file "${file}" not found on disk.` });
    }
  }

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.length > 0 && !config.allowedOrigins.includes(origin)) {
      return sendJsonRpc(res, 403, null, -32000, `Origin "${origin}" is not allowed.`);
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return sendJsonRpc(
        res,
        405,
        null,
        -32000,
        'This server uses the MCP Streamable HTTP transport in JSON response mode; only POST is supported (no SSE stream).',
      );
    }

    let authInfo: AuthInfo;
    try {
      authInfo = authenticate(req);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJsonRpc(res, error.status, null, -32001, error.message, error.headers);
      }
      throw error;
    }

    const raw = await readBody(req, config.limits.maxBodyBytes);
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(raw.toString('utf8'));
    } catch {
      return sendJsonRpc(res, 400, null, -32700, 'Parse error: request body is not valid JSON.');
    }

    const authReq = req as IncomingMessage & { auth?: AuthInfo };
    authReq.auth = authInfo;

    const pair = createMcpPair();
    res.on('close', () => {
      activePairs.delete(pair);
      void pair.transport.close().catch(() => {});
      void pair.mcpServer.close().catch(() => {});
    });
    await pair.mcpServer.connect(pair.transport);
    await pair.transport.handleRequest(authReq, res, parsedBody);
  }

  function authenticate(req: IncomingMessage): AuthInfo {
    const resourceMetadata = `${config.publicBaseUrl}/.well-known/oauth-protected-resource`;
    const header = req.headers.authorization;

    if (!header) {
      if (!config.auth.required) {
        return {
          token: 'auth-disabled',
          clientId: 'dev',
          scopes: [...TOOL_SCOPES],
          extra: { subject: 'dev' },
        };
      }
      throw new HttpError(401, 'Unauthorized: missing Authorization header. Obtain an access token via OAuth.', {
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata}"`,
      });
    }

    const [scheme, ...rest] = header.split(' ');
    const token = rest.join(' ');
    if (scheme?.toLowerCase() !== 'bearer' || token.length === 0) {
      throw new HttpError(401, 'Unauthorized: Authorization header must use the Bearer scheme.', {
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata}", error="invalid_request"`,
      });
    }

    if (config.auth.devToken && token === config.auth.devToken) {
      return {
        token,
        clientId: 'dev',
        scopes: [...TOOL_SCOPES],
        extra: { subject: 'dev' },
      };
    }

    try {
      const claims = verifyAccessToken(token, {
        secret: config.auth.tokenSecret,
        issuer: config.issuer,
        audience: config.audience,
      });
      return {
        token,
        clientId: claims.sub,
        scopes: claims.scope,
        expiresAt: claims.exp,
        extra: { subject: claims.sub },
      };
    } catch (error) {
      const reason = error instanceof TokenError ? error.reason : 'malformed';
      throw new HttpError(401, `Unauthorized: ${reason}.`, {
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata}", error="invalid_token", error_description="${reason}"`,
      });
    }
  }

  function oauthErrorResponse(res: ServerResponse, error: unknown): void {
    if (error instanceof OAuthError) {
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, error.status, { error: error.errorCode, error_description: error.message });
    }
    throw error;
  }

  const httpServer = createServer((req, res) => {
    void handle(req, res);
  });

  const close = async (): Promise<void> => {
    for (const pair of activePairs) {
      await pair.transport.close().catch(() => {});
      await pair.mcpServer.close().catch(() => {});
    }
    activePairs.clear();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeAllConnections();
    });
  };

  return { server: httpServer, close };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, `Request body exceeds the maximum of ${maxBytes} bytes.`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBytes) {
      req.destroy();
      throw new HttpError(413, `Request body exceeds the maximum of ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const raw = await readBody(req, maxBytes);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

async function readFormBody(req: IncomingMessage): Promise<URLSearchParams> {
  const raw = await readBody(req, 64 * 1024);
  return new URLSearchParams(raw.toString('utf8'));
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendJsonRpc(
  res: ServerResponse,
  status: number,
  id: string | number | null,
  code: number,
  message: string,
  headers: Record<string, string> = {},
): void {
  sendJson(res, status, { jsonrpc: '2.0', id, error: { code, message } }, headers);
}

/** Atrás do proxy do Fly o IP real vem em Fly-Client-IP (o proxy sobrescreve o header). */
function clientAddress(req: IncomingMessage): string {
  const flyIp = req.headers['fly-client-ip'];
  if (typeof flyIp === 'string' && flyIp.length > 0) return flyIp;
  return req.socket.remoteAddress ?? 'unknown';
}

function sendConsentPage(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': CONSENT_CSP,
    'x-frame-options': 'DENY',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  res.end(html);
}

function redirectWithError(
  res: ServerResponse,
  redirectUri: string,
  error: string,
  description: string,
  state: string | undefined,
): void {
  const location = new URL(redirectUri);
  location.searchParams.set('error', error);
  location.searchParams.set('error_description', description);
  if (state !== undefined) location.searchParams.set('state', state);
  res.writeHead(302, { location: location.toString(), 'Cache-Control': 'no-store' });
  res.end();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'anki:read': 'Ler baralhos, cartões, notas e estatísticas',
  'anki:write': 'Criar, editar e excluir baralhos, notas e tags',
  'anki:review': 'Iniciar sessões de revisão e enviar respostas (Again/Hard/Good/Easy)',
  'anki:admin': 'Editar templates de modelos de nota (avançado)',
};

function consentPageHtml(
  validation: { client: { clientId: string; clientName?: string }; scope: string[] },
  params: Record<string, string>,
  options: { requirePassword: boolean; error?: string },
): string {
  const clientLabel = validation.client.clientName ?? validation.client.clientId;
  const scopeItems = validation.scope
    .map((scope) => `<li><code>${escapeHtml(scope)}</code> — ${escapeHtml(SCOPE_DESCRIPTIONS[scope] ?? scope)}</li>`)
    .join('\n');
  const errorBlock = options.error ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>` : '';
  const passwordField = options.requirePassword
    ? `<label class="password">Senha do dono deste servidor
      <input type="password" name="owner_password" autocomplete="current-password" />
    </label>`
    : '';
  const hidden = Object.entries(params)
    .filter(([key]) => key !== 'decision' && key !== 'owner_password')
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Autorizar ${escapeHtml(clientLabel)} — ChatGPT ↔ Anki</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; color: #1f2937; }
    h1 { font-size: 1.4rem; }
    code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 4px; }
    form { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
    button { padding: 0.6rem 1.2rem; border-radius: 8px; border: 1px solid #d1d5db; cursor: pointer; font-size: 1rem; }
    button.approve { background: #111827; color: #fff; border-color: #111827; }
    .muted { color: #6b7280; font-size: 0.9rem; }
    .error { color: #b91c1c; font-weight: 600; }
    .password { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 1rem; }
    .password input { padding: 0.5rem; border-radius: 6px; border: 1px solid #d1d5db; font-size: 1rem; }
  </style>
</head>
<body>
  <h1>Autorizar acesso ao seu Anki</h1>
  <p>O aplicativo <strong>${escapeHtml(clientLabel)}</strong> está solicitando acesso ao seu servidor MCP do Anki com as permissões:</p>
  <ul>
    ${scopeItems}
  </ul>
  <p class="muted">O servidor fala apenas com o seu AnkiConnect local/self-hosted. Nenhum conteúdo de cartão é armazenado neste servidor.</p>
  ${errorBlock}
  <form method="post" action="/oauth/approve">
    ${hidden}
    ${passwordField}
    <button class="approve" type="submit" name="decision" value="approve">Autorizar</button>
    <button type="submit" name="decision" value="deny">Negar</button>
  </form>
</body>
</html>`;
}
