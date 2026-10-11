#!/usr/bin/env bash
# Supervisor do microsserviço AnkiWeb-as-API:
#   1) prepara AnkiConnect (pinado na imagem) no volume
#   2) sobe Anki headless sob Xvfb
#   3) sobe JÁ o servidor MCP (liveness não depende do Anki; /ready indica)
#   4) em background: espera o AnkiConnect e liga o loop de sync com o AnkiWeb
#
# Se o Anki morrer ou o AnkiConnect não responder, o serviço sai de propósito
# para a plataforma reiniciar o container (e os logs ficam visíveis).
set -euo pipefail

: "${ANKI_BASE:=/data}"
: "${ANKI_CONNECT_URL:=http://127.0.0.1:8765}"
: "${SYNC_INTERVAL_SECONDS:=900}"

json_string() { node -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""))' "$1"; }

# Modo de depuração: mantém o container em repouso (com /health verde)
# para inspeção via SSH, sem subir Anki/MCP.
if [ "${DEBUG_HOLD:-}" = "1" ]; then
  echo "[ankiweb-service] DEBUG_HOLD ativo — container em repouso (sem Anki/MCP)."
  exec node -e "require('node:http').createServer((_, res) => { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({ status: 'ok', debug_hold: true })); }).listen(process.env.PORT || 8080, '0.0.0.0', () => console.log('[ankiweb-service] DEBUG_HOLD health em ' + (process.env.PORT || 8080)));"
fi

dump_anki_log() {
  echo "[ankiweb-service] últimas linhas de /var/log/anki.log:"
  tail -n 80 /var/log/anki.log 2>/dev/null || true
}

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

# -- 2) perfil: bootstrap programático quando o volume está vazio -------------
# Sem prefs21.db, o Anki abre a tela de criação de perfil (modal) e o
# AnkiConnect nunca sobe. Criamos o perfil via Python embutido do bundle.
PROFILE_NAME="${ANKI_PROFILE:-User 1}"
# Roda em TODO boot (idempotente, ~1s). Receita validada em produção (2026-10-11):
#   - criar perfil via ProfileManager NÃO grava 'defaultLang' no meta; sem essa
#     chave o Anki 26.x crasha no boot headless
#     (setupLangAndBackend → lang_to_disk_lang(None));
#   - gravamos o meta diretamente na tabela 'profiles' do prefs21.db
#     (mesmo formato: pickle de dict — protocolo idêntico ao do próprio Anki);
#   - o registro '_global' recebe os defaults esperados pelo GUI.
if ! PYTHONPATH="/opt/anki/app_packages:/opt/anki/python/lib/python3.13.zip:/opt/anki/python/lib/python3.13" \
     QT_QPA_PLATFORM=offscreen \
     /opt/anki/python/bin/python3.13 - "${ANKI_BASE}" "${PROFILE_NAME}" <<'PY'
import os
import pickle
import sqlite3
import sys
import time
import uuid

base, name = sys.argv[1], sys.argv[2]
db_path = os.path.join(base, "prefs21.db")

if not os.path.exists(db_path):
    import anki.lang as al

    for lang in ("en", None):
        try:
            al.set_lang(lang)
            break
        except Exception:
            continue
    from aqt.profiles import ProfileManager

    pm = ProfileManager(base)
    pm.setupMeta()

db = sqlite3.connect(db_path)
if not [r[1] for r in db.execute("pragma table_info(profiles)")]:
    raise SystemExit("prefs21.db sem tabela profiles")


def read_meta(row):
    if row and row[0]:
        try:
            meta = pickle.loads(row[0])
            if isinstance(meta, dict):
                return meta
        except Exception:
            pass
    return {}


def write_meta(profile, meta):
    data = pickle.dumps(meta)
    row = db.execute("select data from profiles where name=?", (profile,)).fetchone()
    if row is None:
        db.execute("insert into profiles (name, data) values (?, ?)", (profile, data))
    else:
        db.execute("update profiles set data=? where name=?", (data, profile))


