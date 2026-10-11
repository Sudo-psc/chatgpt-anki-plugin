import { describe, expect, it } from 'vitest';
import { DEV_TOKEN_SECRET, loadConfig } from '../../src/infra/config.js';

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig(env());
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.publicBaseUrl).toBe('http://localhost:8080');
    expect(config.issuer).toBe('http://localhost:8080');
    expect(config.audience).toBe('http://localhost:8080');
    expect(config.anki.backend).toBe('connect');
    expect(config.anki.url).toBe('http://127.0.0.1:8765');
    expect(config.anki.timeoutMs).toBe(10_000);
    expect(config.auth.required).toBe(true);
    expect(config.auth.defaultScopes).toEqual(['anki:read', 'anki:write', 'anki:review']);
    expect(config.limits.ratePerMinute).toBe(120);
    expect(config.limits.maxBodyBytes).toBe(1_048_576);
  });

  it('parses csv lists, space lists and booleans', () => {
    const config = loadConfig(
      env({
        ALLOWED_ORIGINS: 'https://a.example, https://b.example',
        DEFAULT_SCOPE: 'anki:read  anki:review',
        AUTH_REQUIRED: 'false',
        OAUTH_ALLOW_DCR: 'false',
      }),
    );
    expect(config.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(config.auth.defaultScopes).toEqual(['anki:read', 'anki:review']);
    expect(config.auth.required).toBe(false);
    expect(config.auth.allowDcr).toBe(false);
  });

  it('strips trailing slashes and derives issuer from PUBLIC_BASE_URL', () => {
    const config = loadConfig(env({ PUBLIC_BASE_URL: 'https://anki.example.com/' }));
    expect(config.publicBaseUrl).toBe('https://anki.example.com');
    expect(config.issuer).toBe('https://anki.example.com');
    expect(config.audience).toBe('https://anki.example.com');
  });

  it('rejects an invalid configuration with an actionable message', () => {
    expect(() => loadConfig(env({ PORT: 'not-a-port' }))).toThrowError(/Invalid environment configuration/);
    expect(() => loadConfig(env({ ANKI_CONNECT_URL: 'nope' }))).toThrowError(/ANKI_CONNECT_URL/);
  });

  it('refuses to boot in production with the default dev secret', () => {
    expect(() =>
      loadConfig(env({ NODE_ENV: 'production', TOKEN_SECRET: DEV_TOKEN_SECRET })),
    ).toThrowError(/TOKEN_SECRET must be set/);
  });

  it('refuses to boot in production against a real Anki without OWNER_PASSWORD', () => {
    const strong = 'x'.repeat(48);
    expect(() =>
      loadConfig(env({ NODE_ENV: 'production', TOKEN_SECRET: strong, ANKI_BACKEND: 'connect' })),
    ).toThrowError(/OWNER_PASSWORD/);
    expect(() =>
      loadConfig(env({ NODE_ENV: 'production', TOKEN_SECRET: strong, ANKI_BACKEND: 'mock' })),
    ).not.toThrow();
    const config = loadConfig(
      env({ NODE_ENV: 'production', TOKEN_SECRET: strong, ANKI_BACKEND: 'connect', OWNER_PASSWORD: 'p'.repeat(16) }),
    );
    expect(config.auth.ownerPassword).toBe('p'.repeat(16));
  });

  it('rejects owner passwords shorter than 12 characters', () => {
    expect(() => loadConfig(env({ OWNER_PASSWORD: 'short' }))).toThrowError(/OWNER_PASSWORD/);
  });

  it('refuses dev-only auth bypasses in production', () => {
    const base = { NODE_ENV: 'production', TOKEN_SECRET: 'x'.repeat(48), ANKI_BACKEND: 'mock' };
    expect(() => loadConfig(env({ ...base, MCP_DEV_TOKEN: 'abc' }))).toThrowError(/MCP_DEV_TOKEN/);
    expect(() => loadConfig(env({ ...base, AUTH_REQUIRED: 'false' }))).toThrowError(/AUTH_REQUIRED/);
  });

  it('treats empty optional strings as undefined', () => {
    const config = loadConfig(env({ MCP_DEV_TOKEN: '', OAUTH_CLIENT_SECRET: '', ANKI_CONNECT_API_KEY: '' }));
    expect(config.auth.devToken).toBeUndefined();
    expect(config.auth.clientSecret).toBeUndefined();
    expect(config.anki.apiKey).toBeUndefined();
  });
});
