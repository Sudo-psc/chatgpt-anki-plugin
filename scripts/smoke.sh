#!/usr/bin/env bash
# Smoke test end-to-end contra um servidor em modo demo (coleção sintética).
# Uso: bash scripts/smoke.sh   (requer curl e npx)
set -euo pipefail

PORT="${SMOKE_PORT:-18099}"
BASE="http://127.0.0.1:${PORT}"
TOKEN="smoke-dev-token-0123456789abcdef"

cd "$(dirname "$0")/.."

fail() { echo "✗ $1"; exit 1; }
ok() { echo "✓ $1"; }

echo "→ subindo servidor (backend mock) em :${PORT}"
ANKI_BACKEND=mock MCP_DEV_TOKEN="$TOKEN" PORT="$PORT" LOG_LEVEL=warn npx tsx src/index.ts >/tmp/chatgpt-anki-smoke.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -sf "${BASE}/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

curl -sf "${BASE}/health" | grep -q '"status":"ok"' || fail "health check"
ok "GET /health 200"

curl -sf "${BASE}/ready" | grep -q '"anki":"ok"' || fail "ready check"
ok "GET /ready 200 (AnkiConnect acessível)"

# A spec MCP 2025-06-18 exige Accept com ambos os content-types.
MCP_POST() {
  curl -s -X POST "${BASE}/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -H "authorization: Bearer ${TOKEN}" \
    -H 'mcp-protocol-version: 2025-06-18' \
    -d "$1"
}

MCP_POST '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | grep -q '"serverInfo"' || fail "initialize"
ok "initialize"

TOOLS=$(MCP_POST '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
echo "$TOOLS" | grep -q '"list_decks"' || fail "tools/list sem list_decks"
echo "$TOOLS" | grep -q '"submit_review"' || fail "tools/list sem submit_review"
echo "$TOOLS" | grep -q '"update_model_templates"' || fail "tools/list sem update_model_templates"
ok "tools/list (15 tools)"

MCP_POST '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_decks","arguments":{}}}' | grep -q '"Default"' || fail "tools/call list_decks"
ok "tools/call list_decks"

MCP_POST '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_due_cards","arguments":{"limit":1}}}' | grep -q '"card_id"' || fail "tools/call get_due_cards"
ok "tools/call get_due_cards"

echo "✓ smoke test completo: servidor MCP operacional com backend sintético"
