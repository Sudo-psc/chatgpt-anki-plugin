# 01 — Requisitos Funcionais

Cada requisito tem critério de aceite **testável** e rastreabilidade para a
tool MCP e para a suíte de testes. Verificação: `npm run test:contract` e
`npm run test:integration` (arquivos `tests/contract/`, `tests/integration/`).

## FR-01 — Listar baralhos e sub-baralhos

- **Descrição:** o usuário lista todos os baralhos, incluindo sub-baralhos
  (`Pai::Filho`), com id e baralho-pai derivado.
- **Tool:** `list_decks` (scope `anki:read`).
- **Critério de aceite:** com a coleção sintética, a resposta contém os 6
  baralhos (incluindo `Estudos` e `Estudos::Anatomia`), cada item com
  `id`, `name`, `parent` (ex.: `"Estudos::Anatomia"` → `parent = "Estudos"`).
- **Teste:** `tests/integration/mcp-tools.test.ts` › *list_decks returns seeded decks with parents and subdecks*; contrato de saída em `tests/contract`.

## FR-02 — Detalhar baralho

- **Descrição:** detalhes de um baralho por nome exato: id, pai, sub-baralhos
  (nomes) e estatísticas (new/learn/review/total, incluindo descendentes).
- **Tool:** `get_deck` (scope `anki:read`).
- **Critério de aceite:** `get_deck("Estudos")` retorna `subdecks = ["Estudos::Anatomia", "Estudos::Farmacologia"]` e `stats.total_in_deck ≥ 3`; nome inexistente retorna erro `NOT_FOUND` com hint.
- **Teste:** `mcp-tools.test.ts` › *get_deck returns stats and subdecks…*.

## FR-03 — Criar baralho

- **Descrição:** cria baralho ou sub-baralho; repetir a chamada com o mesmo nome é idempotente (retorna o existente).
- **Tool:** `create_deck` (scope `anki:write`).
- **Critério de aceite:** duas chamadas com `"Provas::Farmacologia"` retornam o **mesmo id**; o deck-pai implícito (`Provas`) passa a existir.
- **Teste:** *create_deck is idempotent…*.

## FR-04 — Editar baralho (renomear)

- **Descrição:** renomeia um baralho movendo seus cartões para o novo nome
  (decisão composta adversarialmente documentada em `05-tools-mcp.md`).
- **Tool:** `update_deck` (scope `anki:write`).
- **Critério de aceite:** após renomear `Temporario` → `Renomeado`, `deck:Renomeado` encontra o cartão movido, `get_deck("Temporario")` retorna `NOT_FOUND`; renomear para nome existente retorna `CONFLICT`; renomear deck com subdecks retorna `CONFLICT` com mensagem explicando a limitação.
- **Teste:** *update_deck renames and moves cards* + *update_deck reports CONFLICT…*.

## FR-05 — Excluir baralho (destrutivo, com confirmação)

- **Descrição:** exclui baralho e todos os seus cartões (`cardsToo=true`).
- **Tool:** `delete_deck` (scope `anki:write`).
- **Critério de aceite:** sem `confirm=true` → `VALIDATION_ERROR` explicando o motivo; com confirmação → `deleted=true` e o baralho deixa de existir.
- **Teste:** *delete_deck requires confirm and deletes with it*.

## FR-06 — Pesquisar cartões e notas (sintaxe Anki)

- **Descrição:** busca com sintaxe nativa (`deck:`, `tag:`, `is:due|new|learn|review`, texto livre) com limite e contagem total.
- **Tool:** `search_cards` (scope `anki:read`).
- **Critério de aceite:** `tag:farmacologia` → `total = 2` com tags e respostas em texto puro (HTML removido); `limit=1` → `returned = 1` com `total` completo; query sem resultados → `total = 0`, lista vazia (sem erro).
- **Teste:** *search_cards supports tag queries, limits and empty results*.

## FR-07 — Visualizar cartão individual

- **Descrição:** detalhes de um cartão: baralho, modelo, pergunta/resposta (texto puro), agendamento (due, intervalo, fila, tipo, estado) e tags da nota.
- **Tool:** `get_card` (scope `anki:read`).
- **Critério de aceite:** id válido retorna `card_id` correspondente e `state ∈ {new,learning,review,relearning,suspended}`; id inexistente → `NOT_FOUND`.
- **Teste:** *get_card returns card details and NOT_FOUND for missing ids*.

## FR-08 — Criar nota

