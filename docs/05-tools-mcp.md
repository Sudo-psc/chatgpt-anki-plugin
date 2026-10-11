# 05 — Contratos das Tools MCP

Fonte de verdade executável: `src/tools/*.ts` (Zod). Este documento é o
contrato **público** (entradas, saídas, erros, scopes e mapeamento
AnkiConnect). Testes de contrato: `tests/contract/tools.contract.test.ts`
(valida o output real de cada tool contra o schema declarado).

## Convenções

- **Entradas/saídas em snake_case**; HTML é removido de `question`/`answer`
  (texto puro). Datas: `due` é dia (cartões de revisão) ou epoch (learning) —
  repassado cru do Anki com semântica documentada.
- **Scopes**: `anki:read` ⊂ padrão; `anki:write` ⊂ padrão; `anki:review` ⊂ padrão;
  `anki:admin` **não** é concedido por default (consentimento explícito).
- **Erros** (quando `isError=true`): `content[0].text` é um JSON
  `{code, message, hint}`; `code ∈` `VALIDATION_ERROR | NOT_FOUND | CONFLICT |
  FORBIDDEN | RATE_LIMITED | ANKI_UNAVAILABLE | ANKI_ERROR | INTERNAL`.
  Erros de *forma* de entrada (tipo errado) são retornados pelo framework MCP
  (`isError=true`, mensagem nomeia a tool e o campo).
- **Sucesso**: `structuredContent` (JSON) + `content[0].text` idêntico.
- **Anotações** alimentam a UX de confirmação do ChatGPT (`readOnlyHint`,
  `destructiveHint`).

## Tabela-resumo

| Tool | Scope | Anotações | AnkiConnect |
|:---|:---|:---|:---|
| `list_decks` | anki:read | readOnly | `deckNamesAndIds` |
| `get_deck` | anki:read | readOnly | `deckNamesAndIds` + `getDeckStats` |
| `create_deck` | anki:write | idempotent | `createDeck` |
| `update_deck` | anki:write | — | `createDeck`+`findCards`+`changeDeck`+`deleteDecks` (composto) |
| `delete_deck` | anki:write | destructive | `deleteDecks` (`cardsToo:true`) |
| `search_cards` | anki:read | readOnly | `findCards` + `cardsInfo` + `notesInfo` |
| `get_card` | anki:read | readOnly | `findCards` + `cardsInfo` + `notesInfo` |
| `create_note` | anki:write | — | `addNote` |
| `update_note` | anki:write | idempotent | `updateNoteFields`/`updateNoteTags`/`updateNoteModel` |
| `delete_note` | anki:write | destructive | `findNotes` + `deleteNotes` |
| `get_due_cards` | anki:review | readOnly | `findCards is:due` + `cardsInfo` |
| `submit_review` | anki:review | — | `findCards` + `answerCards` |
| `get_stats` | anki:read | readOnly | `getNumCardsReviewedToday` + `findCards` + `getDeckStats` |
| `manage_tags` | anki:write | destructive | `getTags`/`addTags`/`removeTags`/`replaceTags`/`clearUnusedTags` |
| `update_model_templates` | anki:admin | destructive, idempotent | `modelTemplates`/`updateModelTemplates`/`updateModelStyling` |

As **13 mandatadas** são todas as acima exceto `manage_tags` e
`update_model_templates` (extensões v0.1 para cobrir tags/templates do escopo).

---

## list_decks

- **Entrada:** `{}` · **Saída:** `{decks: [{id, name, parent|null}]}`
- **Erros:** `ANKI_UNAVAILABLE`, `ANKI_ERROR`.

## get_deck

- **Entrada:** `{name: string≥1}` — nome exato.
- **Saída:** `{id, name, parent|null, subdecks: string[], stats: {new_count, learn_count, review_count, total_in_deck} | null}`
- **Erros:** `NOT_FOUND` (com hint para `list_decks`), `ANKI_UNAVAILABLE`.

## create_deck

- **Entrada:** `{name}` — `"Pai::Filho"` cria o pai implicitamente.
- **Saída:** `{deck: {id, name, parent|null}}`
- **Idempotência:** nome existente ⇒ retorna o deck existente (mesmo id).
- **Erros:** `ANKI_ERROR`, `ANKI_UNAVAILABLE`.

## update_deck

- **Entrada:** `{name, new_name}`
- **Saída:** `{updated: true, from, to}`
- **Semântica:** renomeação **composta** (AnkiConnect API v6 não tem
  `renameDeck`): cria o destino, move os cartões via `changeDeck`, exclui o
  deck antigo (vazio).
- **Limitações explícitas:** falha com `CONFLICT` se o destino existe ou se o
  deck tem subdecks (seria órfão de filhos). Renomeie/mova subdecks antes.
- **Erros:** `NOT_FOUND`, `CONFLICT`, `ANKI_*`.

## delete_deck

- **Entrada:** `{name, confirm: boolean}` — **`confirm` deve ser `true`**.
- **Saída:** `{deleted: true, name}`
- **Destrutivo:** exclui o deck e todos os seus cartões (`cardsToo:true`).
- **Erros:** `VALIDATION_ERROR` (sem `confirm`), `NOT_FOUND`, `ANKI_*`.

## search_cards

