# ADR-0005 — Arquitetura de Widgets do OpenAI Apps SDK (`text/html+skybridge`)

* **Status**: Aceito
* **Data**: 2026-10-10
* **Decisores**: Dev Frontend, Arquiteto

## Contexto

O OpenAI Apps SDK permite que tools MCP retornem metadados `_meta["openai/outputTemplate"]` (e `_meta.ui.resourceUri`) apontando para recursos HTML registrados no servidor MCP com MIME type `text/html+skybridge`. Esses recursos são renderizados em um iframe isolado dentro da conversa do ChatGPT e interagem com o host via `window.openai`.

## Decisão

1. Construir dois widgets autocontidos (HTML + CSS + Vanilla ES2022 JS inline, zero dependências externas CDN para cumprir CSP restrita):
   * `ui://widget/deck-browser.html` — associado a `list_decks`, `get_deck`, `search_cards` e `get_stats`.
   * `ui://widget/review-session.html` — associado a `get_due_cards` e `submit_review`.
2. Hidratar os widgets lendo `window.openai?.toolOutput` no carregamento e escutando o evento `openai:set_globals` (além de `window.addEventListener('message', ...)` para compatibilidade com MCP Apps e testes E2E Playwright).
3. Disparar ações de revisão diretamente do widget por meio de `window.openai.callTool('submit_review', { cardId, rating })` e persistir estado visual via `window.openai.setWidgetState(...)`.

## Consequências

* Bundles de widget com `< 15 KB`, carregamento instantâneo, sem risco de bloqueio por CSP (`script-src 'self' 'unsafe-inline'`, zero tráfego para domínios terceiros).
* Testabilidade determinística no Playwright injetando um mock de `window.openai` antes do carregamento da página.
