import { createApp } from './app.js';
import { AnkiGateway } from './anki/index.js';
import { MockAnkiConnect } from './anki/mock/mock-anki-connect.js';
import { seedCollection } from './anki/mock/seed.js';
import { loadConfig } from './infra/config.js';
import { createLogger } from './infra/logger.js';
import { OAuthService } from './mcp/auth/oauth.js';
import { FixedWindowLimiter } from './mcp/ratelimit.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  let stopMock: (() => Promise<void>) | undefined;
  let ankiUrl = config.anki.url;

  if (config.anki.backend === 'mock') {
    const mock = MockAnkiConnect.withSeed(seedCollection());
    const listener = await mock.listen(0);
    ankiUrl = listener.url;
    stopMock = listener.close;
    logger.info('mock_anki_backend_started', {
      url: listener.url,
      note: 'coleção sintética de demonstração — não use para dados reais',
    });
  }

  const gateway = new AnkiGateway({
    url: ankiUrl,
    apiKey: config.anki.apiKey,
    timeoutMs: config.anki.timeoutMs,
  });

  const oauth = new OAuthService({
    allowedRedirectUris: config.auth.allowedRedirectUris,
    defaultScopes: config.auth.defaultScopes,
    allowDcr: config.auth.allowDcr,
    envClient: {
      clientId: config.auth.clientId,
      ...(config.auth.clientSecret ? { clientSecret: config.auth.clientSecret } : {}),
      redirectUris: config.auth.allowedRedirectUris,
    },
  });

  const limiter = new FixedWindowLimiter(config.limits.ratePerMinute);

  const app = await createApp({ config, logger, gateway, oauth, limiter });
  await new Promise<void>((resolve) => {
    app.server.listen(config.port, config.host, resolve);
  });

  logger.info('server_listening', {
    port: config.port,
    host: config.host,
    public_base_url: config.publicBaseUrl,
    anki_backend: config.anki.backend,
    auth_required: config.auth.required,
    node_env: config.nodeEnv,
  });

  const shutdown = (signal: string): void => {
    void (async () => {
      logger.info('shutdown_started', { signal });
      await app.close();
      if (stopMock) await stopMock();
      process.exit(0);
    })();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'fatal_startup_error', error: message })}\n`);
  process.exit(1);
});
