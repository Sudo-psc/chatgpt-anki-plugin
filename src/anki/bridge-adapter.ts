import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { AnkiPluginError } from '../domain/errors.js';
import type { AnkiHealthStatus } from './adapter.js';
import { AnkiConnectAdapter } from './anki-connect-adapter.js';

export interface BridgeRequestMessage {
  type: 'anki_rpc_request';
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export interface BridgeResponseMessage {
  type: 'anki_rpc_response';
  id: string;
  result?: unknown;
  error?: string | null;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * WebSocket reverse-tunnel adapter (`BridgeRelayAdapter`).
 * Allows a cloud-hosted HTTPS MCP server (e.g., on Render) to execute AnkiConnect v6 actions
 * on the user's machine via an outbound `wss://` connection initiated by `npx chatgpt-anki-plugin bridge`.
 */
export class BridgeRelayAdapter extends AnkiConnectAdapter {
  private readonly sharedToken?: string;
  private readonly requestTimeoutMs: number;
  private activeSocket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingCall>();

  constructor(options: { sharedToken?: string; timeoutMs?: number }) {
    super({
      url: 'ws://bridge-tunnel/anki-connect',
      timeoutMs: options.timeoutMs ?? 8000,
      backendName: 'bridge',
      customTransport: (action, params) => this.sendOverWebSocket(action, params ?? {}),
    });
    this.sharedToken = options.sharedToken;
    this.requestTimeoutMs = options.timeoutMs ?? 8000;
  }

  public isBridgeConnected(): boolean {
    return this.activeSocket !== null && this.activeSocket.readyState === WebSocket.OPEN;
  }

  public attachSocket(ws: WebSocket): void {
    if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN) {
      this.activeSocket.close(1000, 'Replaced by newer bridge connection');
    }
    this.activeSocket = ws;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as BridgeResponseMessage;
        if (msg.type !== 'anki_rpc_response' || !msg.id) return;
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(msg.id);

        if (msg.error) {
          entry.reject(
            new AnkiPluginError(
              'ANKI_API_ERROR',
              `AnkiConnect error via bridge: ${msg.error}`,
              'Check the parameters and ensure Anki Desktop is unlocked.',
              false,
            ),
          );
        } else {
          entry.resolve(msg.result);
        }
      } catch {
        // Ignore malformed frame
      }
    });

    ws.on('close', () => {
      if (this.activeSocket === ws) {
        this.activeSocket = null;
      }
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(
          new AnkiPluginError(
            'ANKI_UNREACHABLE',
            'The local anki-bridge WebSocket tunnel disconnected while waiting for AnkiConnect.',
            'Restart `npx chatgpt-anki-plugin bridge` on the machine running Anki Desktop.',
            true,
          ),
        );
        this.pending.delete(id);
      }
    });
  }

  public verifyBridgeToken(providedToken: string | undefined): boolean {
    if (!this.sharedToken) return true;
    if (!providedToken) return false;
    const expectedBuf = Buffer.from(this.sharedToken, 'utf8');
    const providedBuf = Buffer.from(providedToken, 'utf8');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  public createWebSocketServer(): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      this.attachSocket(ws);
    });
    return wss;
  }

  private async sendOverWebSocket(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
      throw new AnkiPluginError(
        'ANKI_UNREACHABLE',
        'No local `anki-bridge` agent is currently connected to this remote MCP server.',
        'Open Anki Desktop on your computer and run: `npx chatgpt-anki-plugin bridge --server wss://<host>/bridge --token <BRIDGE_SHARED_TOKEN>`.',
        true,
      );
    }

    const id = crypto.randomUUID();
    const payload: BridgeRequestMessage = {
      type: 'anki_rpc_request',
      id,
      action,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new AnkiPluginError(
            'ANKI_TIMEOUT',
            `Bridge request '${action}' timed out after ${this.requestTimeoutMs}ms.`,
            'Verify that Anki Desktop is running and responsive on your computer.',
            true,
          ),
        );
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.activeSocket!.send(JSON.stringify(payload), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(
            new AnkiPluginError(
              'ANKI_UNREACHABLE',
              `Failed to send request over bridge WebSocket: ${err.message}`,
              'Check your network connection and restart `npx chatgpt-anki-plugin bridge`.',
              true,
            ),
          );
        }
      });
    });
  }

  public override async checkHealth(): Promise<AnkiHealthStatus> {
    if (!this.isBridgeConnected()) {
      return {
        backend: this.backendName,
        reachable: false,
        bridgeConnected: false,
        detail: 'Waiting for local `anki-bridge` WebSocket connection.',
      };
    }
    const status = await super.checkHealth();
    return {
      ...status,
      bridgeConnected: true,
    };
  }
}
