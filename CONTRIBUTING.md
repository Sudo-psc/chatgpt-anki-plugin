# Contribuindo

Obrigado por contribuir com o `chatgpt-anki-plugin`! Este documento define o
fluxo de trabalho, as convenções de código e as regras de qualidade.

## Requisitos de ambiente

- Node.js ≥ 20 (recomendado 22 LTS)
- npm ≥ 10
- Docker (opcional, para o modo demo/mock)

## Fluxo de branches e PRs

| Branch | Uso |
|:---|:---|
| `main` | Produção. Protegida: sem push direto, CI obrigatória, 1 review. |
| `develop` | Integração contínua antes de release. |
| `feat/*` | Nova funcionalidade. |
| `fix/*` | Correção de bug. |
| `docs/*` | Documentação. |
| `release/*` | Preparação de release. |

Regras de PR:

1. Todo PR referencia a tarefa do backlog (`T-0XX`) e o requisito
   (`FR-XX`/`NFR-XX`) que atende.
2. CI verde é obrigatório (lint, typecheck, testes com cobertura, build,
   scan de segredos).
3. Cobertura ≥ 80% em `src/tools` e `src/anki` — o build falha abaixo disso.
4. Revisão por pessoa/agente **diferente do autor**; sem autoaprovação.
5. PRs que alteram escopo atualizam `docs/01-requisitos-funcionais.md` e
   registram um ADR em `docs/04-adr/`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
feat(tools): add get_due_cards tool
fix(anki): map AnkiConnect timeout to ANKI_UNAVAILABLE
docs(adr): add ADR-0001 Anki access strategy
test(contract): cover update_model_templates error paths
chore(ci): add gitleaks step
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `build`.

## Regras de código

- TypeScript `strict`; sem `any` implícito; imports relativos com extensão `.js`
  (ESM/NodeNext).
- Erros de negócio **sempre tipados** via `ToolError`/códigos documentados em
  `docs/05-tools-mcp.md`.
- Toda tool MCP nova exige: schema Zod de entrada/saída, scope, contrato
  documentado, teste de contrato e cobertura.
- Sem comentários supérfluos; comentários apenas para decisões não óbvias.

## Segurança e privacidade (inegociável)

- **Nunca** comitar segredos, chaves, `.env` real ou credenciais.
- **Nunca** usar conteúdo real de cartões/notas em fixtures, screenshots,
  exemplos ou documentação. Use a coleção sintética de `src/anki/mock`.
- O servidor é stateless: não adicione persistência de conteúdo de cartões sem
  consentimento explícito, criptografia e um ADR aprovado.
- Não implemente scraping do AnkiWeb, automação de login ou engenharia reversa
  do protocolo de sync. Leia o ADR-0001 antes de propor mudanças de acesso ao Anki.

## Rodando localmente

```bash
npm install
npm run demo          # servidor em modo demo (coleção sintética) em :8080
npm test              # testes unitários + integração + contrato
npm run test:coverage # com gate de cobertura
npm run lint && npm run typecheck && npm run build
```

## Reportando problemas de segurança

Veja [SECURITY.md](./SECURITY.md). Não abra issue pública para vulnerabilidades.
