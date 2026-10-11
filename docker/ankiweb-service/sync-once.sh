#!/usr/bin/env bash
# Um ciclo de sincronização com o AnkiWeb via AnkiConnect (ação `sync`).
# A autenticação vem da sessão já existente no perfil Anki copiado para /data
# (nunca pedimos ou armazenamos a senha do AnkiWeb — ver ADR-0009).
set -euo pipefail

: "${ANKI_CONNECT_URL:=http://127.0.0.1:8765}"

PAYLOAD='{"action":"sync","version":6}'
if [ -n "${ANKI_CONNECT_API_KEY:-}" ]; then
  KEY_JSON="$(node -e 'process.stdout.write(JSON.stringify(process.env.ANKI_CONNECT_API_KEY))')"
  PAYLOAD="{\"action\":\"sync\",\"version\":6,\"key\":${KEY_JSON}}"
fi

TS="$(date -u +%FT%TZ)"
RESP="$(curl -sS -m 180 -X POST "${ANKI_CONNECT_URL}" \
  -H 'content-type: application/json' \
  -d "${PAYLOAD}" 2>&1 || echo '{"error":"sync request failed"}')"
echo "[sync ${TS}] ${RESP}"
