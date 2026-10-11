# Requisitos Funcionais (`RF-001` a `RF-015`)

Todos os requisitos abaixo possuem critérios de aceite objetivos e verificáveis por testes automatizados em `tests/unit`, `tests/integration`, `tests/contract` e `tests/e2e`.

---

## RF-001 — Listar Baralhos e Hierarquia (`list_decks`)

* **Descrição**: O sistema deve listar todos os baralhos da coleção Anki do usuário, preservando a hierarquia de sub-baralhos separada por `::` (ex.: `Medicina::Cardiologia::Arritmias`) e informando a contagem de cartões novos (`newCount`), em aprendizagem (`learnCount`), para revisão (`reviewCount` / `dueCount`) e total (`totalCards`).
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `list_decks`.
* **Critérios de Aceite**:
  1. Dado que existem os baralhos `Default`, `Idiomas` e `Idiomas::Inglês`, quando `list_decks` é invocado sem filtro, retorna os 3 baralhos com `id`, `name`, `parentName`, `depth` e contagens numéricas não-negativas.
  2. Quando o parâmetro opcional `query` é informado (ex.: `"Idiomas"`), apenas baralhos cujo nome contém a substring (case-insensitive) são retornados.
  3. O resultado inclui `structuredContent.decks` e `_meta["openai/outputTemplate"] = "ui://widget/deck-browser.html"`.

---

## RF-002 — Consultar Detalhes de um Baralho (`get_deck`)

* **Descrição**: O sistema deve retornar as informações detalhadas de um baralho específico (por nome), incluindo estatísticas de fila, lista de sub-baralhos diretos, informações de configuração (`getDeckConfig`) e uma amostra opcional de cartões pertencentes ao baralho.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `get_deck`.
* **Critérios de Aceite**:
  1. Dado um baralho existente, `get_deck({ deckName: "Idiomas::Inglês" })` retorna `id`, `name`, contagens de cartões, `subdecks`, `config` e `sampleCards` (respeitando `sampleLimit`, padrão 10, máx. 50).
  2. Se o baralho não existir na coleção, a tool retorna erro tipado `DECK_NOT_FOUND` (`isError: true`) com mensagem orientando o uso de `list_decks`.

---

## RF-003 — Criar Baralho e Sub-baralho (`create_deck`)

* **Descrição**: O sistema deve permitir criar novos baralhos de topo ou sub-baralhos na notação `Pai::Filho`.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `create_deck`.
* **Critérios de Aceite**:
  1. `create_deck({ deckName: "Concursos::Direito Constitucional" })` retorna o `deckId` numérico retornado pelo AnkiConnect e `created: true`.
  2. A operação é idempotente: chamar `create_deck` para um baralho já existente retorna o `deckId` existente sem duplicar nem corromper cartões.
  3. Nomes vazios, apenas espaços ou contendo `::::` consecutivos são rejeitados pela validação Zod antes de chamar o backend.
  4. Se `ANKI_READ_ONLY=1`, a chamada é bloqueada com erro `READ_ONLY_MODE`.

---

## RF-004 — Atualizar Baralho e Mover Cartões (`update_deck`)

* **Descrição**: O sistema deve permitir mover um conjunto de cartões para um baralho de destino (`changeDeck`) e/ou renomear logicamente um baralho migrando seus cartões para o novo nome (`newName`), documentando explicitamente que o AnkiConnect não possui ação atômica nativa de renomeação sem movimentação.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `update_deck`.
* **Critérios de Aceite**:
  1. Ao informar `deckName` e `cardIds: [101, 102]`, os cartões especificados passam a pertencer a `deckName` via `changeDeck`.
  2. Ao informar `deckName` e `newName`, o sistema cria `newName`, move todos os cartões de `deckName` para `newName` e (se `removeOldDeck: true`) remove o baralho antigo vazio, retornando a contagem de cartões migrados.
  3. Se nem `cardIds` nem `newName` forem informados, retorna erro de validação acionável (`INVALID_ARGUMENTS`).

---

## RF-005 — Excluir Baralho com Confirmação Explícita (`delete_deck`)

