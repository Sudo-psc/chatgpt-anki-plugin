# Evidências de verificação (C1–C15)

Artefatos que comprovam os critérios do programa. Evidências automatizadas são
regeneráveis via os comandos indicados; evidências externas exigem conta
(humano) e estão marcadas ⛔.

| # | Critério | Evidência | Como reproduzir |
|:---|:---|:---|:---|
| C1 | Repo público com README/LICENSE/CONTRIBUTING e estrutura | https://github.com/Sudo-psc/chatgpt-anki-plugin (103 arquivos em `main`) + `git ls-tree -r main` | `git ls-tree -r main` |
| C2 | Plano com ≥40 tarefas | [`10-backlog-e-cronograma.md`](../10-backlog-e-cronograma.md) (50 tarefas) | leitura |
| C3 | ≥12 FR + ≥10 NFR com critérios | [`01-*`](../01-requisitos-funcionais.md), [`02-*`](../02-requisitos-nao-funcionais.md) (14+12) | leitura |
| C4 | ≥6 ADRs | [`04-adr/`](../04-adr/) (8 ADRs) | leitura |
| C5 | 13 tools implementadas | [`05-*`](../05-tools-mcp.md) + `npm run test:contract` | `npm run test:contract` |
| C6 | JSON Schema validado + erros tipados | `tests/contract` (7 testes, output real × schema) | `npm run test:contract` |
| C7 | OAuth 2.1+PKCE+scopes; 401 p/ token inválido | `tests/integration/auth.test.ts` (15 testes) | `npm test` |
| C8 | Cobertura ≥80% + CI verde | `coverage/` + badge Actions | `npm run test:coverage` |
| C9 | MCP público HTTPS + healthcheck 200 | [`C9-deploy.md`](./C9-deploy.md) — https://chatgpt-anki-mcp-sudo.fly.dev (`/health` 200; E2E OAuth+tools OK) | `curl https://chatgpt-anki-mcp-sudo.fly.dev/health` |
| C10 | Developer mode com as tools invocáveis | [`C10-developer-mode.md`](./C10-developer-mode.md) — 16 prompts; `create_note` executada (ID 1700000000015); screenshots | `node scripts/chatgpt-browser-assist.mjs` (fases login/connector/connect/prompts) |
| C11 | Submissão enviada | comprovante do portal | `09-*` §8 (⛔ conta OpenAI) |
| C12 | App aprovado/publicado | link no diretório | (⛔ revisão humana) |
| C13 | Setup por terceiro < 15 min | `C13-setup-15min.md` | README Quickstart + cronômetro |
| C14 | Runbook completo | [`08-*`](../08-runbook-operacional.md) | leitura |
| C15 | Sem segredos no histórico | job `secrets-scan` (gitleaks) no CI | `gitleaks git` / CI |

## Status atual (2026-10-10)

- **Verdes:** C1, C9 (deploy público Fly + E2E público), **C10** (developer
  mode executado: 16 prompts, leitura e escrita via linguagem natural), C2, C3,
  C4, C5, C6, C7, C8, C14, C15 (CI: lint+typecheck+125 testes+coverage+build;
  gitleaks no CI).
- **Parciais:** C13 (quickstart medido no smoke; formulário de usabilidade com
  terceiro pendente).
- **Bloqueados externamente:** C11, C12 (conta OpenAI verificada + revisão
  humana). Pacotes preparatórios 100% prontos (`docs/09-*`).
