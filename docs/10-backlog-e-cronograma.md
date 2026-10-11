# Backlog Completo e Cronograma de Execução (`docs/10-backlog-e-cronograma.md`)

Este documento consolida o plano de desenvolvimento ponta a ponta do **`chatgpt-anki-plugin`**, com **45 tarefas identificadas (`T-001` a `T-045`)**, estimadas em pontos de esforço / horas, priorizadas (MoSCoW), com dependências explícitas e atribuídas aos agentes especializados.

---

## 1. Visão Geral das Fases e Marcos

| Marco | Fase | Entregável Principal | Critérios de Saída | Status |
|:------|:-----|:---------------------|:-------------------|:-------|
| **M0** | Bootstrap | Repositório GitHub público, estrutura, licença, configs e CI | `C1`, `C15` | Concluído |
| **M1** | Pesquisa | Dossiê OpenAI Apps SDK + Dossiê Anki/AnkiConnect/FSRS + 6 ADRs | `C3`, `C4` | Concluído |
| **M2** | Especificação | 15 RFs, 12 RNFs, Contratos das 13 Tools MCP e Plano de Testes | `C2`, `C3`, `C5`, `C6` | Concluído |
| **M3** | Núcleo | Domínio, Adapters Anki, Ponte WebSocket, Servidor MCP, OAuth 2.1 + PKCE e 13 Tools | `C5`, `C6`, `C7`, `C8` | Concluído |
| **M4** | Interface | Widgets do Apps SDK (`deck-browser` e `review-session`) + Testes E2E Playwright | `C10` | Concluído |
| **M5** | Produção | Docker, `render.yaml`, observabilidade, política de privacidade, runbook operacional | `C9`, `C13`, `C14` | Pronto para ativação de host (`render.yaml`) |
| **M6** | Publicação | Pacote de submissão OpenAI completo e roteiro de publicação final | `C11`, `C12` | Pacote pronto; submissão aguarda verificação de org OpenAI pelo titular |

---

## 2. Backlog Detalhado de Tarefas (`T-001` a `T-045`)

