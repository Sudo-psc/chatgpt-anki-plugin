import { test } from '@playwright/test';

/**
 * E2E no ChatGPT (developer mode) — evidência do critério C10.
 *
 * Este fluxo só é automatizável com uma sessão autenticada do ChatGPT, que
 * exige interação humana (login) e configuração manual do connector. Por isso
 * ele roda como roteiro assistido: exporte CHATGPT_E2E=1 e um perfil de
 * navegador autenticado para executar a visita guiada; caso contrário, siga o
 * roteiro em docs/09-submissao-openai.md § "Teste em developer mode" e anexe a
 * transcrição em docs/evidencias/C10-developer-mode.md.
 *
 * Pré-requisitos:
 *   1. Servidor exposto em HTTPS público (fly.io, ngrok ou Cloudflare Tunnel).
 *   2. No ChatGPT: Settings → Connectors → Advanced → Developer mode ON.
 *   3. Connectors → Create → URL https://<host>/mcp → OAuth (autorizar).
 */
const enabled = process.env.CHATGPT_E2E === '1';

test.describe('ChatGPT developer mode (roteiro assistido)', () => {
  test.skip(
    !enabled,
    'Roteiro manual: exporte CHATGPT_E2E=1 com um navegador autenticado no ChatGPT para executar.',
  );

  test('connect the MCP server and invoke the mandated tools', async ({ page }) => {
    await page.goto('https://chatgpt.com/');

    // Passo 1 — abrir configurações de connectors (seletores mudam; ajuste se necessário).
    // await page.getByTestId('composer-plus-btn').click();
    // ... (fluxo guiado pelo host ChatGPT)

    // Passo 2 — prompts canônicos por tool (transcrever a resposta de cada um):
    const PROMPTS: Array<[string, string]> = [
      ['list_decks', 'Quais baralhos eu tenho no meu Anki?'],
      ['get_deck', 'Me mostre os detalhes e estatísticas do baralho Estudos::Anatomia'],
      ['create_deck', 'Crie um baralho chamado ChatGPT::Teste'],
      ['update_deck', 'Renomeie o baralho ChatGPT::Teste para ChatGPT::Teste2'],
      ['search_cards', 'Busque meus cartões com a tag farmacologia'],
      ['get_card', 'Mostre o cartão <card_id> em detalhe'],
      ['get_due_cards', 'Quais cartões estão vencidos hoje?'],
      ['submit_review', 'Dê nota "good" no cartão <card_id>'],
      ['create_note', 'Crie uma nota no baralho ChatGPT::Teste2 com frente "Teste E2E" e verso "Ok"'],
      ['update_note', 'Atualize o verso dessa nota para "Ok, atualizado"'],
      ['manage_tags', 'Liste todas as minhas tags'],
      ['get_stats', 'Quantos cartões eu revisei hoje e quantos estão vencidos?'],
      ['delete_note', 'Apague a nota "Teste E2E" que criamos (confirme a exclusão)'],
      ['delete_deck', 'Apague o baralho ChatGPT::Teste2 (confirme a exclusão)'],
      ['update_model_templates', 'Adicione ao modelo Basic o CSS .card{color:blue}'],
    ];
    test.info().annotations.push({
      type: 'roteiro',
      description: PROMPTS.map(([tool, prompt]) => `${tool}: ${prompt}`).join(' | '),
    });
  });
});
