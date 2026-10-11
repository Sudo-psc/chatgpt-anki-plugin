# Contratos das 13 Tools MCP (`docs/05-tools-mcp.md`)

Este documento especifica o contrato público exato exposto pelo servidor MCP ao ChatGPT e demais clientes MCP. Todas as 13 tools utilizam validação de entrada com **Zod** (convertida automaticamente para JSON Schema pelo `@modelcontextprotocol/sdk`), retornam `structuredContent` tipado, resumo textual em `content[0].text` e metadados `_meta` do OpenAI Apps SDK.

---

## Convenções Globais

### Anotações MCP (`annotations`)

Cada tool declara explicitamente suas dicas comportamentais exigidas pela revisão da OpenAI:

* `readOnlyHint`: `true` para tools que não modificam a coleção; `false` para tools de escrita/revisão/exclusão.
* `destructiveHint`: `true` apenas para `delete_deck` e `delete_note`; `false` nas demais.
* `idempotentHint`: `true` quando chamadas repetidas com os mesmos argumentos produzem o mesmo estado.
* `openWorldHint`: `false` (todas as tools operam exclusivamente sobre a coleção fechada do usuário no Anki).

### Envelope Padrão de Erro Tipado

Quando uma tool falha, ela retorna `isError: true` com o seguinte `structuredContent`:

```json
{
  "error": {
    "code": "DECK_NOT_FOUND",
    "message": "Deck 'Biologia::Genética' was not found in the Anki collection.",
    "hint": "Call list_decks first to inspect available deck names.",
    "retryable": false
  }
}
```

Códigos de erro padronizados:
* `ANKI_UNREACHABLE` (`retryable: true`) — Anki Desktop fechado ou `anki-bridge` desconectado.
* `ANKI_TIMEOUT` (`retryable: true`) — AnkiConnect excedeu o tempo limite.
* `ANKI_API_ERROR` (`retryable: false`) — Erro retornado pelo próprio AnkiConnect.
* `READ_ONLY_MODE` (`retryable: false`) — Variável `ANKI_READ_ONLY=1` ativa.
* `INSUFFICIENT_SCOPE` (`retryable: false`) — Token OAuth sem o escopo necessário.
* `CONFIRMATION_REQUIRED` (`retryable: false`) — Falta `confirm: true` em operação destrutiva.
* `PROTECTED_DECK` (`retryable: false`) — Tentativa de excluir o baralho `Default` sem permissão explícita.
* `DECK_NOT_FOUND` | `CARD_NOT_FOUND` | `NOTE_NOT_FOUND` | `MODEL_NOT_FOUND` (`retryable: false`).
* `DUPLICATE_NOTE` (`retryable: false`) — Nota duplicada quando `allowDuplicate=false`.
* `INVALID_SEARCH_QUERY` | `INVALID_ARGUMENTS` (`retryable: false`).

---

## 1. `list_decks`

* **Título**: List Anki Decks
* **Escopo OAuth**: `anki:read`
* **Anotações**: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Widget (`_meta["openai/outputTemplate"]`)**: `ui://widget/deck-browser.html`
* **Parâmetros de Entrada (`inputSchema`)**:
  * `query` (`string`, opcional): Filtro case-insensitive pelo nome do baralho.
  * `includeStats` (`boolean`, opcional, padrão `true`): Inclui contagens `newCount`, `learnCount`, `dueCount` e `totalCards`.
* **Saída (`structuredContent`)**:
  ```json
  {
    "totalDecks": 3,
    "decks": [
      {
        "id": 1,
        "name": "Default",
        "parentName": null,
        "depth": 0,
        "newCount": 5,
        "learnCount": 2,
        "dueCount": 8,
        "totalCards": 42
      }
    ]
  }
  ```

---

## 2. `get_deck`

* **Título**: Get Anki Deck Details
* **Escopo OAuth**: `anki:read`
* **Anotações**: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Widget**: `ui://widget/deck-browser.html`
* **Parâmetros de Entrada**:
  * `deckName` (`string`, obrigatório, min 1): Nome exato do baralho (ex.: `"Medicina::Cardiologia"`).
  * `sampleLimit` (`number` int, opcional, `0..50`, padrão `10`): Quantidade de cartões de amostra retornados.
* **Saída (`structuredContent`)**:
  * `deck`: `{ id, name, parentName, depth, newCount, learnCount, dueCount, totalCards }`
  * `subdecks`: `string[]`
  * `config`: Objeto de configuração do baralho (`new.perDay`, `rev.perDay`, etc.)
  * `sampleCards`: `CardSummary[]`
* **Erros**: `DECK_NOT_FOUND`, `ANKI_UNREACHABLE`.

---

## 3. `create_deck`

