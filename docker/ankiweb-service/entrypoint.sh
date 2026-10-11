#!/usr/bin/env bash
# Supervisor do microsserviço AnkiWeb-as-API:
#   1) prepara AnkiConnect (pinado na imagem) no volume
#   2) sobe Anki headless sob Xvfb
#   3) espera o AnkiConnect responder em 127.0.0.1:8765
#   4) liga o loop de sync com o AnkiWeb
#   5) executa o servidor MCP (foreground; o container vive e morre com ele)
set -euo pipefail

: "${ANKI_BASE:=/data}"
: "${ANKI_CONNECT_URL:=http://127.0.0.1:8765}"
: "${SYNC_INTERVAL_SECONDS:=900}"

json_string() { node -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""))' "$1"; }

mkdir -p "${ANKI_BASE}"

# -- 1) AnkiConnect no volume (imagem é imutável; volume é atualizável) --------
ADDON_DIR="${ANKI_BASE}/addons21/AnkiConnect"
mkdir -p "$ADDON_DIR"
cp -f /opt/anki-connect/plugin/*.py "$ADDON_DIR/"

API_KEY_JSON=null
if [ -n "${ANKI_CONNECT_API_KEY:-}" ]; then
  API_KEY_JSON="$(json_string "${ANKI_CONNECT_API_KEY}")"
fi
cat > "$ADDON_DIR/config.json" <<EOF
{
  "apiKey": ${API_KEY_JSON},
  "apiLogPath": null,
  "webBindAddress": "127.0.0.1",
  "webBindPort": 8765,
  "webCorsOriginList": ["http://localhost"],
  "ignoreOriginList": []
}
EOF

# -- 2) Anki headless ---------------------------------------------------------
PROFILE_ARGS=()
if [ -n "${ANKI_PROFILE:-}" ]; then PROFILE_ARGS=(-p "${ANKI_PROFILE}"); fi
echo "[ankiweb-service] iniciando Anki ${ANKI_VERSION:-} headless (base=${ANKI_BASE}${ANKI_PROFILE:+, perfil=${ANKI_PROFILE}})"
xvfb-run -a -s "-screen 0 1280x1024x24" /opt/anki/anki "${PROFILE_ARGS[@]}" \
  >/var/log/anki.log 2>&1 &
ANKI_PID=$!

# -- 3) espera o AnkiConnect --------------------------------------------------
READY=0
for _ in $(seq 1 240); do
  if curl -fsS -m 2 -X POST "${ANKI_CONNECT_URL}" \
      -H 'content-type: application/json' \
      -d '{"action":"version","version":6}' >/dev/null 2>&1; then
    READY=1
    break
  fi
  if ! kill -0 "$ANKI_PID" 2>/dev/null; then
    echo "[ankiweb-service] ERRO: Anki encerrou inesperadamente. Últimas linhas do log:"
    tail -n 80 /var/log/anki.log || true
    exit 1
  fi
  sleep 1
done
if [ "$READY" != 1 ]; then
  echo "[ankiweb-service] ERRO: AnkiConnect não respondeu em 240s. Últimas linhas do log:"
  tail -n 80 /var/log/anki.log || true
  exit 1
fi
echo "[ankiweb-service] AnkiConnect pronto em ${ANKI_CONNECT_URL}"

# -- 4) loop de sync com o AnkiWeb -------------------------------------------
if [ "${DISABLE_SYNC_LOOP:-}" != "1" ]; then
  (
    sleep "${SYNC_STARTUP_DELAY_SECONDS:-10}"
    while :; do
      /usr/local/bin/sync-once.sh || true
      sleep "$SYNC_INTERVAL_SECONDS"
    done
  ) &
  echo "[ankiweb-service] loop de sync ligado (intervalo: ${SYNC_INTERVAL_SECONDS}s)"
else
  echo "[ankiweb-service] loop de sync DESABILITADO (DISABLE_SYNC_LOOP=1)"
fi

# -- 5) servidor MCP (foreground) --------------------------------------------
cleanup() {
  kill "$ANKI_PID" 2>/dev/null || true
}
trap cleanup TERM INT EXIT

echo "[ankiweb-service] iniciando servidor MCP na porta ${PORT:-8080}"
node /app/dist/index.js &
NODE_PID=$!
wait "$NODE_PID"
