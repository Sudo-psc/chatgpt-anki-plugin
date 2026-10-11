import { z } from 'zod';

export const DEV_TOKEN_SECRET = 'dev-only-secret-change-me-0123456789abcdef';

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const spaceList = z
  .string()
  .transform((value) => value.split(/\s+/).filter((item) => item.length > 0));

const boolFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? defaultValue : value.trim().toLowerCase() === 'true',
    );

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8080'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ANKI_BACKEND: z.enum(['connect', 'mock']).default('connect'),
  ANKI_CONNECT_URL: z.string().url().default('http://127.0.0.1:8765'),
  ANKI_CONNECT_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  ANKI_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  TOKEN_SECRET: z.string().min(32).default(DEV_TOKEN_SECRET),
  TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  OAUTH_ISSUER: z
    .string()
    .url()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  OAUTH_CLIENT_ID: z.string().default('chatgpt'),
  OAUTH_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  OAUTH_ALLOW_DCR: boolFromEnv(true),
  OAUTH_ALLOWED_REDIRECT_URIS: csv.default(
    'https://chatgpt.com/connector_platform_oauth_redirect,http://localhost:3000/callback',
  ),
  DEFAULT_SCOPE: spaceList.default('anki:read anki:write anki:review'),
  AUTH_REQUIRED: boolFromEnv(true),
  MCP_DEV_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),
  ALLOWED_ORIGINS: csv.default('https://chatgpt.com,https://chat.openai.com'),
});

export interface AnkiConfig {
  backend: 'connect' | 'mock';
  url: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface AuthConfig {
  tokenSecret: string;
  tokenTtlSeconds: number;
  clientId: string;
  clientSecret?: string;
  allowDcr: boolean;
  allowedRedirectUris: string[];
  defaultScopes: string[];
  required: boolean;
  devToken?: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  publicBaseUrl: string;
  issuer: string;
  audience: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  anki: AnkiConfig;
  auth: AuthConfig;
  limits: { ratePerMinute: number; maxBodyBytes: number };
  allowedOrigins: string[];
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example for reference values.`);
  }
  const cfg = parsed.data;

  if (cfg.NODE_ENV === 'production' && cfg.TOKEN_SECRET === DEV_TOKEN_SECRET) {
    throw new Error(
      'TOKEN_SECRET must be set to a strong random value in production (generate one with `openssl rand -base64 48`).',
    );
  }

  const publicBaseUrl = normalizeUrl(cfg.PUBLIC_BASE_URL);

  return {
    nodeEnv: cfg.NODE_ENV,
    port: cfg.PORT,
    host: cfg.HOST,
    publicBaseUrl,
    issuer: normalizeUrl(cfg.OAUTH_ISSUER ?? publicBaseUrl),
    audience: publicBaseUrl,
    logLevel: cfg.LOG_LEVEL,
    anki: {
      backend: cfg.ANKI_BACKEND,
      url: cfg.ANKI_CONNECT_URL,
      apiKey: cfg.ANKI_CONNECT_API_KEY,
      timeoutMs: cfg.ANKI_TIMEOUT_MS,
    },
    auth: {
      tokenSecret: cfg.TOKEN_SECRET,
      tokenTtlSeconds: cfg.TOKEN_TTL_SECONDS,
      clientId: cfg.OAUTH_CLIENT_ID,
      clientSecret: cfg.OAUTH_CLIENT_SECRET,
      allowDcr: cfg.OAUTH_ALLOW_DCR,
      allowedRedirectUris: cfg.OAUTH_ALLOWED_REDIRECT_URIS,
      defaultScopes: cfg.DEFAULT_SCOPE,
      required: cfg.AUTH_REQUIRED,
      devToken: cfg.MCP_DEV_TOKEN,
    },
    limits: {
      ratePerMinute: cfg.RATE_LIMIT_PER_MINUTE,
      maxBodyBytes: cfg.MAX_BODY_BYTES,
    },
    allowedOrigins: cfg.ALLOWED_ORIGINS,
  };
}
