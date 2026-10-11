# Plano de Testes e Qualidade (`docs/07-plano-de-testes.md`)

## 1. Estratégia de Testes em 4 Camadas

| Camada | Diretório | Ferramenta | Escopo | Meta |
|:-------|:----------|:-----------|:-------|:-----|
| **1. Unitários** | `tests/unit/` | Vitest | Parser/construtor de queries Anki (`search.ts`), mapeamento de avaliações FSRS/SM-2 (`review.ts`), `AnkiConnectAdapter` (mock `fetch`), `InMemoryAnkiAdapter`, `BridgeRelayAdapter`, erros de domínio e logger/config. | ≥ 80% de cobertura em `src/anki` e `src/tools` |
| **2. Contrato MCP** | `tests/contract/` | Vitest + MCP `InMemoryTransport` | Verifica que todas as 13 tools estão registradas, possuem JSON Schema válido com descrições, anotações corretas (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), `_meta["openai/outputTemplate"]`, tratam erros tipados e respeitam `ANKI_READ_ONLY=1` e escopos OAuth. | 100% das 13 tools verificadas |
| **3. Integração HTTP + OAuth 2.1** | `tests/integration/` | Vitest + Supertest | Testa o servidor Express completo: `/health`, `/privacy`, `/terms`, descoberta RFC 9728/8414, Dynamic Client Registration (`/oauth/register`), Authorization Code + PKCE `S256` (`/oauth/authorize` → `/oauth/token`), rejeição `401` para token ausente/inválido (C7), chamadas JSON-RPC em `POST /mcp` e túnel WebSocket `/bridge`. | Fluxos ponta a ponta verdes |
| **4. E2E Widgets (Apps SDK)** | `tests/e2e/` | Playwright (Chromium) | Renderiza `deck-browser.html` e `review-session.html` com mock de `window.openai`, verifica hidratação de `toolOutput`, revelação de resposta e invocação de `window.openai.callTool("submit_review", ...)`. | 100% dos fluxos de UI verdes |

---

## 2. Matriz de Rastreabilidade (Requisitos × Testes)

| Requisito / Critério | Arquivo de Teste |
|:---------------------|:-----------------|
| `RF-001`..`RF-005` (Decks CRUD) | `tests/contract/tools.contract.test.ts`, `tests/unit/anki-connect.test.ts` |
| `RF-006`..`RF-007` (Search & Get Card) | `tests/unit/search.test.ts`, `tests/contract/tools.contract.test.ts` |
| `RF-008`..`RF-010` (Notes CRUD) | `tests/contract/tools.contract.test.ts`, `tests/unit/anki-connect.test.ts` |
| `RF-011`..`RF-013` (Due, Review, Stats) | `tests/unit/review.test.ts`, `tests/contract/tools.contract.test.ts` |
| `RF-014` / `C7` (OAuth 2.1 + PKCE + 401) | `tests/integration/http-oauth-mcp.test.ts` |
| `RF-015` / `C10` (Widgets Apps SDK) | `tests/e2e/widgets.spec.ts`, `tests/integration/http-oauth-mcp.test.ts` |
| `RNF-004` / `C8` (Cobertura ≥ 80%) | `vitest.config.ts` (`npm run test:coverage`) |
| `RNF-011` (`ANKI_READ_ONLY=1`) | `tests/contract/tools.contract.test.ts` |
| `RNF-012` (`ANKI_UNREACHABLE`) | `tests/unit/anki-connect.test.ts` |

---

## 3. Comandos de Execução

```bash
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest (unit + integration + contract)
npm run test:coverage  # Vitest com gate >= 80% em src/tools e src/anki
npm run test:e2e       # Playwright E2E dos widgets do Apps SDK
```