| ID | Marco | Tarefa | Objetivo | Entregável | Depende de | Estimativa | Prioridade | Agente Responsável | Status |
|:---|:------|:-------|:---------|:-----------|:-----------|:-----------|:-----------|:-------------------|:-------|
| **T-001** | M0 | Inicializar repositório Git e estrutura de pastas | Criar árvore de diretórios padronizada, `package.json`, `tsconfig.json`, `.gitignore` e `LICENSE` MIT | Estrutura base do repo | — | 2h | P0 (Must) | DevOps | Done |
| **T-002** | M1 | Dossiê OpenAI Apps SDK + MCP Remoto | Levantar especificações oficiais de Streamable HTTP, `_meta`, `window.openai`, OAuth 2.1 + PKCE e diretrizes de revisão | `docs/09-submissao-openai.md` | T-001 | 4h | P0 (Must) | Pesquisador OpenAI | Done |
| **T-003** | M1 | Dossiê Técnico Anki (AnkiConnect v6, busca, FSRS, ToS) | Mapear todas as actions do AnkiConnect v6, sintaxe de busca, FSRS/SM-2 e restrições do AnkiWeb | `docs/03-arquitetura.md` | T-001 | 4h | P0 (Must) | Pesquisador Anki | Done |
| **T-004** | M1 | ADR-0001: Estratégia de acesso à coleção Anki | Avaliar 4 opções de acesso ao Anki e registrar escolha de AnkiConnect + Bridge WebSocket + Sandbox | `docs/04-adr/ADR-0001-*.md` | T-002, T-003 | 2h | P0 (Must) | Arquiteto | Done |
| **T-005** | M2 | Especificar Requisitos Funcionais (`RF-001`..`RF-015`) | Redigir 15 requisitos funcionais com critérios de aceite testáveis | `docs/01-requisitos-funcionais.md` | T-002, T-003 | 3h | P0 (Must) | Especificador | Done |
| **T-006** | M2 | Especificar Requisitos Não Funcionais (`RNF-001`..`RNF-012`) | Definir metas de latência, privacidade stateless, segurança, cobertura ≥ 80% e resiliência | `docs/02-requisitos-nao-funcionais.md` | T-005 | 3h | P0 (Must) | Especificador | Done |
| **T-007** | M2 | Especificar Contratos das 13 Tools MCP | Definir schemas de entrada/saída, anotações MCP, escopos OAuth e códigos de erro das 13 tools | `docs/05-tools-mcp.md` | T-005 | 4h | P0 (Must) | Arquiteto + Dev MCP | Done |
| **T-008** | M1 | ADR-0002: Transporte MCP Streamable HTTP Stateless | Documentar decisão pelo transporte Streamable HTTP stateless em `/mcp` | `docs/04-adr/ADR-0002-*.md` | T-002 | 1h | P0 (Must) | Arquiteto | Done |
| **T-009** | M1 | ADR-0003: Autenticação OAuth 2.1 + PKCE e Escopos | Documentar arquitetura OAuth 2.1, RFC 9728, RFC 8414, RFC 7591 e escopos por operação | `docs/04-adr/ADR-0003-*.md` | T-002 | 2h | P0 (Must) | Segurança | Done |
| **T-010** | M1 | ADR-0004: Privacidade Stateless e Zero Retenção | Registrar política de zero persistência de flashcards e redação de logs | `docs/04-adr/ADR-0004-*.md` | T-006 | 1h | P0 (Must) | Segurança | Done |
| **T-011** | M1 | ADR-0005: Widgets do OpenAI Apps SDK (`text/html+skybridge`) | Definir arquitetura de widgets autocontidos e integração `window.openai` | `docs/04-adr/ADR-0005-*.md` | T-002 | 1.5h | P1 (Should) | Dev Frontend | Done |
| **T-012** | M1 | ADR-0006: Compatibilidade FSRS/SM-2 e `update_deck` | Definir delegação de agendamento via `answerCards` e migração segura em `update_deck` | `docs/04-adr/ADR-0006-*.md` | T-003 | 1.5h | P0 (Must) | Arquiteto | Done |
| **T-013** | M3 | Modelagem de Domínio e Erros Tipados | Implementar entidades `Deck`, `Note`, `Card`, `Review`, `CollectionStats` e `AnkiPluginError` | `src/domain/entities.ts`, `src/domain/errors.ts` | T-007 | 3h | P0 (Must) | Dev Backend | Done |
| **T-014** | M3 | Infraestrutura de Configuração, Logger e Telemetria | Implementar parser de variáveis de ambiente com `assertHttpSecurity`, logger sem vazamento de PII e métricas | `src/infra/config.ts`, `src/infra/logger.ts`, `src/infra/telemetry.ts` | T-013 | 3h | P0 (Must) | Dev Backend | Done |
| **T-015** | M3 | Utilitário e Validador de Sintaxe de Busca Anki | Implementar validação de queries, escape de baralhos/tags e composição de filtros nativos do Anki | `src/anki/search.ts` | T-013 | 2.5h | P0 (Must) | Dev Backend | Done |
| **T-016** | M3 | Utilitário de Revisão e Normalização FSRS/SM-2 | Implementar normalização de ratings (`1..4` / `again..easy`) e cálculo determinístico de revisão para sandbox | `src/anki/review.ts` | T-013 | 2h | P0 (Must) | Dev Backend | Done |
| **T-017** | M3 | Interface `AnkiAdapter` e `AnkiConnectAdapter` (HTTP JSON-RPC v6) | Implementar cliente completo para o AnkiConnect (`deckNamesAndIds`, `getDeckStats`, `findCards`, `cardsInfo`, `notesInfo`, `addNote`, `updateNoteFields`, `answerCards`, etc.) | `src/anki/adapter.ts`, `src/anki/anki-connect-adapter.ts` | T-013, T-015, T-016 | 6h | P0 (Must) | Dev Backend | Done |
| **T-018** | M3 | `InMemoryAnkiAdapter` (Coleção Sintética para Testes e Sandbox) | Implementar adaptador em memória completo com seed de baralhos, notas, cartões e revisões | `src/anki/memory-adapter.ts` | T-017 | 4h | P0 (Must) | Dev Backend | Done |
| **T-019** | M3 | `BridgeRelayAdapter` + CLI `anki-bridge` (Túnel Reverso WebSocket) | Implementar hub WebSocket no servidor (`/bridge`) e CLI local que encaminha chamadas ao `127.0.0.1:8765` | `src/anki/bridge-adapter.ts`, `src/bridge/cli.ts` | T-017 | 5h | P0 (Must) | Dev Backend | Done |
| **T-020** | M3 | Contexto Compartilhado das Tools (`writeBlocked`, `requireScope`, `formatToolError`) | Criar helpers padronizados para resposta `ok`, bloqueio `ANKI_READ_ONLY`, checagem de escopo OAuth e formatação de erros | `src/tools/context.ts` | T-013, T-014 | 2.5h | P0 (Must) | Dev MCP | Done |
| **T-021** | M3 | Implementar Tool `list_decks` | Listar baralhos com hierarquia, filtro por query e estatísticas agregadas | `src/tools/list-decks.ts` | T-017, T-020 | 1.5h | P0 (Must) | Dev MCP | Done |
| **T-022** | M3 | Implementar Tool `get_deck` | Retornar estatísticas, sub-baralhos, configuração e amostra de cartões de um baralho | `src/tools/get-deck.ts` | T-017, T-020 | 1.5h | P0 (Must) | Dev MCP | Done |
| **T-023** | M3 | Implementar Tool `create_deck` | Criar baralho ou sub-baralho com validação e idempotência | `src/tools/create-deck.ts` | T-017, T-020 | 1.5h | P0 (Must) | Dev MCP | Done |
| **T-024** | M3 | Implementar Tool `update_deck` | Mover cartões entre baralhos e/ou renomear baralho migrando seus cartões | `src/tools/update-deck.ts` | T-017, T-020 | 2h | P0 (Must) | Dev MCP | Done |
| **T-025** | M3 | Implementar Tool `delete_deck` | Excluir baralho com exigência de `confirm: true` e proteção do baralho `Default` | `src/tools/delete-deck.ts` | T-017, T-020 | 1.5h | P0 (Must) | Dev MCP | Done |
| **T-026** | M3 | Implementar Tool `search_cards` | Pesquisar cartões via sintaxe nativa do Anki com paginação (`limit`, `offset`) | `src/tools/search-cards.ts` | T-015, T-017, T-020 | 2h | P0 (Must) | Dev MCP | Done |
| **T-027** | M3 | Implementar Tool `get_card` | Retornar detalhes completos do cartão, nota associada e histórico de revisões | `src/tools/get-card.ts` | T-017, T-020 | 1.5h | P0 (Must) | Dev MCP | Done |
| **T-028** | M3 | Implementar Tool `create_note` | Criar nota em qualquer modelo (`Basic`, `Cloze`) com validação de campos e duplicatas | `src/tools/create-note.ts` | T-017, T-020 | 2h | P0 (Must) | Dev MCP | Done |
| **T-029** | M3 | Implementar Tool `update_note` | Atualizar campos e tags (`tags`, `addTags`, `removeTags`) de uma nota existente | `src/tools/update-note.ts` | T-017, T-020 | 2h | P0 (Must) | Dev MCP | Done |
| **T-030** | M3 | Implementar Tool `delete_note` | Excluir notas por ID com confirmação obrigatória (`confirm: true`) | `src/tools/delete-note.ts` | T-017, T-020 | 1.5h | P0 (Must) | Dev MCP | Done |
| **T-031** | M3 | Implementar Tool `get_due_cards` | Retornar fila de cartões devidos para estudo imediato com metadados de widget | `src/tools/get-due-cards.ts` | T-016, T-017, T-020 | 2h | P0 (Must) | Dev MCP | Done |
| **T-032** | M3 | Implementar Tool `submit_review` | Submeter avaliação `Again/Hard/Good/Easy` (`1..4`) para um cartão e retornar novo agendamento | `src/tools/submit-review.ts` | T-016, T-017, T-020 | 2h | P0 (Must) | Dev MCP | Done |
| **T-033** | M3 | Implementar Tool `get_stats` | Retornar estatísticas da coleção, revisões hoje, histórico diário e contagens por estado | `src/tools/get-stats.ts` | T-017, T-020 | 2h | P0 (Must) | Dev MCP | Done |
| **T-034** | M4 | Implementar Widgets do OpenAI Apps SDK (`deck-browser` e `review-session`) | Construir recursos HTML `text/html+skybridge` integrados a `window.openai` e registrá-los no servidor MCP | `src/widgets/index.ts` | T-021..T-033 | 5h | P0 (Must) | Dev Frontend | Done |
| **T-035** | M3 | Servidor OAuth 2.1 + PKCE (`S256`) + DCR + JWKS + Middleware Bearer | Implementar endpoints `/.well-known/*`, `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` e validação JWT | `src/mcp/auth/*` | T-009, T-014 | 6h | P0 (Must) | Segurança | Done |
| **T-036** | M3 | Servidor MCP (`McpServer`) e Transporte HTTP Express (`/mcp`, `/health`, `/privacy`, `/terms`) | Integrar as 13 tools, os 2 widgets, OAuth 2.1, rate limiting, Helmet e healthcheck em um servidor HTTP/stdio unificado | `src/mcp/server.ts`, `src/mcp/http-server.ts`, `src/index.ts` | T-034, T-035 | 4h | P0 (Must) | Dev MCP | Done |
| **T-037** | M3 | Suíte de Testes Unitários (`tests/unit/*`) | Testar `search.ts`, `review.ts`, `AnkiConnectAdapter`, `InMemoryAnkiAdapter`, `BridgeRelayAdapter` e `errors.ts` | `tests/unit/*.test.ts` | T-017, T-018, T-019 | 5h | P0 (Must) | QA | Done |
| **T-038** | M2/M3 | Suíte de Testes de Contrato das 13 Tools (`tests/contract/*`) | Validar JSON Schemas, anotações MCP, casos de sucesso, erros tipados, `ANKI_READ_ONLY` e escopos OAuth das 13 tools | `tests/contract/tools.contract.test.ts` | T-036 | 5h | P0 (Must) | QA | Done |
| **T-039** | M3 | Suíte de Testes de Integração HTTP + OAuth 2.1 + PKCE + Bridge (`tests/integration/*`) | Testar fluxo OAuth 2.1 completo, rejeição 401, chamadas `/mcp` autenticadas e ponte WebSocket `/bridge` | `tests/integration/http-oauth-mcp.test.ts` | T-035, T-036 | 5h | P0 (Must) | QA | Done |
| **T-040** | M4 | Suíte de Testes E2E Playwright dos Widgets (`tests/e2e/*`) | Validar renderização e interatividade dos widgets `deck-browser` e `review-session` em navegador real | `tests/e2e/widgets.spec.ts` | T-034, T-036 | 4h | P0 (Must) | QA | Done |
| **T-041** | M5 | Containerização Docker, Docker Compose e Blueprint Render (`render.yaml`) | Criar `docker/Dockerfile` multi-stage, `docker/docker-compose.yml` e `render.yaml` para deploy HTTPS automatizado | `docker/*`, `render.yaml` | T-036 | 3h | P0 (Must) | DevOps | Done |
| **T-042** | M0/M5 | Workflows GitHub Actions (CI, Secret Scan, SBOM, Release) | Configurar pipeline de lint, typecheck, testes + cobertura ≥ 80%, Playwright E2E, Gitleaks e CycloneDX SBOM | `.github/workflows/ci.yml`, `.github/workflows/release.yml` | T-001, T-038 | 3h | P0 (Must) | DevOps | Done |
| **T-043** | M5 | Documentação Completa (README, CONTRIBUTING, SECURITY, CHANGELOG, Runbook, Privacidade) | Redigir documentação em pt-BR permitindo setup em < 15 min, política de segurança e runbook operacional | `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/06-*`, `docs/08-*` | T-036, T-041 | 4h | P0 (Must) | Redator + Segurança | Done |
| **T-044** | M0 | Publicar Repositório `Sudo-psc/chatgpt-anki-plugin` no GitHub + Issue Épica | Criar repositório público via `gh repo create`, enviar branch `main`, configurar proteção e abrir Issue Épica #1 | Repositório GitHub + Issue #1 | T-042, T-043 | 1.5h | P0 (Must) | Orquestrador | Em execução |
| **T-045** | M6 | Pacote de Submissão OpenAI e Roteiro de Ativação em Produção | Consolidar ativos (`public/icon.svg`, `/privacy`, `/terms`, `docs/09-*`) e guia passo a passo para deploy no Render e envio no painel OpenAI | `docs/09-submissao-openai.md`, `public/icon.svg` | T-040, T-043, T-044 | 2h | P0 (Must) | Orquestrador + Redator | Done |