* **Título**: Create Anki Deck
* **Escopo OAuth**: `anki:write`
* **Anotações**: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Parâmetros de Entrada**:
  * `deckName` (`string`, obrigatório, 1..200 chars): Nome do baralho ou sub-baralho (`Pai::Filho`).
* **Saída (`structuredContent`)**:
  * `{ deckId: number, deckName: string, created: boolean }`
* **Erros**: `INVALID_ARGUMENTS`, `READ_ONLY_MODE`, `INSUFFICIENT_SCOPE`, `ANKI_UNREACHABLE`.

---

## 4. `update_deck`

* **Título**: Update Anki Deck / Move Cards
* **Escopo OAuth**: `anki:write`
* **Anotações**: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }`
* **Parâmetros de Entrada**:
  * `deckName` (`string`, obrigatório): Baralho alvo (ou baralho de origem quando `newName` é informado).
  * `newName` (`string`, opcional): Novo nome do baralho (migra todos os cartões do baralho `deckName` para `newName`).
  * `cardIds` (`number[]`, opcional): Lista de IDs de cartões a mover para o baralho.
  * `removeOldDeck` (`boolean`, opcional, padrão `true`): Quando `newName` é informado, remove o baralho antigo após mover seus cartões.
* **Saída (`structuredContent`)**:
  * `{ deckName: string, targetDeckName: string, movedCardsCount: number, deckId: number, removedOldDeck: boolean }`
* **Erros**: `DECK_NOT_FOUND`, `INVALID_ARGUMENTS`, `READ_ONLY_MODE`.

---

## 5. `delete_deck`

* **Título**: Delete Anki Deck
* **Escopo OAuth**: `anki:delete`
* **Anotações**: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }`
* **Parâmetros de Entrada**:
  * `deckName` (`string`, obrigatório): Nome do baralho a excluir.
  * `confirm` (`boolean`, obrigatório): Deve ser `true` para autorizar a exclusão definitiva do baralho e de seus cartões.
  * `allowDefault` (`boolean`, opcional, padrão `false`): Permite excluir o baralho `Default` somente se explicitamente `true`.
* **Saída (`structuredContent`)**:
  * `{ deleted: true, deckName: string }`
* **Erros**: `CONFIRMATION_REQUIRED`, `PROTECTED_DECK`, `DECK_NOT_FOUND`, `READ_ONLY_MODE`.

---

## 6. `search_cards`

* **Título**: Search Anki Cards
* **Escopo OAuth**: `anki:read`
* **Anotações**: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Widget**: `ui://widget/deck-browser.html`
* **Parâmetros de Entrada**:
  * `query` (`string`, obrigatório, min 1): Query nativa do Anki (ex.: `"deck:Default tag:anatomia is:due"`).
  * `limit` (`number` int, opcional, `1..100`, padrão `25`): Máximo de cartões retornados.
  * `offset` (`number` int, opcional, `>= 0`, padrão `0`): Deslocamento para paginação.
* **Saída (`structuredContent`)**:
  * `{ query, total, offset, limit, hasMore, cards: CardSummary[] }`
* **Erros**: `INVALID_SEARCH_QUERY`, `ANKI_UNREACHABLE`.

---

## 7. `get_card`

* **Título**: Get Anki Card Details
* **Escopo OAuth**: `anki:read`
* **Anotações**: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Parâmetros de Entrada**:
  * `cardId` (`number` int positivo, obrigatório): ID do cartão no Anki.
  * `includeReviews` (`boolean`, opcional, padrão `true`): Inclui o histórico de revisões do cartão.
* **Saída (`structuredContent`)**:
  * `card`: `{ cardId, noteId, deckName, modelName, question, answer, fields, tags, type, queue, interval, factor, reps, lapses, due }`
  * `reviews`: `ReviewLogEntry[]`
* **Erros**: `CARD_NOT_FOUND`, `ANKI_UNREACHABLE`.

---

## 8. `create_note`

