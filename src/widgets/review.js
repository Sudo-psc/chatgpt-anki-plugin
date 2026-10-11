/* global window, document, URLSearchParams */
/**
 * Widget do Apps SDK: sessão de revisão (Again/Hard/Good/Easy).
 *
 * Entrada esperada: output de get_due_cards ({cards: [...]}) ou um único card.
 * Ao responder, chama submit_review via window.openai.callTool (Apps SDK).
 * Em desenvolvimento local (?state= JSON), registra a resposta no DOM.
 * Atalhos: 1=Again, 2=Hard, 3=Good, 4=Easy, Espaço=mostrar resposta.
 */
(function () {
  'use strict';

  var content = document.getElementById('content');
  var title = document.getElementById('title');
  var queue = [];
  var answerShown = false;
  var answered = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
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

  function currentCard() {
    return queue[0] || null;
  }

  function submit(ease) {
    var card = currentCard();
    if (!card) return;
    answered += 1;
    if (window.openai && typeof window.openai.callTool === 'function') {
      window.openai.callTool('submit_review', { card_id: card.card_id, ease: ease }).catch(function () {});
    }
    queue.shift();
    answerShown = false;
    render();
  }

  function render() {
    content.innerHTML = '';
    if (queue.length === 0) {
      title.textContent = 'Revisão concluída';
      content.appendChild(el('p', null, answered > 0 ? 'Você revisou ' + answered + ' cartão(ões). Bom trabalho!' : 'Nenhum cartão para revisar.'));
      return;
    }
    var card = currentCard();
    title.textContent = 'Revisão (' + queue.length + ' restante(s))';

    var box = el('div', 'card');
    box.appendChild(el('div', 'question', card.question || '(sem pergunta)'));
    if (answerShown && card.answer) {
      box.appendChild(el('div', 'answer', card.answer));
    }
    box.appendChild(el('div', 'muted', (card.deck || '') + ' · ' + (card.state || '')));
    content.appendChild(box);

    var actions = el('div', 'actions');
    if (!answerShown) {
      var show = el('button', 'primary', 'Mostrar resposta (Espaço)');
      show.addEventListener('click', function () {
        answerShown = true;
        render();
      });
      actions.appendChild(show);
    } else {
      [['again', 'Again (1)'], ['hard', 'Hard (2)'], ['good', 'Good (3)'], ['easy', 'Easy (4)']].forEach(function (pair) {
        var button = el('button', pair[0] === 'again' ? 'ease-again' : '', pair[1]);
        button.addEventListener('click', function () {
          submit(pair[0]);
        });
        actions.appendChild(button);
      });
    }
    content.appendChild(actions);
  }

  document.addEventListener('keydown', function (event) {
    if (queue.length === 0) return;
    if (event.key === ' ' || event.key === 'Enter') {
      if (!answerShown) {
        answerShown = true;
        render();
      }
      return;
    }
    if (answerShown) {
      if (event.key === '1') submit('again');
      if (event.key === '2') submit('hard');
      if (event.key === '3') submit('good');
      if (event.key === '4') submit('easy');
    }
  });

  var state = readState();
  if (state && state.error) {
    content.innerHTML = '';
    content.appendChild(el('p', 'error', String(state.error)));
  } else if (state && Array.isArray(state.cards)) {
    queue = state.cards.slice();
    render();
  } else if (state && state.card_id !== undefined) {
    queue = [state];
    render();
  } else {
    content.innerHTML = '';
    content.appendChild(el('p', 'muted', 'Aguardando cartões devidos do ChatGPT (get_due_cards)…'));
  }

  window.addEventListener('message', function (event) {
    if (event && event.data && event.data.type === 'openai:set_globals') {
      var next = readState();
      if (next && Array.isArray(next.cards) && queue.length === 0) {
        queue = next.cards.slice();
        render();
      }
    }
  });
})();
