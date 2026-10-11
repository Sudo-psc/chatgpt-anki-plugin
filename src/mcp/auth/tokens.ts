import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless access tokens (JWT-shaped, HS256 via node:crypto — no external
 * dependency). Claims: sub (subject/client id), scope (space-separated),
 * iss, aud, iat, exp. See ADR-0003.
 */

export interface AccessTokenClaims {
  sub: string;
  scope: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export type TokenErrorReason =
  | 'malformed'
  | 'invalid_signature'
  | 'expired'
  | 'wrong_issuer'
  | 'wrong_audience';

export class TokenError extends Error {
  constructor(
    readonly reason: TokenErrorReason,
    message?: string,
  ) {
    super(message ?? `Access token rejected: ${reason}`);
    this.name = 'TokenError';
  }
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export interface SignOptions {
  subject: string;
  scopes: string[];
  secret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
  now?: number;
}

export function signAccessToken(options: SignOptions): string {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: options.subject,
    scope: options.scopes.join(' '),
    iss: options.issuer,
    aud: options.audience,
    iat: now,
    exp: now + options.ttlSeconds,
  };
  const data = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', options.secret).update(data).digest();
  return `${data}.${b64urlEncode(signature)}`;
}

export interface VerifyOptions {
  secret: string;
  issuer: string;
  audience: string;
  now?: number;
}

export function verifyAccessToken(token: string, options: VerifyOptions): AccessTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenError('malformed');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  const expected = createHmac('sha256', options.secret).update(`${headerPart}.${payloadPart}`).digest();
  const provided = b64urlDecode(signaturePart);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new TokenError('invalid_signature');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new TokenError('malformed');
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new TokenError('expired');
  if (payload.iss !== options.issuer) throw new TokenError('wrong_issuer');
  const aud = payload.aud;
  const audienceOk =
    typeof aud === 'string' ? aud === options.audience : Array.isArray(aud) ? aud.includes(options.audience) : false;
  if (!audienceOk) throw new TokenError('wrong_audience');
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new TokenError('malformed');

  return {
    sub: payload.sub,
    scope: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
    iss: String(payload.iss),
    aud: options.audience,
    iat: typeof payload.iat === 'number' ? payload.iat : 0,
    exp: payload.exp,
  };
}
