# 02 — Requisitos Não Funcionais

Cada NFR tem método de verificação explícito. "CI" = executado no workflow
`.github/workflows/ci.yml`.

## NFR-01 — Latência de leitura

- **Meta:** tools de leitura (list/get/search/due/stats) com p95 < 2,5 s quando o AnkiConnect local responde normalmente (exclui tempo do modelo ChatGPT).
- **Verificação:** medição local no smoke/E2E (`http_request.ms` nos logs estruturados); plano de carga em `07-plano-de-testes.md` § carga. Timeout do cliente AnkiConnect: 10 s configurável (`ANKI_TIMEOUT_MS`).
- **Estado:** limite de 10 s garantido por config; p95 medido no smoke (típico < 50 ms local). Teste de carga formal: T-027.

## NFR-02 — Portabilidade / setup em minutos

- **Meta:** um terceiro sobe o servidor por Docker em < 15 minutos seguindo o README.
- **Verificação:** README § Quickstart (2 comandos no modo demo); teste de usabilidade documentado em `docs/evidencias/C13-setup-15min.md`. Servidor Docker multi-stage sem dependências de sistema além do Node alpine.

## NFR-03 — Segurança de autenticação e autorização

- **Meta:** OAuth 2.1 authorization code + PKCE (S256 obrigatório), DCR opcional, scopes por operação, tokens HMAC-SHA256 com `aud`/`iss`/`exp` validados; token inválido/expirado → **401**; scope insuficiente → erro `FORBIDDEN`; validação de `Origin` (DNS rebinding) → 403.
- **Verificação:** `tests/integration/auth.test.ts` (15 testes) + `tests/unit/oauth.test.ts` + `tests/unit/tokens.test.ts`. CI.

## NFR-04 — Privacidade (stateless)

- **Meta:** nenhum conteúdo de cartão/nota é persistido ou logado. Sem banco de dados; sem cache de payload. Logs estruturados sem conteúdo (apenas metadados) e com redação de chaves sensíveis e truncamento de strings (500 chars).
- **Verificação:** `tests/unit/logger.test.ts` (redação/truncamento); ausência de persistência por design (ADR-0004, revisão de código); política em `06-seguranca-e-privacidade.md`.

## NFR-05 — Confiabilidade e erros acionáveis

- **Meta:** toda falha retorna payload tipado `{code, message, hint}` com `code` no conjunto documentado; timeout configurável; `/health` independente do Anki e `/ready` refletindo o AnkiConnect; operações destrutivas exigem `confirm=true`.
- **Verificação:** `tests/contract` (taxonomia de erro), `tests/integration/health.test.ts` (`/ready` 200/503), cenário `ANKI_UNAVAILABLE` em integração. CI.

## NFR-06 — Observabilidade

- **Meta:** logs JSON estruturados por request (`method/path/status/ms`) e por tool call (`tool/subject/ms/ok/code`); interface `withSpan` pronta para OTel; sem dependência obrigatória de backend externo.
- **Verificação:** `src/infra/telemetry.ts` + logs nos testes; plano de exportador OTel no runbook (`08`).

## NFR-07 — Limites e abuso

- **Meta:** body máximo por requisição (default 1 MiB) com 413; rate limit por subject OAuth (default 120/min) com erro `RATE_LIMITED` + `retry`;
- **Verificação:** `tests/integration/health.test.ts` (413) e `mcp-tools.test.ts` (`RATE_LIMITED`); `tests/unit/ratelimit.test.ts`.

## NFR-08 — Compatibilidade de protocolo

- **Meta:** MCP 2025-06-18 Streamable HTTP em modo JSON (`enableJsonResponse`) e stateless; `Accept` exigindo `application/json` + `text/event-stream`; `Mcp-Protocol-Version` validada; GET `/mcp` → 405 (sem SSE); compatível com o connector do ChatGPT.
- **Verificação:** smoke + integração usam o handshake real (initialize/notifications/initialized); comportamento verificado no código do transporte (SDK oficial).

## NFR-09 — Qualidade de código e testes

- **Meta:** cobertura ≥ 80% em `src/tools` e `src/anki` (atual: 96,9%/94,0% linhas; 92,3% branches agregado), testes de contrato para as 15 tools, CI verde com lint+typecheck+build.
- **Verificação:** gate `coverage.thresholds` no `vitest.config.ts` (linhas/statements/funções 80, branches 75); badge do Actions.

## NFR-10 — Conformidade legal (LGPD/GDPR)

- **Meta:** sem dados pessoais persistidos; processamento *pass-through*; política de privacidade pública detalhando dados tratados (metadados de autenticação), finalidade e controles; nenhum dado de paciente/usuário em fixtures (coleção sintética).
- **Verificação:** `docs/legal/politica-de-privacidade.md`; revisão de fixtures (`src/anki/mock/seed.ts` sintético); declaração de não afiliação.

## NFR-11 — Acessibilidade dos widgets

- **Meta:** widgets com HTML semântico (headings, tabela com th, botões reais), contraste adequado (tema claro/escuro), navegação por teclado (Espaço mostra resposta; 1–4 respondem), `prefers-reduced-motion` respeitado.
- **Verificação:** `tests/e2e/widget.spec.ts` (teclado) + CSP restritiva; checklist manual básico WCAG AA.

## NFR-12 — Documentação e operabilidade

- **Meta:** documentação completa (visão, requisitos, arquitetura, 8 ADRs, contratos, segurança, testes, runbook, submissão); runbook cobre rotação de segredos, rollback, vazamento de token e indisponibilidade do Anki; CHANGELOG e guia de contribuição.
- **Verificação:** estrutura `docs/` (esta pasta) e revisão cruzada `C13/C14`.