---

## 3. Riscos Identificados e Planos de Mitigação (Plano B)

| ID | Risco / Dependência Externa | Impacto | Probabilidade | Plano de Mitigação / Plano B |
|:---|:----------------------------|:--------|:--------------|:-----------------------------|
| **R-01** | AnkiWeb não possui API REST pública e proíbe scraping | Alto | Certo (Fato) | Resolvido no **ADR-0001**: uso oficial do AnkiConnect local + túnel reverso WebSocket (`anki-bridge`) + modo Sandbox em memória para avaliação da OpenAI. |
| **R-02** | Conta do usuário ainda não possui *Organization Verification* concluída na OpenAI Platform | Bloqueia apenas a submissão pública na loja (C11/C12), mas **não** o uso em Developer Mode no ChatGPT Plus/Pro (C10) | Confirmado | O pacote de submissão (`docs/09-submissao-openai.md`), `/privacy`, `/terms` e ícone já estão prontos; o usuário pode usar imediatamente no ChatGPT Plus/Pro via Developer Mode e submeter assim que verificar a organização. |
| **R-03** | Conexão do repositório ao Render exige autorização OAuth da conta Render no navegador | Necessário para provisionar a URL `*.onrender.com` (C9) | Confirmado | `render.yaml` (Blueprint IaC) e `docker/Dockerfile` já estão prontos e testados; basta clicar em *New Blueprint Instance* no painel do Render apontando para `Sudo-psc/chatgpt-anki-plugin` (ou usar `npx cloudflared tunnel --url http://127.0.0.1:3000` instantaneamente). |
| **R-04** | macOS App Nap suspende o Anki Desktop em segundo plano | Médio | Médio | Documentado no `README.md` e no Runbook (`defaults write net.ichi2.anki NSAppSleepDisabled -bool YES`) e tratado com erro acionável `ANKI_UNREACHABLE`. |
| **R-05** | Após a publicação no diretório, nome/assinatura/descrição de tools ficam **travados**; cada atualização exige resubmissão (uma versão em revisão por vez) | Médio | Certo (regra da OpenAI) | Congelar o contrato v1 das 13 tools antes da submissão (ver **ADR-0007**); agrupar mudanças de contrato em releases únicas; mudanças operacionais sem tocar o contrato (env vars, runtime, hospedagem) permanecem imediatas. |
