import crypto from 'node:crypto';
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Express, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { AnkiAdapter } from '../anki/adapter.js';
import type { BridgeRelayAdapter } from '../anki/bridge-adapter.js';
import type { AppConfig } from '../infra/config.js';
import { logger } from '../infra/logger.js';
import { telemetry } from '../infra/telemetry.js';
import { OAuth2Server, type VerifiedAccessToken } from './auth/oauth.js';
import { createMcpServerInstance, SERVER_NAME, SERVER_VERSION } from './server.js';

export interface HttpAppBundle {
  app: Express;
  oauth: OAuth2Server;
  createHttpServer: () => http.Server;
}

export function createHttpApp(options: {
  config: AppConfig;
  anki: AnkiAdapter;
  bridgeAdapter?: BridgeRelayAdapter;
}): HttpAppBundle {
  const { config, anki, bridgeAdapter } = options;
  const app = express();
  const oauth = new OAuth2Server(config);

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // Request correlation ID & telemetry counter
  app.use((req, res, next) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    telemetry.recordHttpRequest();
    next();
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(apiLimiter);

  // Root landing page so visiting https://<host>/ in a browser confirms all endpoints
  app.get('/', async (_req: Request, res: Response): Promise<void> => {
    const ankiHealth = await anki.checkHealth();
    res.status(200).json({
      service: SERVER_NAME,
      version: SERVER_VERSION,
      status: 'ok',
      endpoints: {
        mcp: `${config.publicBaseUrl}/mcp`,
        health: `${config.publicBaseUrl}/health`,
        oauthProtectedResource: `${config.publicBaseUrl}/.well-known/oauth-protected-resource`,
        oauthAuthorizationServer: `${config.publicBaseUrl}/.well-known/oauth-authorization-server`,
        privacy: `${config.publicBaseUrl}/privacy`,
        terms: `${config.publicBaseUrl}/terms`,
        bridgeWebSocket: `${config.publicBaseUrl.replace(/^http/, 'ws')}/bridge`,
      },
      anki: {
        ...ankiHealth,
        bridgeConnected: bridgeAdapter?.isBridgeConnected() ?? false,
      },
    });
  });

  // Healthcheck endpoints (C9: /health and /healthz)
  const handleHealth = async (_req: Request, res: Response): Promise<void> => {
    const ankiHealth = await anki.checkHealth();
    res.status(200).json({
      status: 'ok',
      service: SERVER_NAME,
      version: SERVER_VERSION,
      uptimeSeconds: telemetry.snapshot().uptimeSeconds,
      anki: {
        ...ankiHealth,
        bridgeConnected: bridgeAdapter?.isBridgeConnected() ?? false,
      },
    });
  };
  app.get('/health', handleHealth);
  app.get('/healthz', handleHealth);

  // Operational metrics endpoint
  app.get('/metrics', (_req: Request, res: Response) => {
    res.status(200).json(telemetry.snapshot());
  });

  // Public Privacy Policy & Terms of Service pages required for OpenAI App Submission (C11)
  app.get('/privacy', (_req: Request, res: Response) => {
    res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Política de Privacidade — chatgpt-anki-plugin</title></head>
<body style="font-family:sans-serif;max-width:760px;margin:32px auto;padding:0 16px;line-height:1.6;">
  <h1>Política de Privacidade — chatgpt-anki-plugin</h1>
  <p><strong>Última atualização:</strong> 2026-10-10</p>
  <p>O <code>chatgpt-anki-plugin</code> é um servidor Model Context Protocol (MCP) open-source (licença MIT) que conecta o ChatGPT à coleção Anki do próprio usuário.</p>
  <h2>1. Dados Processados e Zero Retenção</h2>
  <ul>
    <li><strong>Conteúdo de Flashcards (Baralhos, Notas, Cartões, Tags e Estatísticas):</strong> processado exclusivamente em memória volátil durante a requisição ativa (<em>stateless pass-through</em>). Nenhum cartão é armazenado em banco de dados do servidor.</li>
    <li><strong>Credenciais do AnkiWeb:</strong> jamais solicitamos, coletamos ou armazenamos usuário ou senha do <code>ankiweb.net</code>.</li>
    <li><strong>Logs Técnicos:</strong> registramos apenas nome da tool invocada, latência em milissegundos, status e <code>requestId</code>, com redação automática de campos de notas e tokens.</li>
  </ul>
  <h2>2. Segurança e Controle do Titular (LGPD / GDPR)</h2>
  <p>A comunicação utiliza HTTPS/TLS e autenticação OAuth 2.1 com PKCE (S256) e escopos por operação (<code>anki:read</code>, <code>anki:write</code>, <code>anki:review</code>, <code>anki:delete</code>). O titular pode revogar tokens a qualquer momento via <code>POST /oauth/revoke</code> ou desconectando o app nas configurações do ChatGPT.</p>
</body>
</html>`);
  });

  app.get('/terms', (_req: Request, res: Response) => {
    res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Termos de Uso — chatgpt-anki-plugin</title></head>
<body style="font-family:sans-serif;max-width:760px;margin:32px auto;padding:0 16px;line-height:1.6;">
  <h1>Termos de Uso — chatgpt-anki-plugin</h1>
  <p>Este serviço e seu código-fonte são disponibilizados sob a licença MIT, sem garantias expressas ou implícitas.</p>
  <p>O projeto não possui afiliação com a Ankitects Pty Ltd (Anki / AnkiWeb) nem com a OpenAI. O usuário concorda em utilizar a integração em conformidade com os Termos de Serviço do AnkiWeb e manter backups regulares de sua coleção (<code>.colpkg</code>).</p>
</body>
</html>`);
  });

  // OAuth 2.1 Discovery (RFC 9728 & RFC 8414) + Endpoints
  app.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    res.status(200).json(oauth.getProtectedResourceMetadata());
  });
  app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    res.status(200).json(oauth.getAuthorizationServerMetadata());
  });
  app.use(oauth.createRouter());

  // Stateless Streamable HTTP MCP endpoint (/mcp) protected by OAuth 2.1 Bearer middleware
  const authMiddleware = oauth.createAuthMiddleware();

  app.post('/mcp', authMiddleware, async (req: Request, res: Response) => {
    const auth = (req as Request & { auth?: VerifiedAccessToken }).auth;
    const mcpServer = createMcpServerInstance({
      anki,
      config,
      grantedScopes: auth?.scopes,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close();
      void mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Unhandled error in POST /mcp');
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', authMiddleware, (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Stateless Streamable HTTP MCP server requires POST /mcp.' },
      id: null,
    });
  });

  app.delete('/mcp', authMiddleware, (_req: Request, res: Response) => {
    res.status(204).end();
  });

  const createHttpServer = (): http.Server => {
    const server = http.createServer(app);
    if (bridgeAdapter) {
      const wss = bridgeAdapter.createWebSocketServer();
      server.on('upgrade', (request, socket, head) => {
        const reqUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        if (reqUrl.pathname !== '/bridge') {
          socket.destroy();
          return;
        }
        const authHeader = request.headers.authorization ?? '';
        const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
          ? authHeader.slice(7).trim()
          : (reqUrl.searchParams.get('token') ?? undefined);

        if (!bridgeAdapter.verifyBridgeToken(bearerToken)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
    }
    return server;
  };

  return { app, oauth, createHttpServer };
}
