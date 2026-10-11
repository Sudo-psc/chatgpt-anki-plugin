# ADR-0007 — Deploy: Docker multi-stage + Fly.io; logs JSON + gancho OTel

- **Status:** Aceito (2026-10-10)
- **Decisores:** DevOps, Arquiteto.

## Contexto

C9 exige o servidor acessível publicamente via HTTPS com healthcheck 200; C14
exige runbook (rotação, rollback, incidente, indisponibilidade do Anki).
Precisamos de um caminho de deploy reprodutível e barato, com alternativa
self-hosted (Docker Compose) para quem não quer terceiros.

## Decisão

1. **Imagem Docker multi-stage** (`docker/Dockerfile`): build em `node:22-alpine`
   com `npm ci` e `tsc`; runtime mínimo (deps de produção), usuário `node` não-root,
   `HEALTHCHECK` em `/health`. Widgets copiados para `dist/` no build.
2. **Docker Compose** com dois perfis: `anki-mcp` (real, `host.docker.internal:8765`)
   e `demo` (mock + dev token) para quickstart/avaliação.
3. **Fly.io como host de produção de referência** (`fly.toml`): região `gru`,
   HTTPS forçado, machine auto-stop, healthcheck `/health`. Deploy via
   `.github/workflows/deploy.yml` com `workflow_dispatch` + `FLY_API_TOKEN`
   (secret) — deploy exige confirmação textual e falha com mensagem clara se o
   secret não existir.
4. **Throwaway/release**: `release.yml` publica imagem `ghcr.io` em tags SemVer
   com SBOM no CI.
5. **Observabilidade de baixo custo**: logs JSON por request e por tool call
   (`http_request`, `tool_call`, `mcp_transport_error`) — nenhuma infra externa
   obrigatória; `withSpan` (`src/infra/telemetry.ts`) é o ponto único de
   instrumentação para plugar OpenTelemetry depois sem tocar em call sites.
   `/health` (liveness, sem dependências) ≠ `/ready` (dependência: AnkiConnect).
6. **Stateless-friendly**: sem sessões/persistência ⇒ scale horizontal trivial;
   rate limit em memória é por instância (documentado; Redis se necessário, T-047).

## Alternativas consideradas

- **Serverless (Lambda/Workers)**: viável conceitualmente, mas o SDK requer
  ajustes de transporte por plataforma e o custo de verificação subiu;
  adiado (roadmap).
- **VPS + systemd**: documentado como alternativa no runbook; Compose cobre.
- **OTel completo desde o v0.1** (collector/exporter): pesado para o ganho;
  interface pronta e plano documentado no runbook.

## Consequências

- **Escala = 1 machine por padrão**: códigos OAuth, clientes DCR e rate limit
  são em memória por instância; com 2+ machines sem sticky sessions o token
  exchange pode falhar com `invalid_grant` (observado no deploy inicial do
  app `chatgpt-anki-mcp-sudo`, corrigido com `fly scale count 1`). Store
  compartilhado (Redis) está no roadmap R-03 e é pré-requisito para escalar.
- Rollback = `fly releases` + `fly deploy --image` (runbook) ou redeploy da tag
  anterior (imagens versionadas no ghcr).
- Segredos de runtime (`TOKEN_SECRET`, `ANKI_CONNECT_API_KEY`) nunca na imagem;
  apenas via `fly secrets`/env (runbook § rotação).
- Sem estado ⇒ incidentes de integridade de dados são impossíveis no servidor;
  integridade da coleção é responsabilidade do Anki do usuário.
