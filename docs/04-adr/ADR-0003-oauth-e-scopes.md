# ADR-0003 — OAuth 2.1 + PKCE + scopes por operação + tokens stateless

- **Status:** Aceito (2026-10-10)
- **Decisores:** Segurança, Dev MCP.

## Contexto

A spec MCP (2025-06-18) exige que servidores HTTP protegidos se comportem como
*resource servers* OAuth 2.1: Resource Metadata (RFC 9728), Authorization Server
Metadata (RFC 8414), PKCE obrigatório (S256), DCR recomendado (RFC 7591) e
validação de `aud` (RFC 8707). O ChatGPT (connector) descobre o fluxo via 401 +
`WWW-Authenticate: Bearer resource_metadata=...`.

## Decisão

1. **Authorization Code + PKCE S256 obrigatório**; `plain` rejeitado.
2. **DCR** habilitável (`OAUTH_ALLOW_DCR=true` por default), restrito a
   `OAUTH_ALLOWED_REDIRECT_URIS` (allowlist exata); client pré-registrado via
   env (`OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`) quando conveniente.
3. **Scopes por operação** — 4 escopos: `anki:read`, `anki:write`,
   `anki:review`, `anki:admin`. Mapa tool→scope em `docs/05-tools-mcp.md`.
   `anki:admin` **nunca** é concedido pelo default (`DEFAULT_SCOPE`).
4. **Tokens HS256** (JWT-shaped, assinados com `TOKEN_SECRET` via `node:crypto`)
   com `sub`, `scope`, `iss`, `aud`, `iat`, `exp` (default 1h). Enforcement em
   **dois pontos**: assinatura/`exp`/`iss`/`aud` no HTTP (401) e scope por tool
   no handler (`FORBIDDEN`).
5. **Authorization codes**: TTL 60s, uso único, revogados até em tentativa de
   troca malsucedida (anti-bruteforce), vinculados a client + redirect_uri +
   code_challenge.
6. **Refresh tokens fora do escopo v0.1** — o connector refaz o fluxo quando o
   token expira (documentado em `09-submissao-openai.md`).

## Alternativas consideradas

- **Sessões opacas em memória**: rejeitadas — estado por sessão em ambiente
  stateless (ADR-0002) e menos auditáveis que JWT assinado.
- **RS256/JWKS**: desnecessário para single-tenant (sem consumidores externos
  de chave pública); HS256 com segredo forte de 48+ bytes é adequado e mais
  simples de operar.
- **Sem scopes (token tudo-ou-nada)**: rejeitado — defense-in-depth exigido
  pelo NFR-03; um token vazado de leitura não pode deletar decks.

## Consequências

- Rotação de `TOKEN_SECRET` invalida todos os tokens (runbook cobre).
- O consentimento mostra os escopos em pt-BR; negação redireciona
  `error=access_denied`.
- Testes: `tests/integration/auth.test.ts` (15) cobrem o fluxo completo,
  PKCE errado, código reutilizado, scopes e 401s.
