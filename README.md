# ChatGPT ↔ Anki (chatgpt-anki-plugin)

[![CI](https://github.com/Sudo-psc/chatgpt-anki-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Sudo-psc/chatgpt-anki-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)
[![MCP](https://img.shields.io/badge/MCP-2025--06--18-blue)](https://modelcontextprotocol.io)

Servidor **MCP** (Model Context Protocol) remoto que conecta o **ChatGPT** à sua
coleção **Anki**, via **AnkiConnect**. Fale em linguagem natural para
**visualizar, criar, editar, pesquisar e revisar** seus flashcards — com os
dados ficando no **seu** Anki.

> ⚠️ **Não afiliado** à Ankitects Pty Ltd (Anki/AnkiWeb) nem à OpenAI
> (ChatGPT). Projeto independente, licença MIT.

## O que dá para fazer

- 📚 Listar baralhos e sub-baralhos, com estatísticas de cada deck;
- 🔍 Pesquisar cartões/notas com a sintaxe nativa do Anki (`deck:`, `tag:`, `is:due`, …);
- ✏️ Criar/editar/excluir baralhos, notas e cartões (com confirmação para exclusões);
- 🏷️ Gerenciar tags e templates de modelos de nota;
- 🧠 Revisar com Again/Hard/Good/Easy e acompanhar estatísticas de progresso;
- 🖥️ Widgets dentro do ChatGPT (lista de cartões e sessão de revisão).

**15 tools MCP:** `list_decks`, `get_deck`, `create_deck`, `update_deck`,
`delete_deck`, `search_cards`, `get_card`, `create_note`, `update_note`,
`delete_note`, `get_due_cards`, `submit_review`, `get_stats` +
`manage_tags`, `update_model_templates`.
Contratos completos: [`docs/05-tools-mcp.md`](docs/05-tools-mcp.md).

## Demo pública (dados sintéticos)

Instância de demonstração com OAuth ativo e coleção **100% sintética** — use no
ChatGPT (developer mode) ou nos testes:

**`https://chatgpt-anki-mcp-sudo.fly.dev/mcp`** · `curl https://chatgpt-anki-mcp-sudo.fly.dev/health`

## Quickstart (demo em ~2 minutos)

Pré-requisito: Docker com Compose. Modo demo usa uma **coleção 100% sintética**
(sem tocar em nenhum dado real):

```bash
git clone https://github.com/Sudo-psc/chatgpt-anki-plugin.git
cd chatgpt-anki-plugin
docker compose -f docker/docker-compose.yml --profile demo up -d --build anki-mcp-demo
curl -fsS http://localhost:8080/health   # {"status":"ok",...}
```

Teste uma chamada MCP (o modo demo expõe um dev token **somente local**):

```bash
curl -s -X POST http://localhost:8080/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'authorization: Bearer demo-token-change-me' \
  -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_decks","arguments":{}}}'
```

### Desenvolvimento local (sem Docker)

```bash
npm install
npm run demo     # servidor com backend mock em http://localhost:8080
npm test         # 122 testes (unit + integração + contrato)
npm run test:coverage
npm run e2e      # Playwright (npx playwright install chromium uma vez)
bash scripts/smoke.sh
```

## Conectar ao seu Anki real

1. **Anki Desktop** aberto com o add-on **AnkiConnect** instalado
   (código `2055492159`; preferencialmente **com `apiKey`** configurado).
2. Rode o servidor apontando para o AnkiConnect:

   ```bash
   cp .env.example .env          # ajuste TOKEN_SECRET e ANKI_CONNECT_URL
   docker compose -f docker/docker-compose.yml up -d --build
   ```

   ou sem Docker: `ANKI_BACKEND=connect ANKI_CONNECT_URL=http://127.0.0.1:8765 npm run dev`.

3. **ChatGPT** → Settings → Connectors → Advanced → *Developer mode* ON →
   **Create** → URL `https://<seu-host>/mcp` → autorize via OAuth.
   Para expor localmente em HTTPS: `ngrok http 8080` ou Cloudflare Tunnel.
4. Produção (Fly.io): siga o [runbook](docs/08-runbook-operacional.md).

### Sem depender do seu computador (backend AnkiWeb) — ✅ ATIVO

O microsserviço [`docker/ankiweb-service`](docker/ankiweb-service/README.md)
roda um **Anki headless syncado à sua conta AnkiWeb** na nuvem + o servidor MCP
na mesma máquina (o AnkiConnect nunca é exposto). Seu Mac pode ficar desligado.

**Status (2026-10-11):** ativo em `https://chatgpt-anki-real.fly.dev` com a conta
AnkiWeb real — 77 baralhos, 7.430 cartões vencidos, sync a cada 15 min; conector
`Anki (Minha Coleção)` autorizado no ChatGPT. Para reproduzir do zero:

```bash
fly apps create chatgpt-anki-real
fly secrets set TOKEN_SECRET="$(openssl rand -base64 48)" OWNER_PASSWORD="<forte>"
fly deploy --config fly.ankiweb.toml
```

Detalhes (upload do perfil, segurança, custos): [README do serviço](docker/ankiweb-service/README.md)
e [ADR-0009](docs/04-adr/ADR-0009-microsservico-ankiweb.md).

## Arquitetura (resumo)

```
ChatGPT ──(HTTPS · MCP Streamable HTTP · OAuth 2.1+PKCE)──▶ chatgpt-anki-plugin
                                                              │
                                             (HTTP local · AnkiConnect API v6)
                                                              ▼
                                                    Anki Desktop do usuário
```

- **Stateless**: nenhum conteúdo de cartão é armazenado (ver
  [ADR-0004](docs/04-adr/ADR-0004-stateless-sem-persistencia.md));
- **OAuth 2.1 + PKCE S256** com **scopes por operação**
  (`anki:read` · `anki:write` · `anki:review` · `anki:admin`);
- **Erros tipados e acionáveis** (`{code, message, hint}`);
- Detalhes: [`docs/03-arquitetura.md`](docs/03-arquitetura.md) e
  [8 ADRs](docs/04-adr/).

## Limitações conhecidas (honestas)

- **AnkiWeb não tem API pública.** O projeto usa **AnkiConnect** (recomendação
  do próprio manual do Anki) e **nunca** acessa o AnkiWeb ou armazena suas
  credenciais — ver [ADR-0001](docs/04-adr/ADR-0001-estrategia-acesso-anki.md).
- **Anki Desktop precisa estar aberto** com o add-on AnkiConnect (o servidor
  reporta `ANKI_UNAVAILABLE` com instruções quando não está).
- **v0.1 é single-tenant** (uma instância por usuário/self-host); multi-tenant
  é o roadmap para listagem pública plena — ver
  [ADR-0008](docs/04-adr/ADR-0008-single-tenant-primeiro.md).
- `update_deck` (renomear) é composto e **não suporta decks com subdecks**
  (AnkiConnect não tem rename nativo).
- `update_note.tags` **substitui** a lista de tags (use `manage_tags` para merge).
- `submit_review` requer AnkiConnect recente (ação `answerCards`); versões
  antigas retornam erro com instrução de atualização.

## Configuração

Todas as variáveis documentadas em [`.env.example`](./.env.example).
Destaques: `TOKEN_SECRET` (obrigatório em produção), `ANKI_CONNECT_URL`,
`ANKI_CONNECT_API_KEY`, `PUBLIC_BASE_URL`, `DEFAULT_SCOPE`, `AUTH_REQUIRED`,
`MCP_DEV_TOKEN` (só em dev), `RATE_LIMIT_PER_MINUTE`, `MAX_BODY_BYTES`.

## Segurança e privacidade

- [`SECURITY.md`](./SECURITY.md) — reporte vulnerabilidades em privado;
- [`docs/06-seguranca-e-privacidade.md`](docs/06-seguranca-e-privacidade.md) — STRIDE, LGPD/GDPR;
- [Política de Privacidade](docs/legal/politica-de-privacidade.md) ·
  [Termos de Uso](docs/legal/termos-de-uso.md).

## Estrutura do repositório

```
src/mcp/       protocolo MCP, OAuth, rate limit, servidor
src/tools/     as 15 tools (contratos Zod + handlers + erros)
src/anki/      adapters AnkiConnect + MockAnkiConnect (demo/testes)
src/domain/    entidades e mappers (anti-corruption layer)
src/widgets/   UI do Apps SDK (decks, review)
docs/          00–10 + ADRs + legais + evidências
tests/         unit · integration · contract · e2e
docker/  .github/workflows/  scripts/
```

## Documentação completa

Índice em [`docs/README.md`](docs/README.md) — visão, requisitos (14 FR + 12
NFR), arquitetura, ADRs, contratos das tools, segurança, testes, runbook,
submissão OpenAI e backlog (50 tarefas).

## Contribuindo

Leia [`CONTRIBUTING.md`](./CONTRIBUTING.md): Conventional Commits, branches
protegidas, CI obrigatória, cobertura ≥80% em `src/tools` e `src/anki`, e a
regra de ouro: **nunca** dados reais em fixtures — use a coleção sintética.

## Licença

[MIT](./LICENSE) © 2026 Philipe Saraiva Cruz.
