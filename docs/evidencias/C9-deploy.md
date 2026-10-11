# Evidência C9 — Servidor MCP público em HTTPS com healthcheck 200

**Data:** 2026-10-11 · **Host:** Fly.io (região `gru`) · **App:** `chatgpt-anki-mcp-sudo`
**URL:** https://chatgpt-anki-mcp-sudo.fly.dev · **Modo:** `ANKI_BACKEND=mock`
(coleção 100% sintética — instância de demonstração/revisão; ADR-0004/0008)

## Deploy

- `fly apps create chatgpt-anki-mcp-sudo` (o nome `chatgpt-anki-mcp` é global e estava ocupado).
- `fly secrets set TOKEN_SECRET=<48 bytes> OAUTH_CLIENT_ID=chatgpt` (dev token **não** configurado).
- `fly deploy --remote-only` → build remoto da imagem multi-stage (Dockerfile do repo).
- `fly scale count 1` — ver nota de escala abaixo.

## Verificações (curl, 2026-10-11)

```
GET /health
{"status":"ok","name":"chatgpt-anki-mcp","version":"0.1.0","uptime_seconds":14}

GET /ready
{"status":"ready","anki":"ok","anki_connect_version":6}

GET /.well-known/oauth-authorization-server
{"issuer":"https://chatgpt-anki-mcp-sudo.fly.dev", "authorization_endpoint": ...}

POST /mcp (sem token)
HTTP/2 401
www-authenticate: Bearer resource_metadata="https://chatgpt-anki-mcp-sudo.fly.dev/.well-known/oauth-protected-resource"
{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"Unauthorized: missing Authorization header. Obtain an access token via OAuth."}}
```

## E2E público (OAuth → tools) executado contra a instância real

```
list_decks  → isError: false | decks: 6
get_due_cards → isError: false | total_due: 6
create_note → isError: false | note_id: 1700000000015
delete_deck (sem confirm) → code: VALIDATION_ERROR
update_model_templates (sem admin) → code: FORBIDDEN
```

## Achado operacional (2 machines → 1 machine)

O deploy inicial criou **2 machines** (HA). Com isso, o `code` do OAuth gravado
em memória na machine A podia ser trocado na machine B ⇒ `invalid_grant`.
Correção: `fly scale count 1` (estado em memória: códigos OAuth, clientes DCR e
rate limit — ADR-0007). Múltiplas machines exigem store compartilhado (roadmap
R-03). Registrado no runbook §1.

## CI

`FLY_API_TOKEN` (deploy token por app) configurado como secret do repositório —
o workflow `Deploy (Fly.io)` opera via `workflow_dispatch`.
