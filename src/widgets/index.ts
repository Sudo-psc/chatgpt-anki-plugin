import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECK_BROWSER_WIDGET_URI, REVIEW_SESSION_WIDGET_URI } from '../tools/context.js';

export const SKYBRIDGE_MIME_TYPE = 'text/html+skybridge';

export function buildDeckBrowserWidgetHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Anki Deck & Card Explorer</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0f172a;
      --panel: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --due: #fbbf24;
      --new: #60a5fa;
      --learn: #f87171;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
    }
    h1 {
      font-size: 1rem;
      margin: 0;
      letter-spacing: 0.01em;
    }
    .badge {
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    th, td {
      padding: 9px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 0.85rem;
    }
    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .count-new { color: var(--new); font-weight: 600; }
    .count-learn { color: var(--learn); font-weight: 600; }
    .count-due { color: var(--due); font-weight: 600; }
    .cards-list {
      display: grid;
      gap: 8px;
    }
    .card-item {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .card-front {
      font-weight: 600;
      margin-bottom: 4px;
      font-size: 0.9rem;
    }
    .card-back {
      color: var(--muted);
      font-size: 0.82rem;
    }
    .tags {
      margin-top: 6px;
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .tag {
      font-size: 0.7rem;
      background: rgba(148, 163, 184, 0.15);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <h1 id="widget-title">Anki Collection Explorer</h1>
    <span class="badge" id="widget-summary">Ready</span>
  </header>
  <main id="widget-root">
    <p style="color: var(--muted); font-size: 0.85rem;">Waiting for Anki tool output…</p>
  </main>
  <script>
    (function () {
      const root = document.getElementById('widget-root');
      const summaryEl = document.getElementById('widget-summary');
      const titleEl = document.getElementById('widget-title');

      function escapeHtml(str) {
        return String(str ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function render(data) {
        if (!data || typeof data !== 'object') return;
        const decks = Array.isArray(data.decks) ? data.decks : data.deck ? [data.deck] : [];
        const cards = Array.isArray(data.cards)
          ? data.cards
          : Array.isArray(data.sampleCards)
          ? data.sampleCards
          : [];

        if (typeof data.reviewedToday === 'number') {
          titleEl.textContent = 'Anki Study Statistics';
          summaryEl.textContent = data.reviewedToday + ' reviewed today';
        } else if (decks.length > 0) {
          titleEl.textContent = 'Anki Decks';
          summaryEl.textContent = decks.length + ' deck(s)';
        } else if (cards.length > 0) {
          titleEl.textContent = 'Anki Cards Search';
          summaryEl.textContent = (data.total ?? cards.length) + ' match(es)';
        }

        let html = '';
        if (decks.length > 0) {
          html += '<table data-testid="decks-table"><thead><tr><th>Deck</th><th>New</th><th>Learn</th><th>Due</th><th>Total</th></tr></thead><tbody>';
          for (const d of decks) {
            const indent = '&nbsp;&nbsp;'.repeat(Number(d.depth || 0));
            html += '<tr data-deck-name="' + escapeHtml(d.name) + '">' +
              '<td>' + indent + escapeHtml(d.name) + '</td>' +
              '<td class="count-new">' + Number(d.newCount || 0) + '</td>' +
              '<td class="count-learn">' + Number(d.learnCount || 0) + '</td>' +
              '<td class="count-due">' + Number(d.dueCount || 0) + '</td>' +
              '<td>' + Number(d.totalCards || 0) + '</td>' +
              '</tr>';
          }
          html += '</tbody></table>';
        }

        if (cards.length > 0) {
          html += '<div class="cards-list" data-testid="cards-list">';
          for (const c of cards) {
            const tagsHtml = (c.tags || [])
              .map(function (t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; })
              .join('');
            html += '<div class="card-item" data-card-id="' + Number(c.cardId) + '">' +
              '<div class="card-front">' + escapeHtml(c.question || (c.fields && c.fields.Front) || '') + '</div>' +
              '<div class="card-back">' + escapeHtml(c.answer || (c.fields && c.fields.Back) || '') + '</div>' +
              '<div class="tags">' + tagsHtml + '</div>' +
              '</div>';
          }
          html += '</div>';
        }

        if (html) {
          root.innerHTML = html;
        }
      }

      if (window.openai && window.openai.toolOutput) {
        render(window.openai.toolOutput);
      }
      window.addEventListener('openai:set_globals', function (ev) {
        const globals = ev && ev.detail && ev.detail.globals;
        if (globals && globals.toolOutput) {
          render(globals.toolOutput);
        } else if (window.openai && window.openai.toolOutput) {
          render(window.openai.toolOutput);
        }
      });
      window.addEventListener('message', function (ev) {
        if (ev.data && ev.data.toolOutput) {
          render(ev.data.toolOutput);
        }
      });
      window.__renderAnkiDeckWidget = render;
    })();
  </script>
</body>
</html>`;
}

export function buildReviewSessionWidgetHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Anki Review Session</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0f172a;
      --panel: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --again: #ef4444;
      --hard: #f59e0b;
      --good: #10b981;
      --easy: #3b82f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .session-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
    }
    .meta-bar {
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 0.78rem;
      margin-bottom: 12px;
    }
    .question {
      font-size: 1.05rem;
      font-weight: 600;
      margin-bottom: 14px;
      line-height: 1.45;
    }
    .answer {
      border-top: 1px dashed var(--border);
      padding-top: 14px;
      margin-top: 14px;
      font-size: 0.96rem;
      line-height: 1.45;
      display: none;
    }
    .answer.visible {
      display: block;
    }
    .actions {
      margin-top: 16px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button {
      cursor: pointer;
      border: none;
      border-radius: 8px;
      padding: 9px 14px;
      font-weight: 600;
      font-size: 0.85rem;
      color: #fff;
    }
    .btn-reveal {
      background: #475569;
      width: 100%;
    }
    .rating-buttons {
      display: none;
      width: 100%;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .rating-buttons.visible {
      display: grid;
    }
    .btn-again { background: var(--again); }
    .btn-hard { background: var(--hard); }
    .btn-good { background: var(--good); }
    .btn-easy { background: var(--easy); }
    .status-msg {
      margin-top: 10px;
      font-size: 0.8rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="session-card">
    <div class="meta-bar">
      <span id="deck-label" data-testid="review-deck">Anki Review</span>
      <span id="progress-label" data-testid="review-progress">0 / 0</span>
    </div>
    <div id="question-box" class="question" data-testid="review-question">No due cards loaded yet.</div>
    <div id="answer-box" class="answer" data-testid="review-answer"></div>
    <div class="actions">
      <button id="reveal-btn" class="btn-reveal" data-testid="reveal-answer-btn">Mostrar resposta</button>
      <div id="rating-group" class="rating-buttons" data-testid="rating-buttons">
        <button class="btn-again" data-ease="1" data-testid="rate-again">1 · Again</button>
        <button class="btn-hard" data-ease="2" data-testid="rate-hard">2 · Hard</button>
        <button class="btn-good" data-ease="3" data-testid="rate-good">3 · Good</button>
        <button class="btn-easy" data-ease="4" data-testid="rate-easy">4 · Easy</button>
      </div>
    </div>
    <div id="status-msg" class="status-msg" data-testid="review-status"></div>
  </div>
  <script>
    (function () {
      let queue = [];
      let currentIndex = 0;

      const deckEl = document.getElementById('deck-label');
      const progressEl = document.getElementById('progress-label');
      const questionEl = document.getElementById('question-box');
      const answerEl = document.getElementById('answer-box');
      const revealBtn = document.getElementById('reveal-btn');
      const ratingGroup = document.getElementById('rating-group');
      const statusEl = document.getElementById('status-msg');

      function renderCard() {
        if (!queue.length || currentIndex >= queue.length) {
          questionEl.textContent = 'Sessão concluída! Todos os cartões da fila foram revisados.';
          answerEl.classList.remove('visible');
          revealBtn.style.display = 'none';
          ratingGroup.classList.remove('visible');
          progressEl.textContent = queue.length + ' / ' + queue.length;
          return;
        }
        const card = queue[currentIndex];
        deckEl.textContent = card.deckName || 'Anki';
        progressEl.textContent = (currentIndex + 1) + ' / ' + queue.length;
        questionEl.textContent = card.question || (card.fields && card.fields.Front) || '';
        answerEl.textContent = card.answer || (card.fields && card.fields.Back) || '';
        answerEl.classList.remove('visible');
        revealBtn.style.display = 'block';
        ratingGroup.classList.remove('visible');
      }

      function hydrate(data) {
        if (!data || typeof data !== 'object') return;
        if (Array.isArray(data.cards)) {
          queue = data.cards;
          currentIndex = 0;
          renderCard();
        } else if (data.updatedCard) {
          statusEl.textContent =
            'Avaliação ' + (data.ratingLabel || data.ease) + ' registrada (novo intervalo: ' + data.updatedCard.interval + 'd).';
        }
      }

      revealBtn.addEventListener('click', function () {
        answerEl.classList.add('visible');
        revealBtn.style.display = 'none';
        ratingGroup.classList.add('visible');
      });

      ratingGroup.querySelectorAll('button[data-ease]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const ease = Number(btn.getAttribute('data-ease'));
          const card = queue[currentIndex];
          if (!card) return;
          statusEl.textContent = 'Registrando avaliação ' + ease + ' para cartão #' + card.cardId + '…';

          if (window.openai && typeof window.openai.callTool === 'function') {
            try {
              await window.openai.callTool('submit_review', {
                cardId: card.cardId,
                rating: ease,
              });
            } catch (err) {
              statusEl.textContent = 'Erro ao enviar revisão: ' + (err && err.message ? err.message : String(err));
              return;
            }
          }

          if (window.openai && typeof window.openai.setWidgetState === 'function') {
            window.openai.setWidgetState({ lastReviewedCardId: card.cardId, lastEase: ease, index: currentIndex + 1 });
          }

          statusEl.textContent = 'Cartão #' + card.cardId + ' avaliado com nota ' + ease + '.';
          currentIndex += 1;
          renderCard();
        });
      });

      if (window.openai && window.openai.toolOutput) {
        hydrate(window.openai.toolOutput);
      }
      window.addEventListener('openai:set_globals', function (ev) {
        const globals = ev && ev.detail && ev.detail.globals;
        if (globals && globals.toolOutput) {
          hydrate(globals.toolOutput);
        } else if (window.openai && window.openai.toolOutput) {
          hydrate(window.openai.toolOutput);
        }
      });
      window.addEventListener('message', function (ev) {
        if (ev.data && ev.data.toolOutput) {
          hydrate(ev.data.toolOutput);
        }
      });
      window.__hydrateAnkiReviewWidget = hydrate;
    })();
  </script>
</body>
</html>`;
}

export function registerAllWidgets(server: McpServer): void {
  server.registerResource(
    'anki-deck-browser-widget',
    DECK_BROWSER_WIDGET_URI,
    {
      title: 'Anki Deck & Card Explorer Widget',
      description: 'Interactive OpenAI Apps SDK widget displaying Anki decks, statistics, and searched flashcards.',
      mimeType: SKYBRIDGE_MIME_TYPE,
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: SKYBRIDGE_MIME_TYPE,
          text: buildDeckBrowserWidgetHtml(),
          _meta: {
            'openai/widgetDescription': 'Displays Anki decks, queue counts, and matching cards.',
            'openai/widgetPrefersBorder': true,
          },
        },
      ],
    }),
  );

  server.registerResource(
    'anki-review-session-widget',
    REVIEW_SESSION_WIDGET_URI,
    {
      title: 'Anki Spaced-Repetition Review Widget',
      description: 'Interactive OpenAI Apps SDK flashcard study widget with Again/Hard/Good/Easy rating buttons.',
      mimeType: SKYBRIDGE_MIME_TYPE,
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: SKYBRIDGE_MIME_TYPE,
          text: buildReviewSessionWidgetHtml(),
          _meta: {
            'openai/widgetDescription': 'Interactive flashcard review widget that calls submit_review.',
            'openai/widgetPrefersBorder': true,
          },
        },
      ],
    }),
  );
}
