# ChatGPT ↔ Anki Plugin (`chatgpt-anki-plugin`)

[![CI](https://github.com/Sudo-psc/chatgpt-anki-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Sudo-psc/chatgpt-anki-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 22.12](https://img.shields.io/badge/node-%3E%3D22.12.0-brightgreen.svg)](./package.json)

Servidor **Model Context Protocol (MCP)** remoto (HTTPS) e local (`stdio`), com widgets interativos para o **OpenAI Apps SDK** (`text/html+skybridge`), que conecta o **ChatGPT** à sua coleção de flashcards **Anki** em tempo real.

---

## Principais Funcionalidades

* **13 Tools MCP completas** com validação Zod, JSON Schema e mensagens de erro acionáveis:
  * **Baralhos (Decks)**: `list_decks`, `get_deck`, `create_deck`, `update_deck`, `delete_deck`
  * **Busca e Cartões**: `search_cards` (suporta toda a sintaxe nativa do Anki: `deck:`, `tag:`, `is:due`, `is:new`, `prop:ivl>=`), `get_card`
  * **Notas (Notes)**: `create_note` (`Basic`, `Cloze` e modelos customizados), `update_note`, `delete_note`
  * **Revisão e Estatísticas (SM-2 & FSRS)**: `get_due_cards`, `submit_review` (`Again=1`, `Hard=2`, `Good=3`, `Easy=4`), `get_stats`
* **Widgets do OpenAI Apps SDK (`text/html+skybridge`)**:
  * `ui://widget/deck-browser.html` — Navegador de baralhos, contagens de fila e cartões pesquisados.
  * `ui://widget/review-session.html` — Sessão de estudo interativa com botão *Mostrar resposta* e botões *Again / Hard / Good / Easy* integrados a `window.openai.callTool('submit_review', ...)`.
* **Segurança OAuth 2.1 + PKCE (`S256`)**:
  * Descoberta RFC 9728 (`/.well-known/oauth-protected-resource`) e RFC 8414 (`/.well-known/oauth-authorization-server`).
  * Dynamic Client Registration RFC 7591 (`POST /oauth/register`).
  * Escopos por operação (`anki:read`, `anki:write`, `anki:review`, `anki:delete`).
* **Privacidade Stateless (Zero Retenção de Cartões)**:
  * Nenhum cartão é salvo em banco de dados no servidor; logs estruturados em `stderr` redigem automaticamente campos de cartões e tokens.
* **3 Modos de Conexão ao Anki (`ANKI_BACKEND`)**:
  1. `ankiconnect` — conexão HTTP direta com o add-on **AnkiConnect** (`2055492159`, porta `8765`).
  2. `bridge` — túnel reverso WebSocket (`npx chatgpt-anki-plugin bridge`) que conecta sua coleção Anki local ao servidor MCP em nuvem (Render/Docker) **sem abrir portas no roteador e sem violar os Termos de Uso do AnkiWeb**.
  3. `memory` — coleção sintética determinística em memória para testes, CI e avaliação imediata no ChatGPT.

---

## Guia de Instalação Rápida (< 10 minutos)

### 1. Pré-requisitos

* **Node.js** `>= 22.12.0` e `npm`
* *(Para uso com sua coleção real)* **Anki Desktop** aberto com o add-on [**AnkiConnect** (código `2055492159`)](https://ankiweb.net/shared/info/2055492159) instalado.
  * **Dica macOS**: desative o App Nap para o Anki não pausar em segundo plano:
    ```bash
    defaults write net.ichi2.anki NSAppSleepDisabled -bool YES
    ```

### 2. Clonar, Instalar e Subir Localmente

```bash
git clone https://github.com/Sudo-psc/chatgpt-anki-plugin.git
cd chatgpt-anki-plugin
npm install
cp .env.example .env
npm run build
npm start
```

Teste o healthcheck em outro terminal:

```bash
curl http://127.0.0.1:3000/health
```

### 3. Executar com Docker Compose

```bash
docker compose -f docker/docker-compose.yml up --build -d
curl http://127.0.0.1:3000/health
```

### 4. Deploy Público HTTPS (Render Blueprint) e Conexão com Anki Local

1. No painel do [Render](https://dashboard.render.com/), clique em **New → Blueprint** e selecione o repositório `Sudo-psc/chatgpt-anki-plugin` (o arquivo [`render.yaml`](./render.yaml) configura tudo automaticamente).
2. Para conectar seu Anki Desktop local ao servidor HTTPS em nuvem sem abrir portas no seu roteador, execute na sua máquina:
   ```bash
   npx chatgpt-anki-plugin bridge --server wss://<SEU-APP>.onrender.com/bridge --token <BRIDGE_SHARED_TOKEN>
   ```
3. No **ChatGPT (Plus / Pro / Team / Enterprise)**:
   * Ative **Settings → Apps & Connectors → Advanced → Developer Mode**.
   * Adicione o conector com a URL `https://<SEU-APP>.onrender.com/mcp` e autentique via OAuth 2.1 usando o seu `OAUTH_AUTHORIZE_PIN`.

---

## Estrutura do Repositório

```text
chatgpt-anki-plugin/
├─ .github/workflows/          # CI (lint, typecheck, coverage >=80%, E2E, Gitleaks, SBOM) e Release
├─ docs/
│  ├─ 00-visao-geral.md
│  ├─ 01-requisitos-funcionais.md
│  ├─ 02-requisitos-nao-funcionais.md
│  ├─ 03-arquitetura.md
│  ├─ 04-adr/                  # ADR-0001 a ADR-0006
│  ├─ 05-tools-mcp.md          # Contrato detalhado das 13 tools MCP
│  ├─ 06-seguranca-e-privacidade.md
│  ├─ 07-plano-de-testes.md
│  ├─ 08-runbook-operacional.md
│  ├─ 09-submissao-openai.md
│  └─ 10-backlog-e-cronograma.md
├─ src/
│  ├─ anki/                    # AnkiAdapter, AnkiConnectAdapter, BridgeRelayAdapter, InMemoryAnkiAdapter, search, review
│  ├─ bridge/                  # CLI `anki-bridge` (túnel WebSocket reverso)
│  ├─ domain/                  # Entidades (Deck, Note, Card, Review) e erros tipados
│  ├─ infra/                   # Config, Logger (stderr c/ redação PII), Telemetria
│  ├─ mcp/                     # McpServer, Streamable HTTP Express e OAuth 2.1 + PKCE
│  ├─ tools/                   # As 13 tools MCP (uma por arquivo)
│  └─ widgets/                 # Widgets HTML/JS do OpenAI Apps SDK (text/html+skybridge)
├─ tests/{unit,integration,e2e,contract}/
├─ scripts/                    # copy-assets, smoke, seed
├─ docker/                     # Dockerfile multi-stage + docker-compose.yml
├─ render.yaml                 # Blueprint IaC para deploy HTTPS no Render
├─ CHANGELOG.md  CONTRIBUTING.md  LICENSE  README.md  SECURITY.md
```

---

## Comandos de Desenvolvimento e Qualidade

```bash
npm run dev            # Servidor em modo watch (tsx)
npm run lint           # ESLint
npm run typecheck      # TypeScript strict (--noEmit)
npm test               # Vitest (unit + integration + contract)
npm run test:coverage  # Vitest com gate de cobertura >= 80% em src/tools e src/anki
npm run test:e2e       # Playwright E2E dos widgets do Apps SDK
npm run build          # Compila TypeScript para dist/
npm run smoke          # Smoke test contra servidor em execução
```

---

## Licença

Distribuído sob a licença **MIT**. Veja [`LICENSE`](./LICENSE) para mais informações.
