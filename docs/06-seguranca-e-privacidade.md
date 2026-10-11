# 06 — Segurança e Privacidade

Documento de referência de segurança; política voltada ao usuário final em
[`legal/politica-de-privacidade.md`](legal/politica-de-privacidade.md).

## Modelo de ameaça (STRIDE)

| Ameaça | Vetor concreto | Controle implementado |
|:---|:---|:---|
| **S**poofing | Chamada a `/mcp` sem token / token forjado | Bearer obrigatório; HS256 com segredo ≥32 bytes; assinatura `timingSafeEqual`; 401 com `WWW-Authenticate` |
| **T**ampering | Alterar payload de token ou código OAuth | Assinatura HMAC; código de uso único vinculado a client+redirect+challenge; PKCE S256 |
| **R**epudiation | Negar ação destrutiva | Logs estruturados por tool call (subject, tool, resultado); `confirm=true` obrigatório em delete_* |
| **I**nfo disclosure | Vazamento de conteúdo de cartões/tokens | Stateless (ADR-0004); logs sem conteúdo + redação/truncamento; tokens nunca logados; `Cache-Control: no-store` no token endpoint |
| **D**oS | Flood em `/mcp` | Body limit (413), rate limit por subject (RATE_LIMITED), timeouts do cliente Anki (10 s) |
| **E**oP | Usuário comum virar "admin" | Scopes por operação; `anki:admin` fora do default; validação de `aud`/`iss`/`exp` |
| DNS rebinding | Servidor alcançado por origem maliciosa | Validação de `Origin` (403) — exigida pela spec MCP; bind local em dev |
| Replay de código OAuth | Reuso de `code` | Códigos de uso único, TTL 60 s, revogados até em tentativa falha |

## Autenticação e autorização

- **OAuth 2.1**: authorization code + PKCE S256 (obrigatório), DCR restrito por
  allowlist exata de redirect URIs, consentimento com escopos em pt-BR.
- **Scopes por operação** (`anki:read|write|review|admin`), enforcement no
  handler de cada tool (ADR-0003); mapa completo em `05-tools-mcp.md`.
- **Tokens**: HS256/`node:crypto`, TTL 1 h, claims `sub/scope/iss/aud/iat/exp`;
  rotação de `TOKEN_SECRET` invalida tudo (runbook).
- **Dev token** (`MCP_DEV_TOKEN`) ignora OAuth por design — proibido em
  produção (warn em log; documentado no `.env.example`).

## Dados e privacidade (LGPD/GDPR)

| Categoria | Tratada? | Onde vive | Retenção no servidor |
|:---|:---|:---|:---|
| Conteúdo de cartões/notas | Sim (pass-through) | Anki do usuário ↔ resposta da tool | **Zero** (nunca persistido) |
| Identificador OAuth (`sub` = "owner") | Sim (metadados) | Claims do token / logs | Vida do log operacional |
| Endereço do AnkiConnect + apiKey | Sim (config de operador) | Env do servidor | Vida da instância |
| Credenciais do AnkiWeb | **Não** | — | — |

- Base legal: execução do serviço solicitado pelo próprio usuário (dono da
  instância); sem perfis de usuário finais, sem telemetria externa, sem
  compartilhamento com terceiros.
- Direitos do titular: não há conteúdo para exportar/excluir no servidor;
  exclusão de logs operacionais mediante solicitação ao operador.
- Fixtures/exemplos/screenshots: **somente** coleção sintética
  (`src/anki/mock/seed.ts`) — regra no CONTRIBUTING.

## Segredos e cadeia de suprimentos

- Segredos apenas via env/secret manager; `.env` no `.gitignore`;
  `.env.example` com placeholders.
- `gitleaks` no CI (working tree + histórico completo) com allowlist restrita a
  placeholders documentados.
- `npm ci` com lockfile; SBOM SPDX gerado no CI (syft); Dependabot recomendado
  (T-041).
- Imagem Docker non-root (`USER node`), multi-stage, sem toolchain no runtime.

## Superfície de rede (notas de operação)

- Em dev, bind em localhost é o default recomendado; para exposição pública
  use HTTPS (Fly/Proxy com TLS) — o servidor não termina TLS sozinho.
- `/health` não exige token (liveness); `/ready` também é público mas apenas
  devolve estado do AnkiConnect (sem dados).
- `/widgets/*` serve somente 5 arquivos em allowlist, com CSP restritiva.
- **Nunca** expor o AnkiConnect diretamente à Internet sem `apiKey` e rede
  privada/túnel (ADR-0001).

## Resposta a incidentes (resumo)

1. Suspeita de vazamento de token ⇒ rotação de `TOKEN_SECRET` (invalida todos)
   + revisão de logs; passos completos no runbook.
2. Vazamento de `ANKI_CONNECT_API_KEY` ⇒ rotacionar a chave no add-on.
3. Vulnerabilidade reportada ⇒ fluxo do `SECURITY.md` (contato privado).

## Verificação

- `tests/integration/auth.test.ts` — 401s, PKCE, single-use, scopes, DCR.
- `tests/unit/tokens.test.ts` — tamper/expiração/aud/iss.
- `tests/unit/logger.test.ts` — redação e truncamento.
- `tests/integration/health.test.ts` — Origin 403, 413, 405.
