#!/usr/bin/env node
import { WebSocket } from 'ws';
import type { BridgeRequestMessage, BridgeResponseMessage } from '../anki/bridge-adapter.js';

export interface BridgeClientOptions {
  serverUrl: string;
  token?: string;
  ankiConnectUrl: string;
  ankiConnectApiKey?: string;
}

export async function forwardToLocalAnkiConnect(
  msg: BridgeRequestMessage,
  ankiConnectUrl: string,
  apiKey?: string,
): Promise<BridgeResponseMessage> {
  try {
    const payload: Record<string, unknown> = {
      action: msg.action,
      version: 6,
      params: msg.params ?? {},
    };
    if (apiKey) {
      payload.key = apiKey;
    }

    const res = await fetch(ankiConnectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        type: 'anki_rpc_response',
        id: msg.id,
        error: `Local AnkiConnect returned HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as { result: unknown; error: string | null };
    return {
      type: 'anki_rpc_response',
      id: msg.id,
      result: body.result,
      error: body.error,
    };
  } catch (err) {
    return {
      type: 'anki_rpc_response',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function startBridgeClient(options: BridgeClientOptions): { close: () => void } {
  let closedByUser = false;
  let activeWs: WebSocket | null = null;
  let retryAttempt = 0;

  const connect = (): void => {
    if (closedByUser) return;
    const headers: Record<string, string> = {};
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const ws = new WebSocket(options.serverUrl, { headers });
    activeWs = ws;

    ws.on('open', () => {
      retryAttempt = 0;
      console.error(`[anki-bridge] Connected to ${options.serverUrl} -> forwarding to ${options.ankiConnectUrl}`);
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as BridgeRequestMessage;
        if (msg.type !== 'anki_rpc_request' || !msg.id) return;
        const reply = await forwardToLocalAnkiConnect(msg, options.ankiConnectUrl, options.ankiConnectApiKey);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(reply));
        }
      } catch {
        // Ignore invalid frame
      }
    });

    ws.on('close', () => {
      if (closedByUser) return;
      retryAttempt += 1;
      const delayMs = Math.min(15_000, 1000 * 2 ** Math.min(retryAttempt, 4));
      console.error(`[anki-bridge] Disconnected. Reconnecting in ${delayMs}ms...`);
      setTimeout(connect, delayMs);
    });

    ws.on('error', (err) => {
      console.error(`[anki-bridge] WebSocket error: ${err.message}`);
    });
  };

  connect();

  return {
    close: () => {
      closedByUser = true;
      activeWs?.close();
    },
  };
}

function parseArgs(argv: string[]): BridgeClientOptions {
  let serverUrl = process.env.BRIDGE_SERVER_URL ?? 'ws://127.0.0.1:3000/bridge';
  let token = process.env.BRIDGE_SHARED_TOKEN;
  let ankiConnectUrl = process.env.ANKICONNECT_URL ?? 'http://127.0.0.1:8765';
  const ankiConnectApiKey = process.env.ANKICONNECT_API_KEY;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--server' && argv[i + 1]) {
      serverUrl = argv[++i]!;
    } else if (arg === '--token' && argv[i + 1]) {
      token = argv[++i]!;
    } else if (arg === '--anki' && argv[i + 1]) {
      ankiConnectUrl = argv[++i]!;
    }
  }

  return { serverUrl, token, ankiConnectUrl, ankiConnectApiKey };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  startBridgeClient(opts);
}
