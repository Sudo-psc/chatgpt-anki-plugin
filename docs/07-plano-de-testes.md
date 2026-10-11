# 07 — Plano de Testes

## Pirâmide e escopo

```
        ┌───────────────────────────────┐
        │ E2E ChatGPT (roteiro assist.) │  C10 — manual-facilitated
        ├───────────────────────────────┤
        │ Playwright E2E (widgets)      │  5 testes
        ├───────────────────────────────┤
        │ Contrato (registry × tools)   │  7 testes
        ├───────────────────────────────┤
        │ Integração (HTTP+MCP+mock)    │ 50 testes
        ├───────────────────────────────┤
        │ Unitário (6 seções)           │ 60 testes
        └───────────────────────────────┘
```

Total atual: **122 testes** (`npm test`) · E2E: 5 passam + 1 roteiro skipado.

## Suítes

| Suite | Arquivo(s) | Cobre |
|:---|:---|:---|
| unit | `tests/unit/config.test.ts` | defaults, parse CSV/lista/booleans, erro acionável, produção sem segredo |
| unit | `tests/unit/logger.test.ts` | níveis, JSON estruturado, redação de segredos, truncamento, child |
| unit | `tests/unit/tokens.test.ts` | round-trip, tamper, expirado, iss/aud, malformado |
| unit | `tests/unit/oauth.test.ts` | validação authorize, erros redirectable, PKCE, uso único, expiração, DCR |
| unit | `tests/unit/ratelimit.test.ts` | janela fixa, isolamento por subject, reset, retry |
| unit | `tests/unit/anki-client.test.ts` | envelope/API key, erros de rede/HTTP/JSON/shape, timeout real |
| unit | `tests/unit/mock-anki.test.ts` | query parser, duplicatas, validações, tags, modelos, answerCards |
| unit | `tests/unit/tool-errors.test.ts` | taxonomia completa de `toErrorPayload` |
| integration | `auth.test.ts` (15) | fluxo OAuth completo, 401s, escopos, DCR, deny, código single-use |
| integration | `health.test.ts` (10) | `/health`, `/ready` (200/503), 404, metadados OAuth, widgets+CSP, 413, 405, Origin 403, parse 400 |
| integration | `mcp-tools.test.ts` (25) | **as 15 tools ponta a ponta**, caminhos de erro, rate limit, Anki fora, tool desconhecida |
| contract | `tools.contract.test.ts` (7) | C5 (nomes exatos), scopes, annotations, JSON Schema, output real × schema, taxonomia |
| e2e | `widget.spec.ts` (5) | render decks/cards, sessão de revisão com teclado, erro amigável, CSP |
| e2e | `chatgpt.developer-mode.spec.ts` | roteiro C10 (skipado; `CHATGPT_E2E=1` para executar assistido) |

## Cobertura (gate NFR-09 / C8)

Medida apenas em `src/tools` + `src/anki` (o mock é instrumento de teste e é
excluído; type-only files não contam). Thresholds em `vitest.config.ts`:

```text
lines ≥ 80 · statements ≥ 80 · functions ≥ 80 · branches ≥ 75  (falha o CI abaixo disso)
```

Resultado atual (2026-10-10):

```text
All files   96.91 stmts | 92.33 branch | 93.02 funcs | 96.91 lines
anki        94.01       | 90.15        | 92.30       | 94.01
tools       98.54       | 94.82        | 94.11       | 98.54
```

Reproduzir: `npm run test:coverage` → `coverage/index.html`.

## Fixtures e dados

- **Somente coleção sintética** (`src/anki/mock/seed.ts`): 7 notas, 6 decks
  (2 implícitos), cards nuevos/due/suspenso/cloze — ids determinísticos
  (base `1700000000000`).
- Nenhum dado real de usuário/paciente em fixtures, docs ou screenshots
  (regra de CONTRIBUTING + revisão de PR).

## Testes de falha e caos leve

| Cenário | Como é simulado | Expectativa |
|:---|:---|:---|
| AnkiConnect offline | `ANKI_CONNECT_URL` porta morta | `ANKI_UNAVAILABLE` + hint; `/ready` 503 |
| Timeout | `mock.delayAction('version', 300)` + timeout 50ms | `ANKI_UNAVAILABLE` "timed out after 50ms" |
| Erro de negócio do Anki | `mock.failNextAction` / dados inválidos | `ANKI_ERROR` com mensagem original |
| Shape inesperado | `fetchImpl` fake | `ANKI_UNAVAILABLE` sem crash |
| Abuso | 3ª chamada com limite 2 | `RATE_LIMITED` + retry |
| Payload grande | body > `MAX_BODY_BYTES` | 413 |
| Origem maliciosa | `Origin: https://evil...` | 403 |

## Carga e latência (T-027 — plano)

- Ferramenta: `autocannon` ou `k6` contra `/mcp` com token de dev e mock.
- Cenários: 1) `tools/list` (CPU-bound), 2) `list_decks` (I/O leve),
  3) `search_cards` com limite 200 (I/O + serialização).
- Metas: p95 < 250 ms sem Anki real (mock local); p95 < 2,5 s com AnkiConnect
  real local (NFR-01). Execução mensal ou pré-release; resultados anexados em
  `docs/evidencias/`.

## E2E ChatGPT (C10 — roteiro assistido)

1. Expor o servidor em HTTPS (`fly deploy` ou túnel ngrok/cloudflared).
2. ChatGPT → Settings → Connectors → Advanced → **Developer mode ON**.
3. **Create** connector → URL `https://<host>/mcp` → OAuth consent → autorizar.
4. Executar os 15 prompts canônicos de `tests/e2e/chatgpt.developer-mode.spec.ts`
   (lista embutida na spec) e transcrever chamada/resposta por tool.
5. Anexar a transcrição em `docs/evidencias/C10-developer-mode.md`.

## Regressão e política de PR

- Todo PR: `npm run lint && npm run typecheck && npm run test:coverage && npm run build`.
- Nova tool exige: contrato no registry (automático), testes de caminho felizes
  **e** de erro, atualização de `05-tools-mcp.md` e entrada no teste de contrato.
- Bugfix exige teste que falha sem o fix.
