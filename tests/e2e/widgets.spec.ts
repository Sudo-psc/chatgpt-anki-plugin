import { expect, test } from '@playwright/test';
import { buildDeckBrowserWidgetHtml, buildReviewSessionWidgetHtml } from '../../src/widgets/index.js';

test.describe('OpenAI Apps SDK Skybridge Widgets E2E (`tests/e2e/widgets.spec.ts`)', () => {
  test('Deck Browser widget renders decks and searched cards from window.openai.toolOutput', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { openai: unknown }).openai = {
        toolOutput: {
          totalDecks: 2,
          decks: [
            { id: 1, name: 'Default', depth: 0, newCount: 3, learnCount: 1, dueCount: 4, totalCards: 20 },
            {
              id: 2,
              name: 'Medicina::Cardiologia',
              depth: 1,
              newCount: 5,
              learnCount: 2,
              dueCount: 8,
              totalCards: 45,
            },
          ],
          cards: [
            {
              cardId: 3001,
              question: 'Qual é o marcapasso fisiológico primário do coração?',
              answer: 'Nó sinoatrial (SA).',
              tags: ['cardiologia', 'fisiologia'],
            },
          ],
        },
      };
    });

    await page.route('https://widget.local/deck-browser.html', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: buildDeckBrowserWidgetHtml() }),
    );
    await page.goto('https://widget.local/deck-browser.html');

    await expect(page.getByTestId('decks-table')).toBeVisible();
    await expect(page.getByTestId('decks-table')).toContainText('Medicina::Cardiologia');
    await expect(page.getByTestId('cards-list')).toContainText('Nó sinoatrial (SA).');
  });

  test('Review Session widget reveals answer and invokes window.openai.callTool("submit_review", ...)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const calls: Array<{ name: string; args: unknown }> = [];
      (window as unknown as { __toolCalls: typeof calls; openai: unknown }).__toolCalls = calls;
      (window as unknown as { openai: unknown }).openai = {
        toolOutput: {
          deckName: 'Medicina::Cardiologia',
          totalDue: 1,
          returnedCount: 1,
          cards: [
            {
              cardId: 3001,
              deckName: 'Medicina::Cardiologia',
              question: 'Qual é o marcapasso fisiológico primário do coração?',
              answer: 'Nó sinoatrial (SA).',
            },
          ],
        },
        callTool: async (name: string, args: unknown) => {
          calls.push({ name, args });
          return { ok: true };
        },
        setWidgetState: () => {},
      };
    });

    await page.route('https://widget.local/review-session.html', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: buildReviewSessionWidgetHtml() }),
    );
    await page.goto('https://widget.local/review-session.html');

    await expect(page.getByTestId('review-question')).toContainText(
      'Qual é o marcapasso fisiológico primário do coração?',
    );
    await expect(page.getByTestId('review-answer')).toBeHidden();

    await page.getByTestId('reveal-answer-btn').click();
    await expect(page.getByTestId('review-answer')).toBeVisible();
    await expect(page.getByTestId('review-answer')).toContainText('Nó sinoatrial (SA).');

    await page.getByTestId('rate-good').click();

    const recordedCalls = await page.evaluate(
      () => (window as unknown as { __toolCalls: Array<{ name: string; args: unknown }> }).__toolCalls,
    );
    expect(recordedCalls).toEqual([
      {
        name: 'submit_review',
        args: { cardId: 3001, rating: 3 },
      },
    ]);
    await expect(page.getByTestId('review-question')).toContainText('Sessão concluída!');
  });
});
