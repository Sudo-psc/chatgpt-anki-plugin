import { z } from 'zod';

export type AnkiBackendMode = 'ankiconnect' | 'bridge' | 'memory';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  publicBaseUrl: string;
  ankiBackend: AnkiBackendMode;
  ankiConnectUrl: string;
  ankiConnectApiKey?: string;
  ankiConnectTimeoutMs: number;
  ankiReadOnly: boolean;
  oauthJwtSecret: string;
  oauthIssuer: string;
  oauthAccessTokenTtlSeconds: number;
  oauthAuthorizePin: string;
  mcpAllowUnauthenticated: boolean;
  bridgeSharedToken?: string;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  PUBLIC_BASE_URL: z.string().url().optional(),
  ANKI_BACKEND: z.enum(['ankiconnect', 'bridge', 'memory']).default('ankiconnect'),
  ANKICONNECT_URL: z.string().url().default('http://127.0.0.1:8765'),
  ANKICONNECT_API_KEY: z.string().optional(),
  ANKICONNECT_TIMEOUT_MS: z.coerce.number().int().min(200).max(60000).default(8000),
  ANKI_READ_ONLY: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  OAUTH_JWT_SECRET: z.string().min(16).default('dev-only-jwt-secret-key-at-least-32-chars!!'),
  OAUTH_ISSUER: z.string().url().optional(),
  OAUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  OAUTH_AUTHORIZE_PIN: z.string().min(4).default('anki-dev-pin'),
  MCP_ALLOW_UNAUTHENTICATED: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  BRIDGE_SHARED_TOKEN: z.string().optional(),
});

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export function assertHttpSecurity(config: AppConfig): void {
  if (config.mcpAllowUnauthenticated && !isLoopbackHost(config.host)) {
    throw new Error(
      `Security violation: MCP_ALLOW_UNAUTHENTICATED=1 is only permitted on loopback hosts (got HOST=${config.host}).`,
    );
  }
  if (
    config.nodeEnv === 'production' &&
    (config.oauthJwtSecret.includes('dev-only') ||
      config.oauthJwtSecret.includes('replace-with') ||
      config.oauthJwtSecret.length < 32)
  ) {
    throw new Error(
      'Security violation: OAUTH_JWT_SECRET must be a strong secret (>= 32 chars) when NODE_ENV=production.',
    );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const publicBaseUrl = (parsed.PUBLIC_BASE_URL ?? `http://${parsed.HOST}:${parsed.PORT}`).replace(/\/+$/, '');
  const oauthIssuer = (parsed.OAUTH_ISSUER ?? publicBaseUrl).replace(/\/+$/, '');

  const config: AppConfig = {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    publicBaseUrl,
    ankiBackend: parsed.ANKI_BACKEND,
    ankiConnectUrl: parsed.ANKICONNECT_URL,
    ankiConnectApiKey: parsed.ANKICONNECT_API_KEY || undefined,
    ankiConnectTimeoutMs: parsed.ANKICONNECT_TIMEOUT_MS,
    ankiReadOnly: Boolean(parsed.ANKI_READ_ONLY),
    oauthJwtSecret: parsed.OAUTH_JWT_SECRET,
    oauthIssuer,
    oauthAccessTokenTtlSeconds: parsed.OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    oauthAuthorizePin: parsed.OAUTH_AUTHORIZE_PIN,
    mcpAllowUnauthenticated: Boolean(parsed.MCP_ALLOW_UNAUTHENTICATED),
    bridgeSharedToken: parsed.BRIDGE_SHARED_TOKEN || undefined,
  };

  assertHttpSecurity(config);
  return config;
}