* **Descrição**: O sistema deve permitir excluir um baralho e seus cartões (`deleteDecks` com `cardsToo: true`), exigindo confirmação explícita na chamada para prevenir perda acidental de dados.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `delete_deck`.
* **Critérios de Aceite**:
  1. Se `confirm` não for `true`, a operação falha imediatamente com `CONFIRMATION_REQUIRED` sem invocar o AnkiConnect.
  2. A tentativa de excluir o baralho padrão `"Default"` sem `allowDefault: true` é rejeitada com `PROTECTED_DECK`.
  3. Para um baralho existente com `confirm: true`, o baralho deixa de aparecer em `list_decks` e a tool retorna `{ deleted: true, deckName }`.

---

## RF-006 — Pesquisar Cartões com Sintaxe Nativa do Anki (`search_cards`)

* **Descrição**: O sistema deve pesquisar cartões usando qualquer query válida da sintaxe de busca do Anki (`deck:`, `tag:`, `is:due`, `is:new`, `is:suspended`, `prop:ivl>=`, `rated:`, buscas por campo `Front:*termo*`) e retornar cartões enriquecidos com frente/verso resumidos, tags, baralho, estado e intervalo.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `search_cards`.
* **Critérios de Aceite**:
  1. `search_cards({ query: "deck:Default is:due", limit: 20, offset: 0 })` executa `findCards` + `cardsInfo` e retorna `{ total, offset, limit, hasMore, cards }`.
  2. Cada item em `cards` contém `cardId`, `noteId`, `deckName`, `modelName`, `fields`, `tags`, `queue`, `type`, `interval`, `factor`, `reps`, `lapses` e `due`.
  3. Suporta paginação (`limit` de 1 a 100, padrão 25; `offset >= 0`) para respeitar os limites de payload do ChatGPT.

---

## RF-007 — Consultar Cartão Individual e Histórico (`get_card`)

* **Descrição**: O sistema deve retornar todos os atributos de um cartão específico (`cardId`), os campos completos e tags de sua nota associada (`noteId`), e opcionalmente o histórico de revisões (`getReviewsOfCards`).
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `get_card`.
* **Critérios de Aceite**:
  1. `get_card({ cardId })` retorna os campos completos sem truncamento, tags da nota, métricas de agendamento e lista de revisões anteriores.
  2. Caso `cardId` não exista, retorna erro `CARD_NOT_FOUND` com `isError: true`.

---

## RF-008 — Criar Nota e Cartões (`create_note`)

* **Descrição**: O sistema deve criar uma nova nota em um baralho e modelo especificados (`Basic`, `Cloze`, ou qualquer modelo existente na coleção), preenchendo seus campos e tags e controlando duplicatas.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `create_note`.
* **Critérios de Aceite**:
  1. `create_note({ deckName, modelName: "Basic", fields: { Front: "...", Back: "..." }, tags: ["anatomia"] })` cria a nota e retorna `{ noteId, deckName, modelName, tags }`.
  2. Quando `allowDuplicate: false` (padrão) e já existe nota com o mesmo primeiro campo no escopo configurado, retorna erro tipado `DUPLICATE_NOTE`.
  3. Se o baralho ainda não existir e `createDeckIfMissing: true` (padrão), o baralho é garantido antes da inserção.

---

## RF-009 — Atualizar Campos e Tags de uma Nota (`update_note`)

* **Descrição**: O sistema deve atualizar os campos (`fields`) e/ou as tags (`tags`, `addTags`, `removeTags`) de uma nota existente identificada por `noteId`.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `update_note`.
* **Critérios de Aceite**:
  1. `update_note({ noteId, fields: { Back: "Novo verso" }, addTags: ["revisado"], removeTags: ["rascunho"] })` atualiza a nota e retorna o estado atualizado via `notesInfo`.
  2. Se `noteId` não existir, retorna `NOTE_NOT_FOUND`.
  3. Se nenhuma alteração (`fields`, `tags`, `addTags`, `removeTags`) for fornecida, retorna `INVALID_ARGUMENTS`.

---

## RF-010 — Excluir Notas com Confirmação (`delete_note`)

* **Descrição**: O sistema deve excluir uma ou mais notas (e todos os cartões gerados por elas) via `deleteNotes`, exigindo `confirm: true`.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `delete_note`.
* **Critérios de Aceite**:
  1. Sem `confirm: true`, falha com `CONFIRMATION_REQUIRED`.
  2. Com `confirm: true` e `noteIds: [123]`, verifica a existência, remove as notas no Anki e retorna `{ deletedNoteIds, count }`.

---

## RF-011 — Obter Fila de Cartões Devidos para Revisão (`get_due_cards`)

