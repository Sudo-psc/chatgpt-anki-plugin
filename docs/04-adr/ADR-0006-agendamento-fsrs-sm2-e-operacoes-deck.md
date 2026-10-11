# ADR-0006 — Compatibilidade de Agendadores FSRS e SM-2 e Semântica de `update_deck`

* **Status**: Aceito
* **Data**: 2026-10-10
* **Decisores**: Arquiteto, Dev Backend

## Contexto

1. **Agendadores (FSRS vs. SM-2)**: usuários modernos do Anki (23.10+) utilizam majoritariamente o agendador **FSRS**, enquanto coleções antigas utilizam o **SM-2**. Precisamos garantir que `get_due_cards` e `submit_review` funcionem de forma idêntica em ambos.
2. **Operação `update_deck`**: o contrato do servidor MCP prevê a tool `update_deck`, mas o AnkiConnect v6 não possui uma action nativa `renameDeck`.

## Decisão

1. **Delegação de cálculo de intervalo ao motor do Anki via `answerCards`**: o servidor MCP **nunca recalcula manualmente** intervalos SM-2/FSRS quando conectado ao AnkiConnect; ele envia `{ cardId, ease: 1..4 }` para a action `answerCards` do AnkiConnect, que executa o agendador nativo configurado no perfil do usuário (seja FSRS ou SM-2) e em seguida consulta `cardsInfo` para retornar o novo intervalo oficial. No modo `InMemoryAnkiAdapter` (apenas para testes/sandbox), aplica-se uma progressão determinística compatível com os 4 botões (`1=Again`, `2=Hard`, `3=Good`, `4=Easy`).
2. **Semântica composta e transparente em `update_deck`**:
   * Permite mover cartões avulsos para o baralho (`cardIds` → `changeDeck`).
   * Permite renomear um baralho (`newName`) criando o baralho de destino (`createDeck`), movendo todos os cartões do baralho de origem (`findCards` + `changeDeck`) e removendo o baralho antigo vazio (`deleteDecks` se `removeOldDeck !== false`).

## Consequências

* Zero divergência entre o agendamento feito via ChatGPT e o agendamento feito no Anki Desktop/AnkiMobile.
* `update_deck` entrega utilidade real ao usuário sem inventar endpoints inexistentes no AnkiConnect.
