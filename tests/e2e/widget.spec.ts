import { expect, test } from '@playwright/test';

/**
 * E2E local dos widgets do Apps SDK, servidos pelo próprio servidor MCP.
 * O estado chega por `?state=` (fallback de desenvolvimento); em produção o
 * ChatGPT injeta o estado via window.openai.toolOutput.
 *
 * Executar: npx playwright install chromium && npm run e2e
 */
test.describe('Apps SDK widgets (E2E)', () => {
  test('decks widget renders decks from tool output state', async ({ page }) => {
    const state = {
      decks: [
        { id: 1, name: 'Default', parent: null },
        { id: 2, name: 'Estudos::Anatomia', parent: 'Estudos' },
      ],
    };
    await page.goto(`/widgets/decks.html?state=${encodeURIComponent(JSON.stringify(state))}`);
    await expect(page.locator('h1')).toContainText('Baralhos do Anki (2)');
    await expect(page.getByText('Default')).toBeVisible();
    await expect(page.getByText('Estudos::Anatomia')).toBeVisible();
    await expect(page.getByText('(sub de Estudos)')).toBeVisible();
  });

  test('decks widget renders a card search table', async ({ page }) => {
    const state = {
      total: 1,
      returned: 1,
      cards: [
        {
          card_id: 10,
          note_id: 9,
          deck: 'Default',
          question: 'O que é repetição espaçada?',
          answer: 'Técnica de revisão.',
          state: 'review',
          due: 0,
        },
      ],
    };
    await page.goto(`/widgets/decks.html?state=${encodeURIComponent(JSON.stringify(state))}`);
    await expect(page.getByRole('table')).toBeVisible();
    // O texto aparece na tabela e no cartão destacado (1 resultado) — .first() evita strict mode.
    await expect(page.getByText('O que é repetição espaçada?').first()).toBeVisible();
    await expect(page.getByText('Técnica de revisão.').first()).toBeVisible();
  });

  test('review widget: show answer, answer with keyboard shortcut, finish session', async ({ page }) => {
    const state = {
      total_due: 2,
      cards: [
        { card_id: 42, question: 'Pergunta um?', answer: 'Resposta um.', deck: 'Default', state: 'review', due: 0 },
        { card_id: 43, question: 'Pergunta dois?', answer: 'Resposta dois.', deck: 'Default', state: 'review', due: 0 },
      ],
    };
    await page.goto(`/widgets/review.html?state=${encodeURIComponent(JSON.stringify(state))}`);
    await expect(page.getByText('Pergunta um?')).toBeVisible();
    await expect(page.getByText('Resposta um.')).toBeHidden();

    await page.getByRole('button', { name: /Mostrar resposta/ }).click();
    await expect(page.getByText('Resposta um.')).toBeVisible();

    // Atalho de teclado: 3 = Good
    await page.keyboard.press('3');
    await expect(page.getByText('Pergunta dois?')).toBeVisible();

    await page.keyboard.press('Space');
    await page.getByRole('button', { name: /Again/ }).click();
    await expect(page.getByText('Revisão concluída')).toBeVisible();
    await expect(page.getByText('Você revisou 2 cartão(ões).')).toBeVisible();
  });

  test('widgets show a friendly error for invalid state JSON', async ({ page }) => {
    await page.goto('/widgets/review.html?state=%7Bbroken');
    await expect(page.locator('.error')).toContainText('invalid ?state JSON');
  });

  test('widget responses carry a restrictive CSP header', async ({ request }) => {
    const response = await request.get('/widgets/decks.html');
    expect(response.status()).toBe(200);
    const csp = response.headers()['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
  });
});