* **Título**: Create Anki Note
* **Escopo OAuth**: `anki:write`
* **Anotações**: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }`
* **Parâmetros de Entrada**:
  * `deckName` (`string`, obrigatório): Baralho onde a nota será criada.
  * `modelName` (`string`, opcional, padrão `"Basic"`): Modelo da nota (`"Basic"`, `"Cloze"`, etc.).
  * `fields` (`Record<string, string>`, obrigatório): Mapa de campos da nota (ex.: `{ Front: "Pergunta", Back: "Resposta" }`).
  * `tags` (`string[]`, opcional, padrão `[]`): Lista de tags.
  * `allowDuplicate` (`boolean`, opcional, padrão `false`): Permite duplicatas no primeiro campo.
  * `duplicateScope` (`"deck" | "collection"`, opcional, padrão `"deck"`): Escopo de verificação de duplicidade.
  * `createDeckIfMissing` (`boolean`, opcional, padrão `true`): Cria o baralho caso ainda não exista.
* **Saída (`structuredContent`)**:
  * `{ noteId: number, deckName: string, modelName: string, fields: Record<string, string>, tags: string[] }`
* **Erros**: `DUPLICATE_NOTE`, `MODEL_NOT_FOUND`, `INVALID_ARGUMENTS`, `READ_ONLY_MODE`.

---

## 9. `update_note`

* **Título**: Update Anki Note
* **Escopo OAuth**: `anki:write`
* **Anotações**: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Parâmetros de Entrada**:
  * `noteId` (`number` int positivo, obrigatório): ID da nota a ser atualizada.
  * `fields` (`Record<string, string>`, opcional): Campos a sobrescrever na nota.
  * `tags` (`string[]`, opcional): Substitui integralmente a lista de tags da nota.
  * `addTags` (`string[]`, opcional): Tags a adicionar à nota.
  * `removeTags` (`string[]`, opcional): Tags a remover da nota.
* **Saída (`structuredContent`)**:
  * `{ note: { noteId, modelName, fields, tags, cards } }`
* **Erros**: `NOTE_NOT_FOUND`, `INVALID_ARGUMENTS`, `READ_ONLY_MODE`.

---

## 10. `delete_note`

* **Título**: Delete Anki Notes
* **Escopo OAuth**: `anki:delete`
* **Anotações**: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }`
* **Parâmetros de Entrada**:
  * `noteIds` (`number[]`, obrigatório, min 1): Lista de IDs de notas a excluir.
  * `confirm` (`boolean`, obrigatório): Deve ser `true` para autorizar a exclusão permanente das notas e de seus cartões.
* **Saída (`structuredContent`)**:
  * `{ deleted: true, deletedNoteIds: number[], count: number }`
* **Erros**: `CONFIRMATION_REQUIRED`, `NOTE_NOT_FOUND`, `READ_ONLY_MODE`.

---

## 11. `get_due_cards`

* **Título**: Get Due Cards for Review
* **Escopo OAuth**: `anki:read`
* **Anotações**: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Widget (`_meta["openai/outputTemplate"]`)**: `ui://widget/review-session.html`
* **Parâmetros de Entrada**:
  * `deckName` (`string`, opcional): Filtra cartões devidos de um baralho específico.
  * `tag` (`string`, opcional): Filtra cartões devidos com determinada tag.
  * `includeNew` (`boolean`, opcional, padrão `true`): Inclui também cartões novos (`is:new`) caso haja vagas na sessão.
  * `limit` (`number` int, opcional, `1..100`, padrão `15`): Quantidade máxima de cartões na fila de estudo.
* **Saída (`structuredContent`)**:
  * `{ deckName, totalDue, returnedCount, cards: DueCardItem[], ratingOptions: [{ ease: 1, label: "Again" }, { ease: 2, label: "Hard" }, { ease: 3, label: "Good" }, { ease: 4, label: "Easy" }] }`

---

## 12. `submit_review`

* **Título**: Submit Card Review Rating
* **Escopo OAuth**: `anki:review`
* **Anotações**: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }`
* **Widget (`_meta["openai/outputTemplate"]`)**: `ui://widget/review-session.html`
* **Parâmetros de Entrada**:
  * `cardId` (`number` int positivo, obrigatório): ID do cartão avaliado.
  * `rating` (`1 | 2 | 3 | 4 | "again" | "hard" | "good" | "easy"`, obrigatório): Avaliação de desempenho do usuário.
* **Saída (`structuredContent`)**:
  * `{ cardId: number, ease: 1 | 2 | 3 | 4, ratingLabel: "Again" | "Hard" | "Good" | "Easy", success: boolean, updatedCard: CardSummary }`
* **Erros**: `CARD_NOT_FOUND`, `INVALID_ARGUMENTS`, `READ_ONLY_MODE`.

---

## 13. `get_stats`

* **Título**: Get Anki Collection & Study Statistics
* **Escopo OAuth**: `anki:read`
* **Anotações**: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
* **Widget**: `ui://widget/deck-browser.html`
* **Parâmetros de Entrada**:
  * `deckName` (`string`, opcional): Restringe a distribuição de estados e contagens a um baralho específico.
  * `days` (`number` int, opcional, `1..365`, padrão `7`): Quantidade de dias recentes no histórico `reviewsByDay`.
* **Saída (`structuredContent`)**:
  * `{ deckName: string | null, reviewedToday: number, reviewsByDay: { date: string, count: number }[], totals: { new: number, learning: number, review: number, due: number, suspended: number, total: number }, decks: DeckSummary[] }`
