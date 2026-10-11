#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAnkiAdapter } from './anki/index.js';
import { loadConfig } from './infra/config.js';
import { logger } from './infra/logger.js';
import { createHttpApp } from './mcp/http-server.js';
import { createMcpServerInstance } from './mcp/server.js';
import { ALL_OAUTH_SCOPES } from './tools/context.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useStdio = args.includes('--stdio');
  const config = loadConfig(process.env);
  const { adapter, bridgeAdapter } = createAnkiAdapter(config);

  if (useStdio) {
    const server = createMcpServerInstance({
      anki: adapter,
      config,
      grantedScopes: new Set(ALL_OAUTH_SCOPES),
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info({ backend: adapter.backendName }, 'MCP server running on stdio');
    return;
  }

  const { createHttpServer } = createHttpApp({
    config,
    anki: adapter,
    bridgeAdapter,
  });

  const httpServer = createHttpServer();
  httpServer.listen(config.port, config.host, () => {
    logger.info(
      {
        host: config.host,
        port: config.port,
        publicBaseUrl: config.publicBaseUrl,
        backend: adapter.backendName,
        readOnly: config.ankiReadOnly,
      },
      'MCP HTTP server listening',
    );
  });

  const shutdown = (): void => {
    logger.info('Shutting down MCP HTTP server…');
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Fatal startup error');
  process.exit(1);
});
