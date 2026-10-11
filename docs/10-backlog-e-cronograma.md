# 10 — Backlog e Cronograma

Plano de desenvolvimento executável: **50 tarefas** (`T-001`–`T-050`) com
objetivo, entregável, dependências, estimativa (h), agente responsável e
status. Agentes conforme o plano do programa; status atualizado em 2026-10-10.

**Legenda de status:** ✅ concluída · 🟡 parcial · ⛔ bloqueada (dependência
externa) · 🔜 roadmap (pós-v0.1).

## Marcos

| Marco | Fase | Entregável | Critério de saída | Status |
|:---|:---|:---|:---|:---|
| M0 | Bootstrap | Repositório, CI, estrutura, épico | C1 | ✅ local; espelho GitHub em execução |
| M1 | Pesquisa | Dossiês OpenAI + Anki, matriz de viabilidade | C3, C4 | ✅ |
| M2 | Especificação | Requisitos, arquitetura, contratos, testes | C2, C5, C6 | ✅ |
| M3 | Núcleo | Adapter Anki + servidor MCP + auth | C7, C8 | ✅ (122 testes, cobertura 96,9%/92,3%) |
| M4 | Interface | Widgets + fluxos de revisão e busca | C10 | ✅ widgets + developer mode executado (`docs/evidencias/C10-developer-mode.md`, 16 prompts, escrita autorizada) |
| M5 | Produção | Deploy HTTPS, observabilidade, runbook | C9, C14 | ✅ `https://chatgpt-anki-mcp-sudo.fly.dev` (evidência `docs/evidencias/C9-deploy.md`) |
| M6 | Publicação | Submissão e aprovação OpenAI | C11, C12 | ⛔ (conta OpenAI + revisão humana) |

## M0 — Bootstrap (T-001…T-011)

