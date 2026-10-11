# Dossiê OpenAI Apps SDK e Pacote de Submissão (`docs/09-submissao-openai.md`)

---

## 1. Dossiê de Fontes Oficiais da OpenAI (Apps SDK + MCP Remoto)

* **OpenAI Apps SDK Overview**: <https://developers.openai.com/apps-sdk>
* **Build your MCP Server**: <https://developers.openai.com/apps-sdk/build/mcp-server>
* **Custom UX & Widgets (`window.openai`)**: <https://developers.openai.com/apps-sdk/build/custom-ux>
* **Authentication (OAuth 2.1 + PKCE)**: <https://developers.openai.com/apps-sdk/build/auth>
* **App Submission Guidelines & Review**: <https://developers.openai.com/apps-sdk/app-submission-guidelines>
* **Submit your app (portal de plugins)**: <https://developers.openai.com/apps-sdk/deploy/submission>
* **Documentação de Plugins (visão oficial)**: <https://developers.openai.com/plugins>
* **Model Context Protocol Specification (2025-03-26 / 2025-06-18)**: <https://modelcontextprotocol.io/specification>

### 1.1 Requisitos Técnicos Verificados

1. **Transporte**: **Streamable HTTP** (`POST /mcp`, `GET /mcp`, `DELETE /mcp`) sobre HTTPS público com certificado TLS válido.
2. **Definição de Tools e Anotações Obrigatórias**:
   * Todas as tools devem possuir descrições claras e JSON Schema válido.
   * Anotações obrigatórias em cada tool:
     * `readOnlyHint` (`boolean`)
     * `destructiveHint` (`boolean`)
     * `idempotentHint` (`boolean`)
     * `openWorldHint` (`boolean`)
3. **Metadados `_meta` do Apps SDK**:
   * `_meta["openai/outputTemplate"]`: URI do recurso de widget (ex.: `"ui://widget/review-session.html"`).
   * `_meta["openai/toolInvocation/invoking"]`: string curta exibida enquanto a tool executa.
   * `_meta["openai/toolInvocation/invoked"]`: string curta exibida quando a tool conclui.
   * `_meta["openai/widgetAccessible"]`: `true` quando o widget pode chamar a tool via `window.openai.callTool`.
4. **Recursos de Widget (`registerResource`)**:
   * MIME type: `text/html+skybridge`.
   * Ponte JavaScript no iframe: `window.openai.toolInput`, `window.openai.toolOutput`, `window.openai.widgetState`, `window.openai.setWidgetState(state)`, `window.openai.callTool(name, args)`.
5. **Autenticação OAuth 2.1 + PKCE**:
   * `GET /.well-known/oauth-protected-resource` (RFC 9728)
   * `GET /.well-known/oauth-authorization-server` (RFC 8414)
   * `POST /oauth/register` (RFC 7591 Dynamic Client Registration)
   * `GET /oauth/authorize` + `POST /oauth/token` com PKCE `S256` obrigatório.
   * Redirect URIs oficiais do ChatGPT:
     * `https://chatgpt.com/connector_platform_oauth_redirect`
     * `https://platform.openai.com/apps-manage/oauth`
   * Quando não autenticado, `POST /mcp` deve retornar `401 Unauthorized` com header `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource"`.

### 1.2 Nomenclatura e Requisitos do Fluxo de Plugins (2026)

A documentação oficial estruturou a distribuição em dois níveis: o **app** (a capacidade MCP, com UI opcional via Apps SDK) e o **plugin** (o pacote que o usuário descobre, instala e que é submetido/publicado — *"apps are now submitted and published as plugins"*). Requisitos adicionais de submissão verificados em 2026-10:

