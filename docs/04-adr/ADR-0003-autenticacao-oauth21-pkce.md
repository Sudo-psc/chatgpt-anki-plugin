# ADR-0003 — Autenticação OAuth 2.1 com PKCE (`S256`) e Escopos por Operação

* **Status**: Aceito
* **Data**: 2026-10-10
* **Decisores**: Segurança, Arquiteto

## Contexto

O OpenAI Apps SDK exige que servidores MCP remotos autenticados implementem **OAuth 2.1 com PKCE**, exponham metadados de recurso protegido (RFC 9728) e metadados do servidor de autorização (RFC 8414), suportem Dynamic Client Registration (RFC 7591) e apliquem controle de acesso por escopo.

## Decisão

Implementar um servidor OAuth 2.1 integrado e autocontido em `src/mcp/auth/`:

1. **Descoberta**:
   * `GET /.well-known/oauth-protected-resource` (RFC 9728)
   * `GET /.well-known/oauth-authorization-server` (RFC 8414)
2. **Dynamic Client Registration**:
   * `POST /oauth/register` (RFC 7591), aceitando os `redirect_uris` do ChatGPT (`https://chatgpt.com/connector_platform_oauth_redirect`, `https://platform.openai.com/apps-manage/oauth`, e loopback para testes).
3. **Authorization Code + PKCE (`S256` obrigatório)**:
   * `GET /oauth/authorize` renderiza tela de consentimento clara com seleção de escopos e solicitação do PIN do proprietário (`OAUTH_AUTHORIZE_PIN`).
   * `POST /oauth/token` valida o `code_verifier` contra o `code_challenge` (`SHA-256` base64url) e emite um Access Token JWT (`HS256` via biblioteca `jose`) com TTL curto (padrão 3600s) e `refresh_token`.
4. **Escopos Granulares**:
   * `anki:read` — leitura de baralhos, cartões, notas e estatísticas;
   * `anki:write` — criação e edição de baralhos e notas;
   * `anki:review` — envio de avaliações de revisão (`submit_review`);
   * `anki:delete` — exclusão de baralhos e notas (`delete_deck`, `delete_note`).

## Consequências

* Nenhuma dependência obrigatória de IdP externo pago (Auth0/Cognito) para quem auto-hospeda o servidor.
* Tokens inválidos ou ausentes retornam `401 Unauthorized` com cabeçalho `WWW-Authenticate: Bearer resource_metadata="..."`.
* Tokens sem o escopo exigido pela tool retornam erro estruturado `INSUFFICIENT_SCOPE`.