- **Entrada:** `{query: string≥1, limit?: int 1–200 = 25}`
- **Sintaxe de busca:** nativa do Anki
  (<https://docs.ankiweb.net/searching.html>): `deck:`, `tag:`, `is:due|new|learn|review`,
  `nid:`, `cid:`, texto livre, `-` negação etc. (o backend mock suporta o subconjunto documentado).
- **Saída:** `{total, returned, cards: [CardView]}` — `CardView` =
  `{card_id, note_id, deck, model, question, answer, tags[], due|null,
  interval_days, reps, lapses, queue, type, state:new|learning|review|relearning|suspended|unknown}`
- **Erros:** `ANKI_UNAVAILABLE`, `ANKI_ERROR`, `VALIDATION_ERROR` (query vazia).

## get_card

- **Entrada:** `{card_id: int>0}` · **Saída:** `CardView`
- **Erros:** `NOT_FOUND`, `ANKI_*`.

## create_note

- **Entrada:** `{deck, model, fields: Record<string,string> (≥1), tags?: [], allow_duplicate?: false}`
- **Saída:** `{created: true, note_id}`
- **Notas:** deck ausente é criado automaticamente (comportamento do Anki);
  duplicata = mesmo modelo + mesmo **primeiro campo** ⇒ `ANKI_ERROR`
  `cannot create note because it is a duplicate` salvo `allow_duplicate=true`.
- **Erros:** `ANKI_ERROR` (modelo inexistente/campo inválido/duplicata), `ANKI_*`.

## update_note

- **Entrada:** `{note_id, fields?: Record, tags?: string[], model?: string}`
  (≥1 de fields/tags/model).
- **Saída:** `{updated: true, note_id, updated_fields: string[], updated_tags: bool, updated_model: bool}`
- **Semântica de tags:** `tags` **substitui** a lista completa
  (`updateNoteTags`); para add/remove merge use `manage_tags`.
- **Troca de modelo:** campos são remapeados por nome; nomes incompatíveis
  falham com `ANKI_ERROR` explicando o modelo.
- **Erros:** `VALIDATION_ERROR` (nenhum campo fornecido), `NOT_FOUND`, `ANKI_*`.

## delete_note

- **Entrada:** `{note_ids: int[1..100], confirm: true}`
- **Saída:** `{deleted: number[], not_found: number[]}` — ids inexistentes são
  reportados, não silenciados.
- **Erros:** `VALIDATION_ERROR` (sem confirm/lista vazia), `ANKI_*`.

## get_due_cards

- **Entrada:** `{deck?: string, limit?: int 1–200 = 20}`
- **Saída:** `{total_due, total, returned, cards: [CardView]}`
- **Notas:** `deck` inclui subdecks (`deck:"X" is:due`); `total_due` é a
  contagem antes do limite.
- **Erros:** `ANKI_*`.

## submit_review

- **Entrada:** `{card_id, ease: again|hard|good|easy}` (1–4 como no Anki)
- **Saída:** `{card_id, ease, answered: boolean}`
- **Dependência de versão:** requer AnkiConnect recente com a ação
  `answerCards`; versões antigas retornam `ANKI_ERROR` + hint de atualização.
  O horário exato da resposta não é gravado pelo AnkiConnect (documentado).
- **Erros:** `NOT_FOUND`, `ANKI_ERROR`, `ANKI_UNAVAILABLE`.

## get_stats

- **Entrada:** `{deck?: string}` · **Saída:**
  `{reviewed_today, counts: {new_count, learning_count, review_count, due_count},
  deck?, deck_stats?: {new_count, learn_count, review_count, total_in_deck}}`
- **Notas:** baralho inexistente ⇒ contagens 0 **sem erro** (sem `deck_stats`).
- **Erros:** `ANKI_*`.

## manage_tags (extensão)

- **Entrada:** `{action: list|add|remove|replace|clear_unused, tags?: [], note_ids?: [], replace_from?, replace_to?}`
- **Regras semânticas:** `add`/`remove` exigem `tags`+`note_ids`; `replace`
  exige `replace_from`+`replace_to`+`note_ids` — violações ⇒ `VALIDATION_ERROR`.
- **Saída:** `{action, tags: string[], updated_note_ids: number[]}`
  (`tags` = lista completa em `list`/`clear_unused`; tags afetadas nas demais).
- **Erros:** `VALIDATION_ERROR`, `ANKI_*`.

## update_model_templates (extensão, admin)

- **Entrada:** `{model, template_name?, front?, back?, css?}` (≥1 de front/back/css)
- **Saída:** `{updated: true, model, templates_updated: string[], css_updated: boolean}`
- **Múltiplos templates:** sem `template_name`, modelos com >1 template falham
  com `VALIDATION_ERROR` listando as opções; modelos com 1 template usam-no.
- **Risco:** altera o rendering de **todos** os cartões do modelo —
  `destructiveHint` sinaliza confirmação no host.
- **Erros:** `VALIDATION_ERROR`, `NOT_FOUND`, `ANKI_*`, `FORBIDDEN` (sem admin).

---

## Erros tipados — referência rápida

| Código | Quando | Hint típico |
|:---|:---|:---|
| `VALIDATION_ERROR` | Regra de negócio violada (confirm ausente, args incompletos) | Corrija os campos indicados |
| `NOT_FOUND` | Deck/card/note/model inexistente | `Use list_decks / search_cards` |
| `CONFLICT` | Destino já existe; rename com subdecks | Ajuste ao estado atual |
| `FORBIDDEN` | Scope ausente no token | Re-autorize com o scope citado |
| `RATE_LIMITED` | Limite por subject excedido | Aguarde `retry` |
| `ANKI_UNAVAILABLE` | Anki fechado/add-on ausente/timeout | Verifique o Anki Desktop + AnkiConnect |
| `ANKI_ERROR` | Erro retornado pelo AnkiConnect | Veja a mensagem; caso `unsupported action` em `answerCards`, atualize o add-on |
| `INTERNAL` | Falha inesperada | Repita; persiste ⇒ logs do servidor |
