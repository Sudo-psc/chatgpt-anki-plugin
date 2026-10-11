import crypto from 'node:crypto';
import type { Request, Response, NextFunction, Router } from 'express';
import { Router as createRouter } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import type { AppConfig } from '../../infra/config.js';
import { telemetry } from '../../infra/telemetry.js';
import { ALL_OAUTH_SCOPES } from '../../tools/context.js';

export interface RegisteredOAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  created_at: number;
}

export interface AuthorizationCodeRecord {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

export interface VerifiedAccessToken {
  sub: string;
  clientId: string;
  scopes: ReadonlySet<string>;
  exp: number;
}

export function computeS256CodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export class OAuth2Server {
  private readonly config: AppConfig;
  private readonly secretKey: Uint8Array;
  private readonly clients = new Map<string, RegisteredOAuthClient>();
  private readonly authCodes = new Map<string, AuthorizationCodeRecord>();
  private readonly revokedTokens = new Set<string>();

  constructor(config: AppConfig) {
    this.config = config;
    this.secretKey = new TextEncoder().encode(config.oauthJwtSecret);

    // Pre-register a default ChatGPT connector client for convenience
    this.clients.set('chatgpt-connector', {
      client_id: 'chatgpt-connector',
      client_name: 'ChatGPT Apps SDK Connector',
      redirect_uris: [
        'https://chatgpt.com/connector_platform_oauth_redirect',
        'https://platform.openai.com/apps-manage/oauth',
        'http://127.0.0.1:3000/oauth/callback',
        'http://localhost:3000/oauth/callback',
      ],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      created_at: Date.now(),
    });
  }

  public getProtectedResourceMetadata(): Record<string, unknown> {
    return {
      resource: `${this.config.publicBaseUrl}/mcp`,
      authorization_servers: [this.config.oauthIssuer],
      scopes_supported: [...ALL_OAUTH_SCOPES],
      bearer_methods_supported: ['header'],
      resource_documentation: `${this.config.publicBaseUrl}/privacy`,
    };
  }

  public getAuthorizationServerMetadata(): Record<string, unknown> {
    const base = this.config.publicBaseUrl;
    return {
      issuer: this.config.oauthIssuer,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      revocation_endpoint: `${base}/oauth/revoke`,
      jwks_uri: `${base}/oauth/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [...ALL_OAUTH_SCOPES],
    };
  }

  public async issueAccessToken(params: {
    subject: string;
    clientId: string;
    scopes: string[];
    resource?: string;
  }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> {
    const expiresIn = this.config.oauthAccessTokenTtlSeconds;
    const scopeStr = params.scopes.join(' ');
    const jti = crypto.randomUUID();

    const accessToken = await new SignJWT({
      scope: scopeStr,
      client_id: params.clientId,
      resource: params.resource ?? `${this.config.publicBaseUrl}/mcp`,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.oauthIssuer)
      .setSubject(params.subject)
      .setAudience(params.resource ?? `${this.config.publicBaseUrl}/mcp`)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.secretKey);

    const refreshToken = await new SignJWT({
      scope: scopeStr,
      client_id: params.clientId,
      token_use: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.oauthIssuer)
      .setSubject(params.subject)
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(this.secretKey);

    telemetry.recordOAuthTokenIssued();

    return {
      accessToken,
      refreshToken,
      expiresIn,
      scope: scopeStr,
    };
  }

  public async verifyAccessToken(rawToken: string): Promise<VerifiedAccessToken> {
    if (this.revokedTokens.has(rawToken)) {
      throw new Error('Token has been revoked.');
    }

    const { payload } = await jwtVerify(rawToken, this.secretKey, {
      issuer: this.config.oauthIssuer,
    });

    if (payload.token_use === 'refresh') {
      throw new Error('Refresh token cannot be used as an access token.');
    }

    const scopeStr = typeof payload.scope === 'string' ? payload.scope : '';
    const scopes = new Set(
      scopeStr
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );

    return {
      sub: payload.sub ?? 'anki-user',
      clientId: typeof payload.client_id === 'string' ? payload.client_id : 'unknown',
      scopes,
      exp: payload.exp ?? 0,
    };
  }

  public buildWwwAuthenticateHeader(error?: string, description?: string): string {
    const resourceMetaUrl = `${this.config.publicBaseUrl}/.well-known/oauth-protected-resource`;
    const parts = [`Bearer resource_metadata="${resourceMetaUrl}"`];
    if (error) parts.push(`error="${error}"`);
    if (description) parts.push(`error_description="${description.replace(/"/g, "'")}"`);
    return parts.join(', ');
  }