* **Domínio público obrigatório**: MCP server hospedado em domínio público com TLS válido (sem endpoints locais ou de teste).
* **CSP explícita**: declarar exatamente os domínios externos acessados pelo app — obrigatório para aprovação de segurança.
* **Conta de demonstração**: apps autenticados devem fornecer login/senha de conta plena, sem cadastro novo nem 2FA inacessível (atendido pelo backend `memory` + `OAUTH_AUTHORIZE_PIN`).
* **Uma versão em revisão por vez**; nomes, assinaturas e descrições de tools ficam **travados após a publicação** — alterações exigem resubmissão.
* **Data residency UE**: projetos com residência de dados na UE não podem submeter; usar projeto com data residency global.
* Estratégia e consequências dessas regras: **ADR-0007**.

---

## 2. Como Testar no ChatGPT em *Developer Mode* (Critério C10)

1. No ChatGPT (Plus, Pro, Team ou Enterprise), habilite o **Developer Mode** em **Settings → Plugins** (ou direto em `chatgpt.com/plugins`; em algumas contas o rótulo ainda aparece como **Apps & Connectors** durante a transição).
2. Crie o app de desenvolvimento (botão **+**) informando os metadados:
   * **Name**: `Anki Flashcards`
   * **MCP Server URL**: `https://<SEU-SERVICO>.onrender.com/mcp`
   * **Authentication**: `OAuth` (descoberta automática via `/.well-known/oauth-protected-resource`).
   * Alternativa para uso pessoal sem servidor público: criar o app com **Secure MCP Tunnel** (opção de túnel na criação) apontando para a instância local.
3. Na tela de autorização OAuth (`/oauth/authorize`), informe o PIN configurado em `OAUTH_AUTHORIZE_PIN` e aprove os escopos (`anki:read`, `anki:write`, `anki:review`, `anki:delete`).
4. Execute os prompts de validação E2E das 13 tools:
   * *"Liste todos os meus baralhos do Anki."* → `list_decks` + widget `deck-browser.html`
   * *"Mostre os detalhes e configurações do baralho Medicina::Cardiologia."* → `get_deck`
   * *"Crie um baralho chamado Concursos::Direito Administrativo."* → `create_deck`
   * *"Adicione uma nota Basic no baralho Concursos::Direito Administrativo com frente 'Quais são os princípios do art. 37 da CF?' e verso 'LIMPE: Legalidade, Impessoalidade, Moralidade, Publicidade e Eficiência' e tag 'constitucional'."* → `create_note`
   * *"Pesquise meus cartões com a tag 'constitucional'."* → `search_cards`
   * *"Mostre todos os detalhes e histórico do cartão <cardId>."* → `get_card`
   * *"Atualize a nota <noteId> adicionando a tag 'prioridade-alta'."* → `update_note`
   * *"Quais cartões estão vencidos para revisão hoje?"* → `get_due_cards` + widget `review-session.html`
   * *"Marque o cartão <cardId> como Good (3)."* → `submit_review`
   * *"Mostre minhas estatísticas de estudo dos últimos 7 dias."* → `get_stats`
   * *"Renomeie o baralho Concursos::Direito Administrativo para Concursos::Direito Público."* → `update_deck`
   * *"Exclua a nota <noteId> (confirmo a exclusão)."* → `delete_note`
   * *"Exclua o baralho Concursos::Direito Público (confirmo a exclusão)."* → `delete_deck`

---

## 3. Pacote Completo de Submissão para Revisão da OpenAI (Critérios C11 e C12)

### 3.1 Metadados do App (Prontos para Colar no Dashboard da OpenAI)

* **App Name**: `Anki Flashcards Bridge`
* **Short Description (≤ 80 chars)**: `Create, search, organize, and review your Anki flashcards directly in ChatGPT.`
* **Full Description**:
  > Connect ChatGPT to your Anki flashcard collection via the Model Context Protocol (MCP). Browse decks and subdecks, search cards using full native Anki query syntax (`deck:`, `tag:`, `is:due`, `prop:ivl>=`), create and edit notes (`Basic`, `Cloze`, custom note types), run interactive spaced-repetition review sessions (`Again`, `Hard`, `Good`, `Easy`) with an embedded review widget, and inspect study statistics — all with zero server-side flashcard storage.
