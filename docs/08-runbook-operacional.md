# 08 — Runbook Operacional

Público: quem opera uma instância do servidor (self-host ou Fly.io).
Princípio: o servidor é stateless; incidentes de dados no servidor são
impossíveis — os incidentes reais são **segredo**, **disponibilidade** e
**alcance do AnkiConnect**.

## 1. Deploy

### 1.1 Fly.io (produção de referência)

```bash
fly apps create chatgpt-anki-mcp           # uma vez
fly secrets set \
  TOKEN_SECRET="$(openssl rand -base64 48)" \
  OAUTH_CLIENT_ID=chatgpt
fly deploy --dockerfile docker/Dockerfile  # ou workflow Deploy (gh)
curl -fsS https://chatgpt-anki-mcp.fly.dev/health   # {"status":"ok",...}
```

> O AnkiConnect do usuário não vive no Fly: aponte `ANKI_CONNECT_URL` para o seu
> túnel privado (Tailscale/cloudflared) ou rode a instância na sua máquina e
> use o Fly apenas como proxy TLS. **Nunca** exponha o AnkiConnect à Internet
> aberta sem `apiKey` (ver ADR-0001).
>
> **Escala — obrigatório 1 machine:** códigos OAuth, clientes DCR e rate limit
> são em memória por instância (ADR-0007). Com 2+ machines sem sticky sessions,
> o `code` emitido em uma instância pode ser trocado em outra ⇒ `invalid_grant`
> (observado no deploy inicial). Mantenha `fly scale count 1`; store
> compartilhado é o roadmap R-03.

### 1.2 Docker Compose (self-host)

```bash
cp .env.example .env                       # edite TOKEN_SECRET e ANKI_CONNECT_URL
docker compose -f docker/docker-compose.yml up -d --build
curl -fsS http://localhost:8080/health
```

### 1.3 Verificação pós-deploy

1. `GET /health` → 200 `{"status":"ok"}`.
2. `GET /ready` → 200 `{"anki":"ok"}` (se 503: ver §4).
3. `GET /.well-known/oauth-authorization-server` → metadata com issuer correto.
4. Conectar no ChatGPT (developer mode) ou rodar `bash scripts/smoke.sh`.

## 2. Rotação de segredos

| Segredo | Procedimento | Efeito |
|:---|:---|:---|
| `TOKEN_SECRET` | `fly secrets set TOKEN_SECRET="$(openssl rand -base64 48)"` (ou editar `.env` + `docker compose up -d`) | **Invalida todos os access tokens**; o ChatGPT re-autoriza automaticamente na próxima chamada (401 → OAuth) |
| `ANKI_CONNECT_API_KEY` | Alterar no add-on AnkiConnect (Config → apiKey) e depois `fly secrets set ANKI_CONNECT_API_KEY=...` | Chamadas ao Anki passam até o deploy do novo valor |
| `OAUTH_CLIENT_SECRET` (se usado) | Rotacionar em par com o client; atualizar o connector no ChatGPT | Tokens existentes seguem válidos até expirar |
| `MCP_DEV_TOKEN` | **Remover em produção**: `fly secrets unset MCP_DEV_TOKEN` | Fecha o bypass de OAuth |

Verificação pós-rotação: `curl -i /mcp` sem token ⇒ 401 com `WWW-Authenticate`;
com token antigo ⇒ 401 `invalid_signature`; novo fluxo OAuth ⇒ 200.

## 3. Rollback

```bash
fly releases                                 # listar releases
fly deploy --image ghcr.io/sudo-psc/chatgpt-anki-plugin:<tag-anterior>
# ou, via git:
git checkout <tag-anterior> && fly deploy --dockerfile docker/Dockerfile
```

Compose: `git checkout <tag> && docker compose -f docker/docker-compose.yml up -d --build`.
Sem migrações de banco (stateless) ⇒ rollback é seguro por construção.
Pós-rollback: repetir a verificação §1.3.

## 4. Indisponibilidade do Anki / AnkiConnect

