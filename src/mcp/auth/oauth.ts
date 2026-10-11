import { createHash, randomBytes } from 'node:crypto';
import { TOOL_SCOPES } from '../../tools/types.js';

/**
 * Minimal OAuth 2.1 authorization server for single-tenant self-hosting:
 * authorization code + PKCE (S256, mandatory), dynamic client registration
 * (RFC 7591), authorization server metadata (RFC 8414) and protected resource
 * metadata (RFC 9728). Refresh tokens are out of scope for v0.1 — the ChatGPT
 * connector re-runs the authorization flow when a token expires.
 */

export interface OAuthClientRecord {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: 'none' | 'client_secret_post';
  clientSecret?: string;
  createdAt: number;
  /**
   * true para clientes registrados via DCR. Clientes dinâmicos aceitam, na
   * autorização, callbacks hospedados em domínios ChatGPT/OpenAI (o conector
   * usa caminhos como /connector/oauth/<id> que mudam por workspace).
   */
  dynamic?: boolean;
}

/** Callbacks hospedados pelo ChatGPT/OpenAI são confiáveis por definição do conector. */
export function isChatGptHostedRedirect(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'chatgpt.com' ||
        parsed.hostname === 'chat.openai.com' ||
        parsed.hostname.endsWith('.chatgpt.com'))
    );
  } catch {
    return false;
  }
}

export class OAuthError extends Error {
  constructor(
    readonly errorCode:
      | 'invalid_request'
      | 'invalid_client'
      | 'invalid_grant'
      | 'unsupported_grant_type'
      | 'invalid_scope',
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string[];
  subject: string;
  expiresAt: number;
}

export interface AuthorizeParams {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
}

export type AuthorizeValidation =
  | {
      ok: true;
      client: OAuthClientRecord;
      redirectUri: string;
      scope: string[];
      codeChallenge: string;
      state?: string;
    }
  | {
      ok: false;
      error: string;
      description: string;
      /** Present when the redirect_uri was validated and the error may be redirected to it. */
      redirectUri?: string;
      state?: string;
    };

const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

export interface OAuthServiceOptions {
  allowedRedirectUris: string[];
  defaultScopes: string[];
  allowDcr: boolean;
  codeTtlMs?: number;
  now?: () => number;
  envClient?: { clientId: string; clientSecret?: string; redirectUris: string[] };
}

export class OAuthService {
  private readonly clients = new Map<string, OAuthClientRecord>();
  private readonly codes = new Map<string, AuthorizationCodeRecord>();
  private readonly now: () => number;
  private readonly options: OAuthServiceOptions;

  constructor(options: OAuthServiceOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    if (options.envClient) {
      const { clientId, clientSecret, redirectUris } = options.envClient;
      this.clients.set(clientId, {
        clientId,
        redirectUris: [...redirectUris],
        tokenEndpointAuthMethod: clientSecret ? 'client_secret_post' : 'none',
        ...(clientSecret ? { clientSecret } : {}),
        createdAt: this.now(),
      });
    }
  }

  registerClient(input: {
    redirect_uris?: unknown;
    client_name?: unknown;
  }): OAuthClientRecord {
    if (!this.options.allowDcr) {
      throw new OAuthError(
        'invalid_request',
        'Dynamic client registration is disabled. Use the pre-registered client_id instead.',
      );
    }
    const redirectUris = Array.isArray(input.redirect_uris)
      ? input.redirect_uris.filter((uri): uri is string => typeof uri === 'string')
      : [];
    for (const uri of redirectUris) {
      try {
        new URL(uri);
      } catch {
        throw new OAuthError('invalid_request', `redirect_uri "${uri}" is not a valid URL.`);
      }
      if (!this.options.allowedRedirectUris.includes(uri) && !isChatGptHostedRedirect(uri)) {
        throw new OAuthError(
          'invalid_request',
          `redirect_uri "${uri}" is not allowed. Allowed: the server allowlist (${this.options.allowedRedirectUris.join(', ')}) and ChatGPT-hosted https://chatgpt.com/* callbacks.`,
        );
      }
    }
    const clientId = `mcp-${randomBytes(12).toString('hex')}`;
    const record: OAuthClientRecord = {
      clientId,
      ...(typeof input.client_name === 'string' ? { clientName: input.client_name } : {}),
      redirectUris,
      tokenEndpointAuthMethod: 'none',
      createdAt: this.now(),
      dynamic: true,
    };
    this.clients.set(clientId, record);
    return record;
  }