| ID | Tarefa | Depende | Agente | Est. | Entregável | Status |
|:---|:---|:---|:---|:---|:---|:---|
| T-001 | Criar repositório, estrutura de pastas, LICENSE MIT, .gitignore, README inicial | — | DevOps | 4h | repo + estrutura | ✅ |
| T-002 | Dossiê OpenAI (Apps SDK, MCP remoto, auth, limites, submissão) | T-001 | Pesq. OpenAI | 8h | `docs/09-*` | ✅ |
| T-003 | Dossiê Anki (AnkiConnect, sync, busca, FSRS, ToS) | T-001 | Pesq. Anki | 8h | `docs/03-*` | ✅ |
| T-004 | ADR estratégia de acesso ao Anki (4 opções avaliadas) | T-002, T-003 | Arquiteto | 4h | ADR-0001 | ✅ |
| T-005 | Requisitos funcionais com critérios de aceite (14 FRs) | T-002, T-003 | Especificador | 6h | `docs/01-*` | ✅ |
| T-006 | Requisitos não funcionais (12 NFRs) | T-005 | Especificador | 4h | `docs/02-*` | ✅ |
| T-007 | Arquitetura (C4, fluxos, modelo de erro, matriz de config) | T-004 | Arquiteto | 6h | `docs/03-*` | ✅ |
| T-008 | ADRs 0002–0008 (stack, auth, stateless, zod, testes, deploy, tenancy) | T-007 | Arquiteto | 6h | `docs/04-adr/*` | ✅ |
| T-009 | CI/CD: ci (lint/typecheck/test/build/gitleaks/SBOM), release ghcr, deploy manual | T-001 | DevOps | 6h | `.github/workflows/*` | ✅ |
| T-010 | Espelho GitHub público + branch protection + Pages (legais) | T-001 | DevOps | 2h | https://github.com/Sudo-psc/chatgpt-anki-plugin (proteção: PR+review; Pages: https://sudo-psc.github.io/chatgpt-anki-plugin/) | ✅ |
| T-011 | Issue épica "Plano de Desenvolvimento" + backlog vivo | T-001 | Orquestrador | 2h | issue [#1](https://github.com/Sudo-psc/chatgpt-anki-plugin/issues/1) + este doc | ✅ |

## M1/M2 — Pesquisa e Especificação (T-012…T-016)

| ID | Tarefa | Depende | Agente | Est. | Entregável | Status |
|:---|:---|:---|:---|:---|:---|:---|
| T-012 | Matriz de viabilidade de acesso (AnkiConnect × sync × headless) | T-003 | Pesq. Anki | 4h | ADR-0001 §opções | ✅ |
| T-013 | Contratos das 13 tools + 2 extensões (Zod, erros, scopes) | T-005 | Arquiteto+Dev MCP | 8h | `docs/05-*` + `src/tools` | ✅ |
| T-014 | Plano de testes (pirâmide, falhas, carga, E2E) | T-006 | QA | 4h | `docs/07-*` | ✅ |
| T-015 | Segurança e privacidade (STRIDE, LGPD/GDPR, segredos) | T-006 | Segurança | 6h | `docs/06-*` | ✅ |
| T-016 | Pacote legal (política de privacidade + termos) | T-015 | Segurança+Redator | 4h | `docs/legal/*` | ✅ |

## M3 — Núcleo (T-017…T-032)

| ID | Tarefa | Depende | Agente | Est. | Entregável | Status |
|:---|:---|:---|:---|:---|:---|:---|
| T-017 | Client AnkiConnect (envelope v6, apiKey, timeout, erros tipados) | T-004 | Dev Backend | 6h | `src/anki/client.ts` | ✅ |
| T-018 | Adapter de decks (list/get/create/rename composto/delete) | T-017 | Dev Backend | 6h | `src/anki/decks.ts` | ✅ |
| T-019 | Adapter de cartões + busca (findCards/cardsInfo/notesInfo, tags) | T-017 | Dev Backend | 6h | `src/anki/cards.ts` | ✅ |
| T-020 | Adapter de notas (add/update fields+tags+model/delete/tags ops) | T-017 | Dev Backend | 6h | `src/anki/notes.ts` | ✅ |
| T-021 | Adapter de revisão e estatísticas (answerCards, counts) | T-017 | Dev Backend | 4h | `src/anki/review.ts` | ✅ |
| T-022 | Emulador MockAnkiConnect + coleção sintética (demo/testes) | T-017 | QA+Dev Backend | 8h | `src/anki/mock/*` | ✅ |
| T-023 | Servidor MCP com SDK oficial (stateless, JSON mode, por request) | T-013 | Dev MCP | 8h | `src/mcp/server.ts` | ✅ |
| T-024 | OAuth 2.1 (code+PKCE S256, DCR, metadata RFC 8414/9728) | T-013 | Segurança | 10h | `src/mcp/auth/*` | ✅ |
| T-025 | Tokens HS256 + validação aud/iss/exp + AuthInfo por request | T-024 | Segurança | 4h | `src/mcp/auth/tokens.ts` | ✅ |
| T-026 | Scopes por operação + enforcement no handler (FORBIDDEN) | T-025 | Dev MCP | 3h | `src/mcp/server.ts` | ✅ |
| T-027 | Rate limit por subject (FixedWindow) + payload RATE_LIMITED | T-023 | Dev MCP | 3h | `src/mcp/ratelimit.ts` | ✅ |
| T-028 | Roteador HTTP: /health /ready /mcp /oauth/* /well-known /widgets + Origin | T-023 | Dev MCP | 6h | `src/app.ts` | ✅ |
| T-029 | Tools de leitura (list/get deck, search/get card, due, stats) | T-018..T-021 | Dev MCP | 6h | `src/tools/*.ts` | ✅ |
| T-030 | Tools de escrita (create/update/delete deck+note, tags) | T-029 | Dev MCP | 6h | `src/tools/*.ts` | ✅ |
| T-031 | Tool de revisão + admin (submit_review, update_model_templates) | T-029 | Dev MCP | 4h | `src/tools/*.ts` | ✅ |
| T-032 | Mappers domínio→JSON (snake_case) + schemas de saída | T-029 | Dev MCP | 3h | `src/tools/mappers.ts` | ✅ |

## M3/M4 — Testes, widgets e recursos (T-033…T-044)

| ID | Tarefa | Depende | Agente | Est. | Entregável | Status |
|:---|:---|:---|:---|:---|:---|:---|
| T-033 | Testes unitários (config, logger, tokens, oauth, rate, client, mock, erros) | T-022..T-028 | QA | 10h | `tests/unit/*` (60 testes) | ✅ |
| T-034 | Testes de integração (as 15 tools ponta a ponta + auth + health) | T-033 | QA | 10h | `tests/integration/*` (50 testes) | ✅ |
| T-035 | Testes de contrato (nomes, scopes, annotations, JSON Schema, outputs) | T-034 | QA | 6h | `tests/contract/*` (7 testes) | ✅ |
| T-036 | E2E Playwright dos widgets (render, teclado, CSP) | T-032 | QA | 6h | `tests/e2e/widget.spec.ts` | ✅ |
| T-037 | Gate de cobertura ≥80% em src/tools+src/anki no CI | T-035 | DevOps | 2h | `vitest.config.ts` | ✅ |
| T-038 | Widget de decks/cartões (Apps SDK, acessível) | T-029 | Dev Frontend | 6h | `src/widgets/decks.*` | ✅ |
| T-039 | Widget de revisão (Again/Hard/Good/Easy + teclado) | T-031 | Dev Frontend | 6h | `src/widgets/review.*` | ✅ |
| T-040 | Docker multi-stage + compose (perfis real/demo) | T-028 | DevOps | 4h | `docker/*` | ✅ |
| T-041 | Observabilidade: logs JSON por request/tool + gancho OTel | T-028 | DevOps | 4h | `src/infra/*` | ✅ |
| T-042 | Smoke script E2E (health→initialize→tools) | T-028 | DevOps | 2h | `scripts/smoke.sh` | ✅ |
| T-043 | README completo + CONTRIBUTING/SECURITY/CODE_OF_CONDUCT/CHANGELOG | T-016 | Redator | 6h | root docs | ✅ |
| T-044 | Runbook operacional (rotação, rollback, incidentes, Anki down) | T-040 | DevOps+Segurança | 4h | `docs/08-*` | ✅ |

## M5/M6 — Produção e Publicação (T-045…T-050)

| ID | Tarefa | Depende | Agente | Est. | Entregável | Status |
|:---|:---|:---|:---|:---|:---|:---|
| T-045 | Deploy HTTPS real (Fly) + verificação `curl /health` | T-040, T-044 | DevOps | 3h | https://chatgpt-anki-mcp-sudo.fly.dev (`/health` 200; E2E público OK; escala 1 machine — in-memory codes) | ✅ |
| T-046 | Segredos de produção + desabilitar dev token | T-045 | Segurança | 2h | `TOKEN_SECRET`+`OAUTH_CLIENT_ID` via fly secrets; `MCP_DEV_TOKEN` ausente; `FLY_API_TOKEN` no repo | ✅ |
| T-047 | Alertas (ready≠200, taxa de erro, latência) | T-045 | DevOps | 4h | alertas | 🔜 |
| T-048 | Teste de charge/latência (p95 metas NFR-01) | T-045 | QA | 4h | relatório em evidencias | 🔜 |
| T-049 | Screenshots dos widgets em developer mode | T-045 | Redator | 2h | `docs/evidencias/` | ⛔ conta ChatGPT |
| T-050 | Submissão OpenAI → revisão → publish ⇒ C11/C12 | T-045, T-049 | Orquestrador | 8h+ | app publicado | ⛔ conta OpenAI |

## Roadmap pós-v0.1 (R-01…R-06)

| ID | Tarefa | Depende | Agente | Est. | Entregável |
|:---|:---|:---|:---|:---|:---|
| R-01 | **Multi-tenant** (T-048 do ADR-0008): AnkiConnect URL/chave por usuário, cifrado (AES-GCM), consentimento | T-024 | Arquiteto+Segurança | 40h | habilita listagem pública plena |
| R-02 | Backend headless do AnkiGateway (container Anki + API) | T-018 | Dev Backend | 24h | **Entregue e ATIVO** (2026-10-11): `docker/ankiweb-service` + `fly.ankiweb.toml` + ADR-0009; rodando em `chatgpt-anki-real` com a conta AnkiWeb real (77 baralhos, sync 15 min) e conector `Anki (Minha Coleção)` no ChatGPT |
| R-03 | Rate limit distribuído (Redis) p/ múltiplas instâncias | T-027 | DevOps | 8h | escala horizontal |
| R-04 | Import/export `.apkg` (FR-15) | T-031 | Dev Backend | 16h | novos fluxos |
| R-05 | Refresh tokens OAuth | T-024 | Segurança | 8h | UX de longa duração |
| R-06 | Exportador OTel completo + dashboards | T-041 | DevOps | 8h | observabilidade avançada |

## Relatório de status — 2026-10-11

**Concluído (M0–M3 + M5):** 46/50 tarefas do plano v0.1 ✅.
Evidências: CI verde no GitHub (lint, typecheck, 122 testes, coverage, build,
gitleaks, SBOM), cobertura **96,9% linhas / 92,3% branches** (gate 80/75),
smoke E2E OK, documentação completa (11 docs + 8 ADRs + legais + Pages),
**deploy público** em `https://chatgpt-anki-mcp-sudo.fly.dev` com fluxo OAuth
e tools verificados E2E contra a instância real (`docs/evidencias/C9-deploy.md`).

**Pendências e bloqueios:**

1. ✅ **C10 (developer mode) concluído em 2026-10-11**: connector criado, OAuth
   conectado e 16 prompts executados com chamadas reais de tools (leitura + a
   escrita `create_note` autorizada) — `docs/evidencias/C10-developer-mode.md`.
2. ⛔ **T-049/T-050 (submissão OpenAI)**: requer conta OpenAI verificada
   (Owner) e revisão humana; pacote de submissão 100% preparado (`docs/09-*`)
   — políticas já públicas via GitHub Pages. (Screenshots do widget: capturar
   no portal de submissão; T-049.)
3. 🔜 T-047/T-048: alertas e teste de carga (dependem de observabilidade externa).

**Riscos abertos:** escala da instância é limitada a 1 machine enquanto os
códigos OAuth/DCR/rate limit forem em memória (mitigado com `fly scale count 1`;
store compartilhado = R-03); exposição do AnkiConnect do usuário em deploy
remoto (mitigação: túnel privado, documentado); single-tenant limita listagem
pública plena (ADR-0008/R-01).

**Próximos passos (ordem):** 1) connect no ChatGPT developer mode apontando
para `https://chatgpt-anki-mcp-sudo.fly.dev/mcp` + transcrição C10;
2) submissão (T-050) após verificação da conta OpenAI; 3) T-047/T-048 quando
a observabilidade externa for contratada.