**Sintomas:** `/ready` → 503 `anki: unreachable`; tools de leitura/escrita
retornam `ANKI_UNAVAILABLE` com hint.

**Causas comuns e ação:**

1. Anki Desktop fechado no dispositivo do usuário ⇒ reabrir o Anki (o add-on
   AnkiConnect sobe junto). O AnkiWeb **não é** uma dependência — este projeto
   não usa o AnkiWeb.
2. Add-on ausente/desatualizado ⇒ instalar/atualizar (código `2055492159`);
   conferir porta 8765 em Config.
3. Rede/túnel (instância remota) ⇒ verificar túnel (Tailscale/cloudflared) e
   `ANKI_CONNECT_URL`; teste direto:
   `curl -s -X POST "$ANKI_CONNECT_URL" -d '{"action":"version","version":6}'`.
4. Timeout sob carga ⇒ elevar `ANKI_TIMEOUT_MS` com cautela (default 10 s).

O servidor se recupera sozinho quando o endpoint volta (sem restart). Alertas
recomendados: `/ready` ≠ 200 por > 5 min (ver §6).

## 5. Incidentes de segurança

### 5.1 Vazamento de access token

1. Rotacionar `TOKEN_SECRET` (§2) — invalida o token vazado imediatamente.
2. Inspecionar logs (`tool_call` por subject/ms) por uso anômalo.
3. Se escrito/delete suspeito: orientar o usuário a revisar/restaurar a
   coleção (backups do Anki; `File → Export` periódico).

### 5.2 Vazamento de `ANKI_CONNECT_API_KEY` ou do `TOKEN_SECRET` no repo

1. Rotacionar o segredo no provedor (add-on / env).
2. Confirmar que `gitleaks` no CI para de acusar; se o segredo entrou no
   histórico, reescrever histórico (git filter-repo) **ou** rotacionar e marcar
   o segredo como comprometido (preferível).
3. Registrar lição no CHANGELOG/CONTRIBUTING se a causa foi template.

### 5.3 Abuso/DoS

1. `RATE_LIMITED` recorrente no log ⇒ baixar `RATE_LIMIT_PER_MINUTE` ou
   bloquear `sub` na borda (proxy/CDN).
2. `MAX_BODY_BYTES` protege contra payloads; 413 recorrente ⇒ investigar origem.

## 6. Observabilidade e alertas

- Logs JSON em stdout (`http_request`, `tool_call`, `mcp_transport_error`,
  `shutdown_started`) — nenhum conteúdo de cartão (política NFR-04).
- `/health` = liveness (sem dependências) · `/ready` = dependência AnkiConnect.
- **Alertas mínimos:** `/ready` ≠ 200 por 5 min; taxa de `error`/`ANKI_UNAVAILABLE`
  > 5%/5 min; p95 de `http_request.ms` > 2,5 s/15 min.
- **OpenTelemetry (quando necessário):** `withSpan` (`src/infra/telemetry.ts`) é
  o ponto único; adicionar `@opentelemetry/sdk-node` + exporter OTLP e trocar a
  implementação mantendo os atributos (`span`, `ok`, `ms`). Dashboards: taxa de
  tool_call por código de erro, latência p95 por tool, chamadas por subject.

## 7. Manutenção rotineira

| Frequência | Ação |
|:---|:---|
| Semanal | Revisar logs de erro; confirmar CI verde em `main` |
| Mensal | `npm audit`/Dependabot; atualizar AnkiConnect se `unsupported action` aparecer; rodar teste de carga (T-027) |
| Por release | Atualizar CHANGELOG + `SERVER_VERSION`, tag SemVer, smoke pós-deploy |
| Semestral | Revisar política de privacidade e escopos; revisar DCR/allowlist |

## 8. Contatos

- Segurança: philipe.saraiva.cruz@gmail.com (ver `SECURITY.md`).
- Issues: <https://github.com/Sudo-psc/chatgpt-anki-plugin/issues>.