* **Descrição**: O sistema deve listar os cartões pendentes de revisão imediata (`is:due`) globalmente ou filtrados por baralho/tag, prontos para estudo no chat ou no widget de revisão do Apps SDK.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `get_due_cards`.
* **Critérios de Aceite**:
  1. `get_due_cards({ deckName: "Default", limit: 10, includeNew: true })` retorna os cartões devidos (e novos, se `includeNew: true`), com `question`, `answer`, `fields`, `tags`, `interval` e opções de resposta `1..4`.
  2. A tool anexa `_meta["openai/outputTemplate"] = "ui://widget/review-session.html"` para renderização do widget de revisão no ChatGPT.

---

## RF-012 — Registrar Avaliação de Revisão (`submit_review`)

* **Descrição**: O sistema deve registrar a avaliação do usuário para um cartão (`cardId`) usando a escala oficial do Anki/FSRS/SM-2: `1` (`Again` / Errei), `2` (`Hard` / Difícil), `3` (`Good` / Bom), `4` (`Easy` / Fácil).
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `submit_review`.
* **Critérios de Aceite**:
  1. Aceita `rating` numérico (`1 | 2 | 3 | 4`) ou textual (`"again" | "hard" | "good" | "easy"`, case-insensitive) e converte para `ease` `1..4` na chamada `answerCards`.
  2. Retorna `{ cardId, ease, ratingLabel, success: true, updatedCard }` com o novo intervalo do cartão após a resposta.
  3. Valores fora de `1..4` são rejeitados pela validação de schema.

---

## RF-013 — Obter Estatísticas da Coleção e Desempenho (`get_stats`)

* **Descrição**: O sistema deve retornar métricas consolidadas de estudo: cartões revisados hoje (`getNumCardsReviewedToday`), histórico recente por dia (`getNumCardsReviewedByDay`), distribuição de cartões (`is:new`, `is:learn`, `is:review`, `is:suspended`, `is:due`) e estatísticas por baralho.
* **Prioridade**: Alta (Must Have).
* **Tool MCP associada**: `get_stats`.
* **Critérios de Aceite**:
  1. `get_stats({ deckName?: string, days?: number })` retorna `reviewedToday`, `reviewsByDay` (últimos `days` dias, padrão 7), `totals` (`new`, `learning`, `review`, `due`, `suspended`, `total`) e `decks`.

---

## RF-014 — Autenticação OAuth 2.1 com PKCE e Escopos por Operação

* **Descrição**: O servidor MCP deve autenticar clientes via OAuth 2.1 com PKCE (`S256`), suportar descoberta automática (`/.well-known/oauth-protected-resource` e `/.well-known/oauth-authorization-server`), registro dinâmico de clientes (`/oauth/register`) e aplicar escopos granulares (`anki:read`, `anki:write`, `anki:delete`, `anki:review`).
* **Prioridade**: Alta (Must Have).
* **Critérios de Aceite**:
  1. Requisição a `POST /mcp` sem header `Authorization: Bearer <token>` (quando `MCP_ALLOW_UNAUTHENTICATED=0`) retorna `401 Unauthorized` com header `WWW-Authenticate` apontando para `resource_metadata`.
  2. Token válido apenas com escopo `anki:read` consegue executar `list_decks`, mas recebe erro de permissão insuficiente ao invocar `create_note` ou `delete_deck`.
  3. Fluxo completo `/oauth/register` → `/oauth/authorize` (PKCE `S256`) → `/oauth/token` emite JWT válido aceito em `/mcp`.

---

## RF-015 — Widgets Interativos do OpenAI Apps SDK (`text/html+skybridge`)

* **Descrição**: O servidor MCP deve registrar recursos de UI compatíveis com o OpenAI Apps SDK (`ui://widget/deck-browser.html` e `ui://widget/review-session.html`) que hidratam dados a partir de `window.openai.toolOutput` e disparam ações de volta ao ChatGPT via `window.openai.callTool`.
* **Prioridade**: Média (Should Have — requerido para C10 e M4).
* **Critérios de Aceite**:
  1. `resources/list` expõe os dois widgets com `mimeType: "text/html+skybridge"`.
  2. Em navegador headless (Playwright), o widget `review-session.html` renderiza a frente do cartão recebido em `window.openai.toolOutput`, revela o verso ao clicar em "Mostrar resposta" e invoca `window.openai.callTool("submit_review", { cardId, rating })` ao clicar em um dos 4 botões de avaliação.
