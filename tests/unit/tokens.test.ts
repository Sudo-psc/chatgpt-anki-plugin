import { describe, expect, it } from 'vitest';
import { signAccessToken, TokenError, verifyAccessToken } from '../../src/mcp/auth/tokens.js';

const base = {
  subject: 'owner',
  scopes: ['anki:read', 'anki:review'],
  secret: 'unit-test-secret-0123456789abcdef0123456789abcdef',
  issuer: 'https://anki.example.com',
  audience: 'https://anki.example.com',
  ttlSeconds: 3600,
  now: 1_700_000_000,
};

describe('access tokens', () => {
  it('round-trips claims', () => {
    const token = signAccessToken(base);
    const claims = verifyAccessToken(token, base);
    expect(claims.sub).toBe('owner');
    expect(claims.scope).toEqual(['anki:read', 'anki:review']);
    expect(claims.iss).toBe(base.issuer);
    expect(claims.exp).toBe(base.now + 3600);
  });

  it('rejects tampered payloads with invalid_signature', () => {
    const token = signAccessToken(base);
    const [header, , signature] = token.split('.') as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ sub: 'attacker', scope: 'anki:admin', iss: base.issuer, aud: base.audience, iat: base.now, exp: base.now + 100 })).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${forged}.${signature}`, base)).toThrowError(
      expect.objectContaining({ reason: 'invalid_signature' }),
    );
  });

  it('rejects expired tokens', () => {
    const token = signAccessToken({ ...base, ttlSeconds: -10 });
    expect(() => verifyAccessToken(token, base)).toThrowError(
      expect.objectContaining({ reason: 'expired' }),
    );
  });

  it('rejects wrong issuer and wrong audience', () => {
    const token = signAccessToken(base);
    expect(() => verifyAccessToken(token, { ...base, issuer: 'https://evil.example.com' })).toThrowError(
      expect.objectContaining({ reason: 'wrong_issuer' }),
    );
    expect(() => verifyAccessToken(token, { ...base, audience: 'https://other.example.com' })).toThrowError(
      expect.objectContaining({ reason: 'wrong_audience' }),
    );
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyAccessToken('not-a-token', base)).toThrowError(
      expect.objectContaining({ reason: 'malformed' }),
    );
    expect(() => verifyAccessToken('a.b', base)).toThrow(/\bmalformed\b|Token/);
  });

  it('TokenError carries the reason', () => {
    try {
      verifyAccessToken('bad', base);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TokenError);
      expect((error as TokenError).reason).toBe('malformed');
    }
  });
});