  public createAuthMiddleware(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (this.config.mcpAllowUnauthenticated) {
        (req as Request & { auth?: VerifiedAccessToken }).auth = {
          sub: 'local-dev-user',
          clientId: 'local-dev',
          scopes: new Set(ALL_OAUTH_SCOPES),
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
        next();
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        res
          .status(401)
          .set('WWW-Authenticate', this.buildWwwAuthenticateHeader('invalid_token', 'Missing Bearer access token'))
          .json({
            error: 'unauthorized',
            error_description: 'Missing OAuth 2.1 Bearer token in Authorization header.',
          });
        return;
      }

      const token = authHeader.slice(7).trim();
      try {
        const verified = await this.verifyAccessToken(token);
        (req as Request & { auth?: VerifiedAccessToken }).auth = verified;
        next();
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Invalid token';
        res
          .status(401)
          .set('WWW-Authenticate', this.buildWwwAuthenticateHeader('invalid_token', detail))
          .json({
            error: 'invalid_token',
            error_description: detail,
          });
      }
    };
  }

  public createRouter(): Router {
    const router = createRouter();

    // Dynamic Client Registration (RFC 7591)
    router.post('/oauth/register', (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const redirectUris = Array.isArray(body.redirect_uris)
        ? body.redirect_uris.filter((u): u is string => typeof u === 'string' && u.length > 0)
        : [];

      if (redirectUris.length === 0) {
        res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: 'At least one valid redirect_uri is required.',
        });
        return;
      }

      const clientId = `client_${crypto.randomUUID().replace(/-/g, '')}`;
      const record: RegisteredOAuthClient = {
        client_id: clientId,
        client_name: typeof body.client_name === 'string' ? body.client_name : 'MCP Client',
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        created_at: Math.floor(Date.now() / 1000),
      };

      this.clients.set(clientId, record);
      res.status(201).json(record);
    });

    // Authorization Endpoint (GET renders consent form; also supports direct pin parameter for automated tests)
    router.get('/oauth/authorize', (req: Request, res: Response) => {
      const clientId = String(req.query.client_id ?? 'chatgpt-connector');
      const redirectUri = String(req.query.redirect_uri ?? '');
      const responseType = String(req.query.response_type ?? 'code');
      const codeChallenge = String(req.query.code_challenge ?? '');
      const codeChallengeMethod = String(req.query.code_challenge_method ?? 'S256');
      const scope = String(req.query.scope ?? ALL_OAUTH_SCOPES.join(' '));
      const state = String(req.query.state ?? '');
      const resource = req.query.resource ? String(req.query.resource) : undefined;
      const pin = req.query.pin ? String(req.query.pin) : undefined;

      if (responseType !== 'code') {
        res.status(400).json({ error: 'unsupported_response_type', error_description: 'response_type must be code' });
        return;
      }
      if (!redirectUri) {
        res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri is required' });
        return;
      }
      if (!codeChallenge || codeChallengeMethod !== 'S256') {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'PKCE code_challenge with code_challenge_method=S256 is mandatory in OAuth 2.1.',
        });
        return;
      }

      // If PIN was passed in query (or for programmatic consent in integration tests), issue redirect immediately
      if (pin && timingSafeStringEqual(pin, this.config.oauthAuthorizePin)) {
        const redirectTarget = this.issueAuthorizationCodeRedirect({
          clientId,
          redirectUri,
          codeChallenge,
          scope,
          state,
          resource,
        });
        res.redirect(302, redirectTarget);
        return;
      }

      res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Autorizar ChatGPT ↔ Anki</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; max-width: 420px; width: 100%; }
    h1 { font-size: 1.2rem; margin-top: 0; }
    label { display: block; margin-top: 12px; font-size: 0.85rem; color: #94a3b8; }
    input[type="password"], input[type="text"] { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; margin-top: 6px; box-sizing: border-box; }
    button { margin-top: 18px; width: 100%; padding: 11px; border: none; border-radius: 8px; background: #38bdf8; color: #0f172a; font-weight: 700; cursor: pointer; }
    .scopes { margin-top: 12px; font-size: 0.85rem; background: #0f172a; padding: 10px; border-radius: 8px; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="/oauth/authorize">
    <h1>Conectar ChatGPT ao seu Anki</h1>
    <p style="font-size:0.88rem;color:#cbd5e1;">Cliente: <strong>${clientId.replace(/[<>"']/g, '')}</strong></p>
    <div class="scopes">Escopos solicitados: <code>${scope.replace(/[<>"']/g, '')}</code></div>
    <input type="hidden" name="client_id" value="${clientId.replace(/"/g, '&quot;')}" />
    <input type="hidden" name="redirect_uri" value="${redirectUri.replace(/"/g, '&quot;')}" />
    <input type="hidden" name="code_challenge" value="${codeChallenge.replace(/"/g, '&quot;')}" />
    <input type="hidden" name="code_challenge_method" value="S256" />
    <input type="hidden" name="scope" value="${scope.replace(/"/g, '&quot;')}" />
    <input type="hidden" name="state" value="${state.replace(/"/g, '&quot;')}" />
    <input type="hidden" name="resource" value="${(resource ?? '').replace(/"/g, '&quot;')}" />
    <label for="pin">PIN de Autorização do Servidor (OAUTH_AUTHORIZE_PIN)</label>
    <input id="pin" name="pin" type="password" required placeholder="Digite o PIN configurado no servidor" />
    <button type="submit">Autorizar Acesso OAuth 2.1</button>
  </form>
