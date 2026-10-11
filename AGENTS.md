# AGENTS.md — Operating Manual for AI Agents in `chatgpt-anki-plugin`

## What this project is

A production **Model Context Protocol (MCP)** server and **OpenAI Apps SDK** app (`chatgpt-anki-plugin`, TypeScript, Node ≥ 22.12) that connects ChatGPT to the user's Anki flashcard collection via **AnkiConnect** (`127.0.0.1:8765`), a **WebSocket reverse bridge** (`WSS /bridge` via `npx chatgpt-anki-plugin bridge`), or an **in-memory sandbox** (`ANKI_BACKEND=memory`).

Read before changing anything:

1. [`docs/00-visao-geral.md`](./docs/00-visao-geral.md) — frozen scope and overview.
2. [`docs/03-arquitetura.md`](./docs/03-arquitetura.md) and [`docs/04-adr/`](./docs/04-adr/) — architecture and ADRs.
3. [`docs/05-tools-mcp.md`](./docs/05-tools-mcp.md) — public contract for all 13 MCP tools.
4. [`docs/06-seguranca-e-privacidade.md`](./docs/06-seguranca-e-privacidade.md) — security invariants, OAuth 2.1 + PKCE, Privacy Policy & Terms.

## Commands

```bash
npm run dev            # tsx watch src/index.ts (HTTP server)
npm start              # node dist/index.js
npm run bridge         # tsx src/bridge/cli.ts (local WebSocket bridge agent)
npm run lint           # ESLint
npm run typecheck      # tsc -p tsconfig.json --noEmit
npm test               # Vitest (unit + integration + contract)
npm run test:coverage  # Vitest with >=80% coverage gate on src/tools and src/anki
npm run test:e2e       # Playwright E2E for OpenAI Apps SDK widgets
npm run build          # tsc -p tsconfig.build.json && node scripts/copy-assets.mjs
npm run smoke          # Smoke check against /health and /.well-known/oauth-protected-resource
```

## Invariants (never break)

- **stdout is sacred**: all logs go to `stderr` via [`src/infra/logger.ts`](./src/infra/logger.ts) with automatic PII/card field redaction.
- **Zero server-side flashcard persistence**: cards are processed in-memory (*stateless pass-through*).
- **OAuth 2.1 + PKCE (`S256`) required on non-loopback hosts**: enforced by `assertHttpSecurity` in [`src/infra/config.ts`](./src/infra/config.ts).
- **Writes respect `ANKI_READ_ONLY=1` and per-operation OAuth scopes** (`anki:read`, `anki:write`, `anki:review`, `anki:delete`).
- **Destructive tools (`delete_deck`, `delete_note`) require `confirm: true`.**
