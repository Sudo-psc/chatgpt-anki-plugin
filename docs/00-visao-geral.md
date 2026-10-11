# 00 — Visão Geral

> Escopo congelado em 2026-10-10 (ver `CHANGELOG.md` v0.1.0). Alterações de
> escopo exigem atualização deste documento e um novo ADR.

## O que é

**chatgpt-anki-plugin** é um servidor MCP (Model Context Protocol) remoto que
conecta o ChatGPT à coleção Anki do usuário via **AnkiConnect**, permitindo, por
linguagem natural:

- **Visualizar** baralhos, sub-baralhos, notas e cartões;
- **Criar/editar/excluir** baralhos, notas e cartões;
- **Pesquisar** com a sintaxe nativa de busca do Anki;
- **Revisar** cartões (Again/Hard/Good/Easy) e ver estatísticas de progresso;
- **Gerenciar tags** e **templates de modelos de nota**.

O ChatGPT se conecta ao servidor como um *connector* (Apps SDK/MCP), com OAuth
2.1 + PKCE e scopes por operação.

## Por que AnkiConnect (e não AnkiWeb)

O **AnkiWeb não expõe API REST pública** e o servidor de sync oficial não é uma
API de dados — o próprio manual do Anki recomenda o AnkiConnect para esse caso
(ver citações e trade-offs em [`04-adr/ADR-0001-estrategia-acesso-anki.md`](04-adr/ADR-0001-estrategia-acesso-anki.md)).
O projeto **não** acessa o AnkiWeb, não automatiza login e não armazena
credenciais do AnkiWeb.

## Arquitetura em uma frase

ChatGPT → (HTTPS, MCP Streamable HTTP, OAuth 2.1) → **este servidor** →
(HTTP local, AnkiConnect) → Anki Desktop do usuário. O servidor é *stateless*:
não persiste conteúdo de cartões.

## Público-alvo

Estudantes, concurseiros, profissionais de saúde, pesquisadores e usuários
avançados de Anki que já usam ChatGPT. Secundariamente, desenvolvedores que
queiram auto-hospedar o servidor (Docker/Fly.io).

## Escopo

**Dentro do escopo (v0.1)**

- As 13 tools mandatadas + 2 estendidas (`manage_tags`, `update_model_templates`);
- AnkiConnect local/self-hosted como backend primário; backend `mock` sintético para demo/testes/revisão;
- OAuth 2.1 (authorization code + PKCE S256), DCR, scopes por operação, rate limit;
- Widgets do Apps SDK (lista e revisão);
- Docker, CI/CD, observabilidade (logs estruturados + gancho OTel), runbook;
- Deploy single-tenant (uma instância por usuário/self-host).

**Fora do escopo (v0.1) — com justificativa**

- **Multi-tenant público** (uma instância atendendo vários usuários com AnkiConnect distinto): roadmap ADR-0008; exige armazenamento cifrado de config por usuário.
- **Cliente de sync AnkiWeb / scraping**: proibido por política do projeto (ver ADR-0001).
- **Edição de baralhos granular** (opções de agendamento FSRS por deck): fora das tools v0.1; AnkiConnect não expõe tudo de forma estável.
- **Renomear decks com subdecks**: limitação do AnkiConnect documentada em `05-tools-mcp.md`.
- **Refresh tokens**: o connector do ChatGPT re-executa o fluxo de autorização; tokens de 1h.

## Princípios

1. **Nada de APIs inventadas** — cada capacidade é rastreada a uma ação do AnkiConnect API v6 ou marcada como limitação.
2. **Stateless por padrão** — nenhum conteúdo de cartão é persistido; sem consentimento explícito não há exceções.
3. **Erros acionáveis** — toda falha tem código tipado + mensagem + hint (`05-tools-mcp.md`).
4. **Segurança em profundidade** — OAuth 2.1, scopes por operação, rate limit, validação de Origin, confirmação explícita em operações destrutivas.
5. **Verificável** — ≥80% de cobertura nos módulos críticos, testes de contrato das tools, smoke E2E, CI com scan de segredos.

## Glossário

| Termo | Definição |
|:---|:---|
| **MCP** | Model Context Protocol (spec 2025-06-18 usada aqui; transporte Streamable HTTP). |
| **AnkiConnect** | Add-on do Anki Desktop que expõe a coleção via HTTP em `127.0.0.1:8765` (API v6). |
| **Deck/Baralho** | Pasta de cartões; subdecks usam `Pai::Filho`. |
| **Note/Nota** | Conteúdo (campos) que gera um ou mais cartões via modelo (note type). |
| **Model** | Tipo de nota: define campos e templates (frente/verso/CSS). |
| **Tool** | Função MCP invocável pelo modelo do ChatGPT (ex.: `list_decks`). |
| **Scope** | Permissão OAuth necessária para uma operação (`anki:read`, `anki:write`, `anki:review`, `anki:admin`). |
| **Mock backend** | Emulador in-memory do AnkiConnect com coleção 100% sintética (`ANKI_BACKEND=mock`). |

## Critérios de sucesso do projeto (C1–C15)

Os critérios verificáveis do programa estão espelhados no
[`10-backlog-e-cronograma.md`](10-backlog-e-cronograma.md) § "Pronto quando",
com o mapeamento de evidência → artefato. O estado atual de cada um é
reportado em `docs/evidencias/` e no relatório do programa.
