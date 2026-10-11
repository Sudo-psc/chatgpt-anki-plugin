#!/usr/bin/env node
/**
 * One-shot smoke test script against a running local or remote MCP server.
 */

const baseUrl = (process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

async function runSmoke() {
  const healthRes = await fetch(`${baseUrl}/health`);
  if (!healthRes.ok) {
    throw new Error(`Healthcheck failed with status ${healthRes.status}`);
  }
  const health = await healthRes.json();
  console.log('[smoke] /health OK:', JSON.stringify(health));

  const prmRes = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
  if (!prmRes.ok) {
    throw new Error(`Protected resource metadata failed with status ${prmRes.status}`);
  }
  console.log('[smoke] /.well-known/oauth-protected-resource OK');
}

runSmoke().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