</body>
</html>`);
    });

    router.post('/oauth/authorize', (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, string>;
      const clientId = String(body.client_id ?? 'chatgpt-connector');
      const redirectUri = String(body.redirect_uri ?? '');
      const codeChallenge = String(body.code_challenge ?? '');
      const codeChallengeMethod = String(body.code_challenge_method ?? 'S256');
      const scope = String(body.scope ?? ALL_OAUTH_SCOPES.join(' '));
      const state = String(body.state ?? '');
      const resource = body.resource ? String(body.resource) : undefined;
      const pin = String(body.pin ?? '');

      if (!redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
        res.status(400).json({ error: 'invalid_request', error_description: 'Missing PKCE S256 parameters.' });
        return;
      }

      if (!timingSafeStringEqual(pin, this.config.oauthAuthorizePin)) {
        res.status(403).json({ error: 'access_denied', error_description: 'Invalid authorization PIN.' });
        return;
      }

      const redirectTarget = this.issueAuthorizationCodeRedirect({
        clientId,
        redirectUri,
        codeChallenge,
        scope,
        state,
        resource,
      });
      res.redirect(302, redirectTarget);
    });

    // Token Endpoint (Authorization Code + PKCE S256 or Refresh Token)
    router.post('/oauth/token', async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, string>;
      const grantType = body.grant_type;

      if (grantType === 'authorization_code') {
        const code = body.code;
        const codeVerifier = body.code_verifier;
        const redirectUri = body.redirect_uri;

        if (!code || !codeVerifier) {
          res.status(400).json({
            error: 'invalid_request',
            error_description: 'Both code and code_verifier are required for authorization_code grant.',
          });
          return;
        }

        const record = this.authCodes.get(code);
        this.authCodes.delete(code); // single-use

        if (!record || record.expiresAt < Date.now()) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code is invalid or expired.',
          });
          return;
        }

        if (redirectUri && redirectUri !== record.redirectUri) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'redirect_uri does not match the authorization request.',
          });
          return;
        }

        const computedChallenge = computeS256CodeChallenge(codeVerifier);
        if (!timingSafeStringEqual(computedChallenge, record.codeChallenge)) {
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier validation failed.',
          });
          return;
        }

        const issued = await this.issueAccessToken({
          subject: 'anki-owner',
          clientId: record.clientId,
          scopes: record.scopes,
          resource: record.resource,
        });

        res.status(200).json({
          access_token: issued.accessToken,
          token_type: 'Bearer',
          expires_in: issued.expiresIn,
          refresh_token: issued.refreshToken,
          scope: issued.scope,
        });
        return;
      }

      if (grantType === 'refresh_token') {
        const refreshToken = body.refresh_token;
        if (!refreshToken) {
          res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required.' });
          return;
        }
        try {
          const { payload } = await jwtVerify(refreshToken, this.secretKey, {
            issuer: this.config.oauthIssuer,
          });
          if (payload.token_use !== 'refresh') {
            res.status(400).json({ error: 'invalid_grant', error_description: 'Not a valid refresh token.' });
            return;
          }
          const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [...ALL_OAUTH_SCOPES];
          const issued = await this.issueAccessToken({
            subject: payload.sub ?? 'anki-owner',
            clientId: typeof payload.client_id === 'string' ? payload.client_id : 'chatgpt-connector',
            scopes,
          });
          res.status(200).json({
            access_token: issued.accessToken,
            token_type: 'Bearer',
            expires_in: issued.expiresIn,
            refresh_token: issued.refreshToken,
            scope: issued.scope,
          });
          return;
        } catch {
          res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired refresh_token.' });
          return;
        }
      }

      res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Supported grant_types: authorization_code, refresh_token.',
      });
    });

    router.post('/oauth/revoke', (req: Request, res: Response) => {
      const token = (req.body as Record<string, string> | undefined)?.token;
      if (token && typeof token === 'string') {
        this.revokedTokens.add(token);
      }
      res.status(200).json({ revoked: true });
    });

    router.get('/oauth/jwks.json', (_req: Request, res: Response) => {
      res.status(200).json({ keys: [] });
    });

    return router;
  }

  private issueAuthorizationCodeRedirect(params: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    scope: string;
    state: string;
    resource?: string;
  }): string {
    const code = `ac_${crypto.randomUUID().replace(/-/g, '')}`;
    const requestedScopes = params.scope
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s): s is (typeof ALL_OAUTH_SCOPES)[number] => (ALL_OAUTH_SCOPES as readonly string[]).includes(s));

    const scopes = requestedScopes.length > 0 ? requestedScopes : [...ALL_OAUTH_SCOPES];

    this.authCodes.set(code, {
      code,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      scopes,
      resource: params.resource,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }
    return redirectUrl.toString();
  }
}