now = int(time.time())
global_meta = read_meta(db.execute("select data from profiles where name='_global'").fetchone())
global_meta.setdefault("created", now)
global_meta.setdefault("defaultLang", "en")
global_meta.setdefault("firstRun", False)
global_meta.setdefault("id", str(uuid.uuid4()))
global_meta.setdefault("lastMsg", 0)
global_meta.setdefault("last_run_version", "")
global_meta.setdefault("suppressUpdate", False)
global_meta.setdefault("updates", True)
global_meta.setdefault("ver", 0)
write_meta("_global", global_meta)

profile_meta = read_meta(db.execute("select data from profiles where name=?", (name,)).fetchone())
profile_meta.setdefault("defaultLang", "en")
profile_meta.setdefault("lang", "en")
write_meta(name, profile_meta)
db.commit()
print(
    "[ankiweb-service] meta pronta:",
    [r[0] for r in db.execute("select name from profiles")],
    "| defaultLang:",
    global_meta["defaultLang"],
)
PY
then
  :
else
  echo "[ankiweb-service] AVISO: preparação de perfil/meta falhou"
  rm -f "${ANKI_BASE}/prefs21.db-journal"
fi

# -- 3) Anki headless (com auto-restart supervisionado) -----------------------
PROFILE_ARGS=()
if [ -n "${ANKI_PROFILE:-}" ]; then PROFILE_ARGS=(-p "${ANKI_PROFILE}"); fi
start_anki() {
  echo "[ankiweb-service] iniciando Anki headless (base=${ANKI_BASE}${ANKI_PROFILE:+, perfil=${ANKI_PROFILE}})"
  xvfb-run -a -s "-screen 0 1280x1024x24" /opt/anki/anki "${PROFILE_ARGS[@]}" \
    >>/var/log/anki.log 2>&1 &
  ANKI_PID=$!
}
: > /var/log/anki.log
start_anki

# -- 4) servidor MCP imediatamente (healthcheck não depende do Anki) ----------
echo "[ankiweb-service] iniciando servidor MCP na porta ${PORT:-8080}"
node /app/dist/index.js &
NODE_PID=$!

cleanup() { kill "$ANKI_PID" 2>/dev/null || true; }
trap cleanup TERM INT EXIT

# -- 5) em background: espera o AnkiConnect e liga o sync ---------------------
(
  READY=0
  RELAUNCHES=0
  for _ in $(seq 1 "${ANKI_READY_TIMEOUT_SECONDS:-240}"); do
    if curl -fsS -m 2 -X POST "${ANKI_CONNECT_URL}" \
        -H 'content-type: application/json' \
        -d '{"action":"version","version":6}' >/dev/null 2>&1; then
      READY=1
      break
    fi
    if ! kill -0 "$ANKI_PID" 2>/dev/null; then
      RELAUNCHES=$((RELAUNCHES + 1))
      echo "[ankiweb-service] Anki encerrou (tentativa ${RELAUNCHES}/${ANKI_RELAUNCH_MAX:-5})."
      dump_anki_log
      if [ "$RELAUNCHES" -ge "${ANKI_RELAUNCH_MAX:-5}" ]; then
        echo "[ankiweb-service] ERRO: limite de reinícios do Anki atingido."
        kill -TERM "$NODE_PID" 2>/dev/null || true
        exit 1
      fi
      sleep 5
      start_anki
    fi
    sleep 1
  done

  if [ "$READY" != 1 ]; then
    echo "[ankiweb-service] ERRO: AnkiConnect não respondeu em ${ANKI_READY_TIMEOUT_SECONDS:-240}s."
    dump_anki_log
    kill -TERM "$NODE_PID" 2>/dev/null || true
    exit 1
  fi
  echo "[ankiweb-service] AnkiConnect pronto em ${ANKI_CONNECT_URL}"

  if [ "${DISABLE_SYNC_LOOP:-}" = "1" ]; then
    echo "[ankiweb-service] loop de sync DESABILITADO (DISABLE_SYNC_LOOP=1)"
    exit 0
  fi

  sleep "${SYNC_STARTUP_DELAY_SECONDS:-10}"
  echo "[ankiweb-service] loop de sync ligado (intervalo: ${SYNC_INTERVAL_SECONDS}s)"
  while :; do
    /usr/local/bin/sync-once.sh || true
    sleep "$SYNC_INTERVAL_SECONDS"
  done
) &

# -- foreground: o container vive enquanto o servidor MCP viver ---------------
wait "$NODE_PID"
