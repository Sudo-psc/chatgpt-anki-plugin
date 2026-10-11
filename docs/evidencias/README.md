# Evidências de verificação (C1–C15)

Artefatos que comprovam os critérios do programa. Evidências automatizadas são
regeneráveis via os comandos indicados; evidências externas exigem conta
(humano) e estão marcadas ⛔.

| # | Critério | Evidência | Como reproduzir |
|:---|:---|:---|:---|
| C1 | Repo público com README/LICENSE/CONTRIBUTING e estrutura | URL do repositório + `git ls-tree -r main` | `git ls-tree -r main` |
| C2 | Plano com ≥40 tarefas | [`10-backlog-e-cronograma.md`](../10-backlog-e-cronograma.md) (50 tarefas) | leitura |
| C3 | ≥12 FR + ≥10 NFR com critérios | [`01-*`](../01-requisitos-funcionais.md), [`02-*`](../02-requisitos-nao-funcionais.md) (14+12) | leitura |
| C4 | ≥6 ADRs | [`04-adr/`](../04-adr/) (8 ADRs) | leitura |
| C5 | 13 tools implementadas | [`05-*`](../05-tools-mcp.md) + `npm run test:contract` | `npm run test:contract` |
| C6 | JSON Schema validado + erros tipados | `tests/contract` (7 testes, output real × schema) | `npm run test:contract` |
| C7 | OAuth 2.1+PKCE+scopes; 401 p/ token inválido | `tests/integration/auth.test.ts` (15 testes) | `npm test` |
| C8 | Cobertura ≥80% + CI verde | `coverage/` + badge Actions | `npm run test:coverage` |
| C9 | MCP público HTTPS + healthcheck 200 | `curl https://<host>/health` | após T-045 (⛔ FLY_API_TOKEN) |
| C10 | Developer mode com as tools invocáveis | `C10-developer-mode.md` (transcrição) | roteiro em `09-*` §7 (⛔ conta ChatGPT) |
| C11 | Submissão enviada | comprovante do portal | `09-*` §8 (⛔ conta OpenAI) |
| C12 | App aprovado/publicado | link no diretório | (⛔ revisão humana) |
| C13 | Setup por terceiro < 15 min | `C13-setup-15min.md` | README Quickstart + cronômetro |
| C14 | Runbook completo | [`08-*`](../08-runbook-operacional.md) | leitura |
| C15 | Sem segredos no histórico | job `secrets-scan` (gitleaks) no CI | `gitleaks git` / CI |

## Status atual (2026-10-10)

- **Verdes localmente:** C2, C3, C4, C5, C6, C7, C8, C14, C15 (CI local:
  lint+typecheck+122 testes+coverage+build; gitleaks config pronto).
- **Parciais:** C1 (repo local completo; espelho GitHub em execução),
  C13 (quickstart medido no smoke; formulário de usabilidade pendente).
- **Bloqueados externamente:** C9, C10, C11, C12 — requerem credenciais/contas
  do proprietário (FLY_API_TOKEN, conta OpenAI, sessão ChatGPT). Todos os
  pacotes preparatórios estão prontos.
