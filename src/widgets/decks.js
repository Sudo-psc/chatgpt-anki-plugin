/* global window, document, URLSearchParams */
/**
 * Widget do Apps SDK: lista de baralhos e cartões.
 *
 * Fonte de dados (em ordem de prioridade):
 * 1. window.openai.toolOutput — estado injetado pelo ChatGPT (Apps SDK).
 * 2. ?state=<json> — usado em desenvolvimento local e testes E2E.
 *
 * Espera como entrada o output de list_decks ({decks: [...]}), get_deck
 * ({decks-less deck details}) ou search_cards/get_due_cards ({cards: [...]}).
 */
(function () {
  'use strict';

  var content = document.getElementById('content');
  var title = document.getElementById('title');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderDeckList(decks) {
    title.textContent = 'Baralhos do Anki (' + decks.length + ')';
    var list = el('ul', 'deck-list');
    decks.forEach(function (deck) {
      var item = el('li');
      item.appendChild(el('span', 'deck-name', deck.name));
      if (deck.parent) item.appendChild(el('span', 'deck-parent', '(sub de ' + deck.parent + ')'));
      item.appendChild(el('span', 'chip', 'id ' + deck.id));
      list.appendChild(item);
    });
    content.innerHTML = '';
    content.appendChild(list);
  }

  function renderCards(cards, heading) {
    title.textContent = heading;
    if (!cards.length) {
      content.innerHTML = '';
      content.appendChild(el('p', 'muted', 'Nenhum cartão encontrado.'));
      return;
    }
    var table = el('table', 'cards');
    var thead = el('thead');
    var headRow = el('tr');
    ['Pergunta', 'Baralho', 'Estado', 'Vence em (dias)'].forEach(function (label) {
      headRow.appendChild(el('th', null, label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = el('tbody');
    cards.forEach(function (card) {
      var row = el('tr');
      row.appendChild(el('td', null, card.question || ''));
      row.appendChild(el('td', null, card.deck || ''));
      row.appendChild(el('td', null, card.state || ''));
      row.appendChild(el('td', null, String(card.due ?? '')));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    content.innerHTML = '';
    content.appendChild(table);
    if (cards.length === 1 && cards[0].answer) {
      var box = el('div', 'card');
      box.appendChild(el('div', 'question', cards[0].question || ''));
      box.appendChild(el('div', 'answer', cards[0].answer));
      content.appendChild(box);
    }
  }

  function readState() {
    if (window.openai && window.openai.toolOutput) return window.openai.toolOutput;
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('state');
      if (raw) return JSON.parse(raw);
    } catch (error) {
      return { error: 'invalid ?state JSON: ' + error.message };
    }
    return null;
  }

  function render() {
    var state = readState();
    if (!state) {
      content.innerHTML = '';
      content.appendChild(el('p', 'muted', 'Aguardando dados do ChatGPT (window.openai.toolOutput)…'));
      return;
    }
    if (state.error) {
      content.innerHTML = '';
      content.appendChild(el('p', 'error', String(state.error)));
      return;
    }
    if (Array.isArray(state.decks)) return renderDeckList(state.decks);
    if (Array.isArray(state.cards)) {
      var heading = state.total_due !== undefined ? 'Cartões devidos (' + state.total_due + ')' : 'Cartões (' + (state.total ?? state.cards.length) + ')';
      return renderCards(state.cards, heading);
    }
    if (state.card_id !== undefined) return renderCards([state], 'Cartão ' + state.card_id);
    content.innerHTML = '';
    content.appendChild(el('p', 'muted', 'Formato de dados não reconhecido.'));
  }

  render();
  window.addEventListener('message', function (event) {
    if (event && event.data && event.data.type === 'openai:set_globals') render();
  });
})();