  getClient(clientId: string | undefined): OAuthClientRecord | undefined {
    return clientId ? this.clients.get(clientId) : undefined;
  }

  validateAuthorize(params: AuthorizeParams): AuthorizeValidation {
    const client = this.getClient(params.client_id);
    const state = params.state;
    if (!client) {
      return {
        ok: false,
        error: 'invalid_request',
        description:
          'Unknown client_id. Register the client first (POST /oauth/register) or use the pre-registered client_id.',
      };
    }
    if (typeof params.redirect_uri !== 'string') {
      return {
        ok: false,
        error: 'invalid_request',
        description: `redirect_uri "${params.redirect_uri ?? ''}" is not registered for this client. Registered: ${client.redirectUris.join(', ') || '(none)'}`,
      };
    }
    const redirectUri = params.redirect_uri;
    const redirectAllowed =
      client.redirectUris.includes(redirectUri) ||
      (client.dynamic === true && isChatGptHostedRedirect(redirectUri));
    if (!redirectAllowed) {
      return {
        ok: false,
        error: 'invalid_request',
        description: `redirect_uri "${redirectUri}" is not registered for this client. Registered: ${client.redirectUris.join(', ') || '(none)'}`,
      };
    }
    const redirectable = (error: string, description: string): AuthorizeValidation => ({
      ok: false,
      error,
      description,
      redirectUri,
      ...(state !== undefined ? { state } : {}),
    });

    if (params.response_type !== 'code') {
      return redirectable('unsupported_response_type', 'Only response_type=code is supported.');
    }
    if (typeof params.code_challenge !== 'string' || !PKCE_CHALLENGE_RE.test(params.code_challenge)) {
      return redirectable(
        'invalid_request',
        'code_challenge is required and must be a valid PKCE S256 challenge (43-128 chars of [A-Za-z0-9_-]).',
      );
    }
    if (params.code_challenge_method !== 'S256') {
      return redirectable('invalid_request', 'code_challenge_method must be S256.');
    }

    let scope = this.options.defaultScopes;
    if (params.scope !== undefined && params.scope.trim().length > 0) {
      const requested = params.scope.split(/\s+/).filter(Boolean);
      const invalid = requested.filter((item) => !(TOOL_SCOPES as readonly string[]).includes(item));
      if (invalid.length > 0) {
        return redirectable(
          'invalid_scope',
          `Unsupported scopes: ${invalid.join(', ')}. Supported: ${TOOL_SCOPES.join(', ')}.`,
        );
      }
      scope = [...new Set(requested)];
    }

    return {
      ok: true,
      client,
      redirectUri,
      scope,
      codeChallenge: params.code_challenge,
      ...(state !== undefined ? { state } : {}),
    };
  }

  createAuthorizationCode(input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    scope: string[];
    subject: string;
  }): string {
    const code = randomBytes(32).toString('base64url');
    this.codes.set(code, {
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scope: input.scope,
      subject: input.subject,
      expiresAt: this.now() + (this.options.codeTtlMs ?? 60_000),
    });
    return code;
  }

  exchangeCode(input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  }): { subject: string; scope: string[] } {
    const record = this.codes.get(input.code);
    if (!record) {
      throw new OAuthError('invalid_grant', 'Authorization code is invalid, already used or expired.');
    }
    this.codes.delete(input.code);
    if (record.expiresAt <= this.now()) {
      throw new OAuthError('invalid_grant', 'Authorization code expired.');
    }
    if (record.clientId !== input.clientId) {
      throw new OAuthError('invalid_grant', 'Authorization code was issued to a different client.');
    }
    if (record.redirectUri !== input.redirectUri) {
      throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request.');
    }
    const expectedChallenge = createHash('sha256').update(input.codeVerifier).digest('base64url');
    if (expectedChallenge !== record.codeChallenge) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed: code_verifier does not match code_challenge.');
    }
    return { subject: record.subject, scope: record.scope };
  }
}
