# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.
O formato baseia-se em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere ao [Versionamento Semântico (SemVer)](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-10-10

### Adicionado

* **Servidor MCP sobre Streamable HTTP (`/mcp`) e `stdio` (`--stdio`)** construído com `@modelcontextprotocol/sdk` e Express 5.
* **13 Tools MCP completas** com validação Zod, JSON Schema, tratamento de erro tipado e anotações para o OpenAI Apps SDK:
  * Baralhos: `list_decks`, `get_deck`, `create_deck`, `update_deck`, `delete_deck`.
  * Cartões e Busca: `search_cards` (sintaxe nativa do Anki), `get_card`.
  * Notas: `create_note`, `update_note`, `delete_note`.
  * Revisão e Estatísticas: `get_due_cards`, `submit_review` (`Again/Hard/Good/Easy`), `get_stats`.
* **Autenticação OAuth 2.1 com PKCE (`S256`)**:
  * Descoberta RFC 9728 (`/.well-known/oauth-protected-resource`) e RFC 8414 (`/.well-known/oauth-authorization-server`).
  * Dynamic Client Registration RFC 7591 (`POST /oauth/register`).
  * Emissão e revogação de JWT (`HS256`) com escopos por operação (`anki:read`, `anki:write`, `anki:review`, `anki:delete`).
* **Arquitetura Tripla de Adaptadores Anki (`AnkiAdapter`)**:
  * `AnkiConnectAdapter` (JSON-RPC v6 direto em `127.0.0.1:8765`).
  * `BridgeRelayAdapter` + CLI `npx chatgpt-anki-plugin bridge` (túnel reverso WebSocket `WSS /bridge` para conectar o servidor HTTPS em nuvem ao Anki Desktop local do usuário sem abrir portas).
  * `InMemoryAnkiAdapter` (coleção sintética determinística para testes, CI e revisão da OpenAI).
* **Widgets Interativos do OpenAI Apps SDK (`text/html+skybridge`)**:
  * `ui://widget/deck-browser.html` e `ui://widget/review-session.html`.
* **Infraestrutura, Qualidade e Documentação**:
  * Suítes de testes unitários, contrato, integração HTTP/OAuth e E2E Playwright com cobertura > 80%.
  * `docker/Dockerfile`, `docker/docker-compose.yml`, `render.yaml` e GitHub Actions CI/Release com Gitleaks e SBOM CycloneDX.
  * Documentação completa (`docs/00` a `docs/10`), 6 ADRs, Política de Privacidade (`/privacy`), Termos de Uso (`/terms`) e Runbook Operacional.
