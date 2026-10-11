# Visão Geral — Plugin ChatGPT ↔ Anki (`chatgpt-anki-plugin`)

## 1. Propósito e Escopo Congelado

O **`chatgpt-anki-plugin`** é um servidor **Model Context Protocol (MCP)** remoto e local, construído em TypeScript (Node.js ≥ 22.12), com interface visual embarcada para o **OpenAI Apps SDK** (`text/html+skybridge`), que conecta o **ChatGPT** à coleção de flashcards **Anki** do usuário por meio de linguagem natural.

Com este plugin/app, o usuário pode diretamente no ChatGPT:

1. **Visualizar** baralhos (*decks*), sub-baralhos (`Pai::Filho`), notas, cartões e estatísticas;
2. **Criar** baralhos, notas e cartões (Basic, Cloze e modelos customizados);
3. **Editar** baralhos (configuração, movimentação de cartões), notas (campos e tags) e estado de cartões;
4. **Pesquisar** cartões e notas usando toda a sintaxe nativa de busca do Anki (`deck:`, `tag:`, `is:due`, `prop:ivl>=`, etc.);
5. **Revisar** cartões devidos (*due*) em sessão interativa (chat ou widget do Apps SDK), registrando avaliações `Again` (1), `Hard` (2), `Good` (3) e `Easy` (4) no agendador SM-2/FSRS e acompanhando estatísticas de desempenho.

---

## 2. Restrição Crítica de Domínio: Acesso ao AnkiWeb vs. AnkiConnect