- **Descrição:** cria nota com `deck`, `model`, `fields`, `tags`; deck inexistente é criado automaticamente; duplicatas são rejeitadas salvo `allow_duplicate=true`.
- **Tool:** `create_note` (scope `anki:write`).
- **Critério de aceite:** primeira criação retorna `note_id`; repetição idêntica → `ANKI_ERROR` com mensagem de duplicata; com `allow_duplicate=true` → sucesso; modelo inexistente → `ANKI_ERROR` citando o modelo e hint.
- **Teste:** *create_note creates the deck if needed…* + *create_note surfaces unknown models…*.

## FR-09 — Editar nota e gerenciar tags

- **Descrição:** atualiza campos (merge parcial), substitui a lista completa de
  tags, troca o modelo; `manage_tags` faz add/remove/replace/list/clear_unused.
- **Tools:** `update_note`, `manage_tags` (scope `anki:write`).
- **Critério de aceite:** `update_note` sem `fields/tags/model` → `VALIDATION_ERROR`; após `tags: ["anatomia","atualizado"]`, busca por `tag:atualizado` encontra a nota; `manage_tags add/remove/replace/clear_unused` refletem em buscas; `add` sem tags/ids → `VALIDATION_ERROR`.
- **Teste:** *update_note merges fields…* + *manage_tags lists, adds, removes…*.

## FR-10 — Excluir nota (destrutivo, com confirmação)

- **Descrição:** exclui até 100 notas e seus cartões; reporta ids inexistentes.
- **Tool:** `delete_note` (scope `anki:write`).
- **Critério de aceite:** sem confirmação → `VALIDATION_ERROR`; com confirmação, resposta separa `deleted` e `not_found` corretamente.
- **Teste:** *delete_note requires confirm and reports not_found ids*.

## FR-11 — Listar cartões devidos

- **Descrição:** cartões vencidos (`is:due`), opcionalmente por baralho
  (incluindo subdecks), com contagem total e limite.
- **Tool:** `get_due_cards` (scope `anki:review`).
- **Critério de aceite:** coleção sintética → `total_due ≥ 4`; com `deck="Estudos::Anatomia"` todos os retornados pertencem ao baralho ou descendentes.
- **Teste:** *get_due_cards scopes by deck including subdecks*.

## FR-12 — Submeter revisão

- **Descrição:** responde um cartão com `again|hard|good|easy` (ease 1–4),
  reagendando via agendador (AnkiConnect `answerCards`).
- **Tool:** `submit_review` (scope `anki:review`).
- **Critério de aceite:** resposta `good` → `answered=true`; `reviewed_today` incrementa; cartão inexistente → `NOT_FOUND`; AnkiConnect antigo → `ANKI_ERROR` com hint de atualização do add-on.
- **Teste:** *submit_review answers a due card…* + *submit_review maps unknown cards…* + caso `unsupported action` em `tests/unit/tool-errors.test.ts`.

## FR-13 — Estatísticas de estudo

- **Descrição:** revisões de hoje + contagens new/learning/review/due na
  coleção ou em um baralho (com stats da árvore de decks).
- **Tool:** `get_stats` (scope `anki:read`).
- **Critério de aceite:** coleção → `counts.due_count ≥ 4`; baralho válido → `deck` ecoado + `deck_stats` presente; baralho inexistente → contagens zero **sem erro** (não confundir com falha).
- **Teste:** *get_stats reports collection and deck-scoped counts*.

## FR-14 — Gerenciar templates de modelos (admin)

- **Descrição:** atualiza frente/verso/CSS de um modelo de nota; exige
  `template_name` quando há múltiplos templates.
- **Tool:** `update_model_templates` (scope `anki:admin` — **não** concedido por padrão).
- **Critério de aceite:** CSS atualizado → `css_updated=true`; template atualizado → `templates_updated=["Card 1"]`; sem mudanças → `VALIDATION_ERROR`; modelo/template inexistente → `NOT_FOUND`; modelo multi-template sem `template_name` → `VALIDATION_ERROR` citando as opções.
- **Teste:** *updates css and templates…* + *requires template_name when the model has multiple templates*.

## Rastreabilidade resumida

| Requisito | Tool | Scope | Suíte |
|:---|:---|:---|:---|
| FR-01..05 | list/get/create/update/delete_deck | read/write | integration + contract |
| FR-06..07 | search_cards, get_card | read | integration + contract |
| FR-08..10 | create/update/delete_note, manage_tags | write | integration + contract |
| FR-11..12 | get_due_cards, submit_review | review | integration + contract |
| FR-13 | get_stats | read | integration + contract |
| FR-14 | update_model_templates | admin | integration + auth |

## Fora de escopo v0.1 (requisitos adiados)

- FR-15 (proposto): import/export de pacotes `.apkg` — requer decisões de armazenamento; T-045 no backlog.
- FR-16 (proposto): agendamento customizado/FSRS por deck — dependente de ações estáveis no AnkiConnect.
- FR-17 (proposto): multi-tenant público — ver ADR-0008.
