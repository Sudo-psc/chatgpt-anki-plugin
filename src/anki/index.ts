import type { AppConfig } from '../infra/config.js';
import type { AnkiAdapter } from './adapter.js';
import { AnkiConnectAdapter } from './anki-connect-adapter.js';
import { BridgeRelayAdapter } from './bridge-adapter.js';
import { InMemoryAnkiAdapter } from './memory-adapter.js';

export * from './adapter.js';
export * from './anki-connect-adapter.js';
export * from './bridge-adapter.js';
export * from './memory-adapter.js';
export * from './review.js';
export * from './search.js';

export function createAnkiAdapter(config: AppConfig): {
  adapter: AnkiAdapter;
  bridgeAdapter?: BridgeRelayAdapter;
} {
  if (config.ankiBackend === 'memory') {
    return { adapter: new InMemoryAnkiAdapter(true) };
  }
  if (config.ankiBackend === 'bridge') {
    const bridgeAdapter = new BridgeRelayAdapter({
      sharedToken: config.bridgeSharedToken,
      timeoutMs: config.ankiConnectTimeoutMs,
    });
    return { adapter: bridgeAdapter, bridgeAdapter };
  }

  const bridgeAdapter = new BridgeRelayAdapter({
    sharedToken: config.bridgeSharedToken,
    timeoutMs: config.ankiConnectTimeoutMs,
  });

  const directAdapter = new AnkiConnectAdapter({
    url: config.ankiConnectUrl,
    apiKey: config.ankiConnectApiKey,
    timeoutMs: config.ankiConnectTimeoutMs,
  });

  // If a bridge client is actively connected to this server, route through it automatically;
  // otherwise use direct local AnkiConnect HTTP.
  const hybridAdapter = new AnkiConnectAdapter({
    url: config.ankiConnectUrl,
    apiKey: config.ankiConnectApiKey,
    timeoutMs: config.ankiConnectTimeoutMs,
    customTransport: async (action, params) => {
      if (bridgeAdapter.isBridgeConnected()) {
        return bridgeAdapter.invokeRaw(action, params);
      }
      return directAdapter.invokeRaw(action, params);
    },
  });

  return { adapter: hybridAdapter, bridgeAdapter };
}
