import { describe, expect, it } from 'vitest';
import { AnkiConnectClient } from '../../src/anki/client.js';
import { AnkiConnectError, AnkiTransportError } from '../../src/anki/errors.js';
import { MockAnkiConnect } from '../../src/anki/mock/mock-anki-connect.js';
import { seedCollection } from '../../src/anki/mock/seed.js';

function fakeFetch(payload: unknown, status = 200): { fetchImpl: typeof fetch; calls: Array<{ body: Record<string, unknown> }> } {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('AnkiConnectClient', () => {
  it('sends the documented envelope (action, version 6, params, key)', async () => {
    const { fetchImpl, calls } = fakeFetch({ result: 6, error: null });
    const client = new AnkiConnectClient({ url: 'http://mock', apiKey: 'k1', fetchImpl });
    const version = await client.ping();
    expect(version).toBe(6);
    expect(calls[0]?.body).toEqual({ action: 'version', version: 6, params: {}, key: 'k1' });
  });

  it('omits the key when no apiKey is configured', async () => {
    const { fetchImpl, calls } = fakeFetch({ result: [], error: null });
    const client = new AnkiConnectClient({ url: 'http://mock', fetchImpl });
    await client.invoke('deckNames');
    expect(calls[0]?.body).not.toHaveProperty('key');
  });

  it('maps AnkiConnect error strings to AnkiConnectError with the action', async () => {
    const { fetchImpl } = fakeFetch({ result: null, error: 'deck was not found: X' });
    const client = new AnkiConnectClient({ url: 'http://mock', fetchImpl });
    await expect(client.invoke('getDeckStats', { decks: ['X'] })).rejects.toMatchObject({
      code: 'ANKI_ERROR',
      action: 'getDeckStats',
      message: 'deck was not found: X',
    });
  });

  it('maps non-OK HTTP responses to AnkiTransportError', async () => {
    const { fetchImpl } = fakeFetch('boom', 500);
    const client = new AnkiConnectClient({ url: 'http://mock', fetchImpl });
    await expect(client.invoke('version')).rejects.toBeInstanceOf(AnkiTransportError);
  });

  it('maps non-JSON responses to AnkiTransportError', async () => {
    const { fetchImpl } = fakeFetch('<html>nope</html>');
    const client = new AnkiConnectClient({ url: 'http://mock', fetchImpl });
    await expect(client.invoke('version')).rejects.toThrowError(/non-JSON response/);
  });

  it('maps unexpected response shapes to AnkiTransportError', async () => {
    const { fetchImpl } = fakeFetch({ unexpected: true });
    const client = new AnkiConnectClient({ url: 'http://mock', fetchImpl });
    await expect(client.invoke('version')).rejects.toThrowError(/unexpected response shape/);
  });

  it('maps network failures to AnkiTransportError with a remediation hint', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const client = new AnkiConnectClient({ url: 'http://mock', fetchImpl });
    await expect(client.invoke('version')).rejects.toMatchObject({ code: 'ANKI_UNAVAILABLE' });
    await expect(client.invoke('version')).rejects.toThrowError(/AnkiConnect add-on/);
  });

  it('aborts slow requests with a timeout message', async () => {
    const mock = MockAnkiConnect.withSeed(seedCollection());
    mock.delayAction('version', 300);
    const listener = await mock.listen(0);
    try {
      const client = new AnkiConnectClient({ url: listener.url, timeoutMs: 50 });
      await expect(client.invoke('version')).rejects.toThrowError(/timed out after 50ms/);
    } finally {
      await listener.close();
    }
  });

  it('AnkiConnectError is an instance of the shared base class', async () => {
    const { fetchImpl } = fakeFetch({ result: null, error: 'x' });
    const client = new AnkiConnectClient({ url: 'http://mock', fetchImpl });
    const error = await client.invoke('version').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnkiConnectError);
  });
});
