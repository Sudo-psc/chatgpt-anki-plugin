# Guia de Contribuição (`CONTRIBUTING.md`)

Obrigado pelo interesse em contribuir com o **`chatgpt-anki-plugin`**!

## 1. Pré-requisitos

* **Node.js** `>= 22.12.0` e `npm`
* **Git**
* **Anki Desktop** + add-on **AnkiConnect** (código `2055492159`) — opcional para desenvolvimento local graças ao `InMemoryAnkiAdapter` (`ANKI_BACKEND=memory`).

## 2. Fluxo de Branches e Commits

* `main`: branch principal protegida (sempre pronta para produção).
* `develop`: branch de integração.
* `feat/<escopo>`, `fix/<escopo>`, `docs/<escopo>`, `release/<versao>`: branches de trabalho.
* **Conventional Commits** em inglês:
  * `feat(tools): add interval filter to search_cards`
  * `fix(anki): handle null deck stats on empty profile`
  * `docs(adr): document OAuth 2.1 PKCE token lifecycle`

## 3. Como Executar Localmente e Validar Mudanças

```bash
npm install
npm run lint           # ESLint (zero warnings/errors)
npm run typecheck      # TypeScript strict (tsc --noEmit)
npm run test:coverage  # Vitest (unit + integration + contract, cobertura >= 80%)
npm run test:e2e       # Playwright E2E dos widgets do Apps SDK
npm run build          # Compila para dist/
```

## 4. Regras Obrigatórias para Pull Requests

1. **Nunca comite segredos, `.env` ou coleções reais (`.anki2`, `.apkg`, `.colpkg`).**
2. Toda alteração nas tools MCP exige atualização simultânea de [`docs/05-tools-mcp.md`](./docs/05-tools-mcp.md) e da suíte [`tests/contract/tools.contract.test.ts`](./tests/contract/tools.contract.test.ts).
3. Mudanças arquiteturais ou de requisitos exigem atualização de [`docs/01-requisitos-funcionais.md`](./docs/01-requisitos-funcionais.md) e um novo ADR em [`docs/04-adr/`](./docs/04-adr/).
4. Cobertura de testes em `src/tools` e `src/anki` deve permanecer **≥ 80%**.