* **Category**: `Education & Reference` / `Productivity`
* **MCP Endpoint URL**: `https://chatgpt-anki-plugin.onrender.com/mcp`
* **Privacy Policy URL**: `https://chatgpt-anki-plugin.onrender.com/privacy`
* **Terms of Service URL**: `https://chatgpt-anki-plugin.onrender.com/terms`
* **Healthcheck URL**: `https://chatgpt-anki-plugin.onrender.com/health`
* **Support / Contact URL**: `https://github.com/Sudo-psc/chatgpt-anki-plugin/issues`
* **Icon Asset**: `public/icon.svg` (512×512 vetorial e PNG exportável)

### 3.2 Credenciais de Teste para o Revisor da OpenAI

Quando o servidor está com `ANKI_BACKEND=memory` (ou fallback sandbox habilitado para a conta de revisão da OpenAI), o revisor da OpenAI pode testar **todas as 13 tools** imediatamente sem precisar instalar o Anki Desktop localmente:

* **OAuth Authorization PIN (Reviewer Demo)**: configurado em `OAUTH_AUTHORIZE_PIN` no formulário de submissão da OpenAI.
* **Coleção de Demonstração Pré-carregada**: contém baralhos sintéticos (`Default`, `Medicina::Cardiologia`, `Idiomas::Inglês`), cartões devidos e histórico de revisão para exercitar `list_decks`, `get_deck`, `create_deck`, `update_deck`, `delete_deck`, `search_cards`, `get_card`, `create_note`, `update_note`, `delete_note`, `get_due_cards`, `submit_review` e `get_stats`.

### 3.3 Checklist de Conformidade da Submissão OpenAI

| Item Obrigatório da OpenAI | Status no Repositório | Evidência |
|:---------------------------|:----------------------|:----------|
| Servidor MCP remoto sobre HTTPS com TLS válido | Pronto (`render.yaml` + `Dockerfile`) | `GET /health` |
| OAuth 2.1 + PKCE (`S256`) + RFC 9728 / RFC 8414 / RFC 7591 | Implementado e testado | `src/mcp/auth/*`, `tests/integration/http-oauth-mcp.test.ts` |
| Anotações `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` nas 13 tools | Implementado e testado | `tests/contract/tools.contract.test.ts` |
| Widgets `text/html+skybridge` sem dependências externas e CSP restrita | Implementado e testado | `src/widgets/*`, `tests/e2e/widgets.spec.ts` |
| Política de Privacidade pública acessível via HTTPS | Implementada | `GET /privacy` + `docs/06-seguranca-e-privacidade.md` |
| Termos de Uso públicos acessíveis via HTTPS | Implementados | `GET /terms` + `docs/06-seguranca-e-privacidade.md` |
| Ícone do App e exemplos de prompts documentados | Implementados | `public/icon.svg` + Seção 2 acima |
| Verificação de organização e envio manual no painel OpenAI Platform | **Ação humana final do proprietário da conta** | Ver Seção 4 abaixo |

---

## 4. Registro Transparente de Dependência Externa (Critérios C11 e C12)

Para concluir o envio administrativo no painel da OpenAI (`https://platform.openai.com/apps-manage`), o titular da conta precisa:

1. Concluir a **Verificação de Organização (Organization Verification)** na conta OpenAI Platform (exige documento de identidade do titular no painel da OpenAI).
2. Conectar o repositório `https://github.com/Sudo-psc/chatgpt-anki-plugin` no painel do **Render** (`New → Blueprint`) para ativar a URL pública `https://<service>.onrender.com`.
3. Submeter o pacote da Seção 3 pelo portal de submissão de plugins (`https://platform.openai.com/apps-manage` → **Submit for review**) — o pacote submetido e publicado é um **plugin** (ver **ADR-0007**). Após aprovação, clicar em **Publish** para listagem no diretório. Atualizações posteriores exigem resubmissão (tools ficam travados após a publicação).