Conforme documentado oficialmente pela Anki ([AnkiWeb Terms of Service](https://ankiweb.net/account/terms) e [Anki Manual](https://docs.ankiweb.net/)):

* **O AnkiWeb não expõe API REST pública.** O protocolo de sincronização do `ankiweb.net` é privado e projetado exclusivamente para os clientes oficiais Anki.
* **Automação, scraping ou uso de clientes não-oficiais contra o `ankiweb.net` violam os Termos de Uso** e colocam a conta e a coleção do usuário em risco.

Para respeitar integralmente os Termos de Uso do AnkiWeb e da OpenAI e ainda assim entregar um **servidor MCP remoto via HTTPS** acessível pelo ChatGPT em nuvem, o projeto adota uma **arquitetura de adaptadores plugáveis (`AnkiAdapter`)** detalhada no [ADR-0001](./04-adr/ADR-0001-estrategia-acesso-anki.md):

1. **Modo Local / Self-Hosted (`AnkiConnectAdapter`)**: o servidor MCP conversa diretamente com o add-on oficial **AnkiConnect** (código `2055492159`, porta `8765`, protocolo JSON-RPC v6).
2. **Modo Produção Remota HTTPS + Ponte Reversa (`BridgeRelayAdapter` + CLI `anki-bridge`)**: o servidor MCP roda em produção via HTTPS (Render/Docker) com OAuth 2.1 + PKCE. O usuário executa localmente um agente leve (`npx chatgpt-anki-plugin bridge`) que abre um túnel WebSocket autenticado de saída (`wss://`) até o servidor MCP remoto e encaminha as chamadas JSON-RPC ao AnkiConnect em `127.0.0.1:8765` — **sem abrir portas no roteador, sem expor o AnkiConnect à internet e sem enviar credenciais do AnkiWeb**.
3. **Modo Sandbox / Demonstração (`InMemoryAnkiAdapter`)**: coleção determinística em memória para revisão da OpenAI, testes de contrato, CI e avaliação imediata sem depender do Anki Desktop aberto.

---

## 3. Público-Alvo

* **Primário**: estudantes universitários, concurseiros, estudantes de medicina/saúde, aprendizes de idiomas e pesquisadores que utilizam Anki diariamente e desejam criar, auditar e revisar cartões assistidos pelo ChatGPT.
* **Secundário**: desenvolvedores e entusiastas de *spaced repetition* que desejam auto-hospedar um servidor MCP compatível com ChatGPT, Claude Desktop ou qualquer cliente MCP.

---

## 4. Superfície Pública do Servidor MCP

### 4.1 As 13 Tools MCP

| # | Tool | Categoria | Escopo OAuth | Resumo |
|:--|:-----|:----------|:-------------|:-------|
| 1 | `list_decks` | Leitura | `anki:read` | Lista todos os baralhos, IDs, hierarquia e contagens (`new`, `learn`, `due`, `total`). |
| 2 | `get_deck` | Leitura | `anki:read` | Detalha um baralho (estatísticas, sub-baralhos, configuração e amostra de cartões). |
| 3 | `create_deck` | Escrita | `anki:write` | Cria um baralho ou sub-baralho (`Pai::Filho`). Idempotente. |
| 4 | `update_deck` | Escrita | `anki:write` | Move cartões para o baralho e/ou atualiza metadados suportados pelo AnkiConnect. |
| 5 | `delete_deck` | Destrutiva | `anki:delete` | Remove um baralho e seus cartões (`cardsToo: true`), exigindo `confirm: true`. |
| 6 | `search_cards` | Leitura | `anki:read` | Pesquisa cartões com a sintaxe nativa do Anki e retorna resumo paginado. |
| 7 | `get_card` | Leitura | `anki:read` | Obtém detalhes completos de um cartão (campos, tags, intervalo, fator, fila, histórico). |
| 8 | `create_note` | Escrita | `anki:write` | Cria uma nota (`Basic`, `Cloze`, etc.) com validação de campos e controle de duplicatas. |
| 9 | `update_note` | Escrita | `anki:write` | Atualiza campos e/ou lista de tags de uma nota existente. |
| 10 | `delete_note` | Destrutiva | `anki:delete` | Exclui uma ou mais notas (e seus cartões), exigindo `confirm: true`. |
| 11 | `get_due_cards` | Leitura | `anki:read` | Retorna a fila de cartões devidos para revisão imediata, com widget interativo. |
| 12 | `submit_review` | Escrita | `anki:review` | Registra a resposta (`Again=1`, `Hard=2`, `Good=3`, `Easy=4`) de um cartão em revisão. |
| 13 | `get_stats` | Leitura | `anki:read` | Retorna métricas consolidadas de estudo, revisões no dia e distribuição de estados. |

### 4.2 Widgets do OpenAI Apps SDK (`text/html+skybridge`)

* `ui://widget/deck-browser.html` — Navegador visual de baralhos, estatísticas e cartões pesquisados.
* `ui://widget/review-session.html` — Sessão interativa de estudo com revelação de resposta e botões *Again / Hard / Good / Easy* integrados a `window.openai.callTool('submit_review', ...)`.

### 4.3 Endpoints HTTP Expostos

| Método e Rota | Descrição |
|:--------------|:----------|
| `GET /health` e `GET /healthz` | Healthcheck JSON (`200 OK`) com status do servidor e do adaptador Anki. |
| `POST /mcp`, `GET /mcp`, `DELETE /mcp` | Endpoint MCP sobre **Streamable HTTP** protegido por OAuth 2.1 Bearer token. |
| `GET /.well-known/oauth-protected-resource` | Metadados de Recurso Protegido (RFC 9728). |
| `GET /.well-known/oauth-authorization-server` | Descoberta do Servidor de Autorização OAuth 2.1 (RFC 8414). |
| `POST /oauth/register` | Dynamic Client Registration (RFC 7591) para o conector do ChatGPT. |
| `GET /oauth/authorize` & `POST /oauth/authorize` | Fluxo de autorização com PKCE (`S256`) e tela de consentimento de escopos. |
| `POST /oauth/token` | Troca de código de autorização (PKCE) ou `refresh_token` por JWT assinado. |
| `GET /oauth/jwks.json` | Chaves públicas para verificação de assinatura. |
| `WSS /bridge` | Túnel reverso WebSocket autenticado para o agente local `anki-bridge`. |
| `GET /privacy` e `GET /terms` | Política de Privacidade e Termos de Uso públicos para verificação da OpenAI. |

---

## 5. Mapa da Documentação

* [`00-visao-geral.md`](./00-visao-geral.md) — Este documento.
* [`01-requisitos-funcionais.md`](./01-requisitos-funcionais.md) — Requisitos funcionais (`RF-001` a `RF-015`) com critérios de aceite testáveis.
* [`02-requisitos-nao-funcionais.md`](./02-requisitos-nao-funcionais.md) — Requisitos não funcionais (`RNF-001` a `RNF-012`).
* [`03-arquitetura.md`](./03-arquitetura.md) — Dossiê técnico Anki/AnkiConnect/FSRS, arquitetura em camadas e fluxos de dados.
* [`04-adr/`](./04-adr/) — Registros de Decisão de Arquitetura (`ADR-0001` a `ADR-0007`).
* [`05-tools-mcp.md`](./05-tools-mcp.md) — Contrato completo das 13 tools MCP, schemas, anotações e erros.
* [`06-seguranca-e-privacidade.md`](./06-seguranca-e-privacidade.md) — Threat model, OAuth 2.1 + PKCE, LGPD/GDPR, Política de Privacidade e Termos de Uso.
* [`07-plano-de-testes.md`](./07-plano-de-testes.md) — Estratégia de testes (unitários, integração, contrato, E2E Playwright e cobertura).
* [`08-runbook-operacional.md`](./08-runbook-operacional.md) — Operação em produção, rotação de segredos, rollback e resposta a incidentes.
* [`09-submissao-openai.md`](./09-submissao-openai.md) — Dossiê do OpenAI Apps SDK e pacote completo de submissão e revisão.
* [`10-backlog-e-cronograma.md`](./10-backlog-e-cronograma.md) — Plano de execução com 45 tarefas (`T-001` a `T-045`), estimativas, dependências e status dos marcos.
