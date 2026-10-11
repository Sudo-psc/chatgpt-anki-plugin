import { AnkiConnectAdapter } from '../src/anki/anki-connect-adapter.js';

async function seedDemoNotes(): Promise<void> {
  const url = process.env.ANKICONNECT_URL ?? 'http://127.0.0.1:8765';
  const adapter = new AnkiConnectAdapter({ url });

  const deck = await adapter.createDeck('Demo::ChatGPT-Anki');
  console.log(`Seeded deck '${deck.deckName}' (ID ${deck.deckId})`);

  const note = await adapter.createNote({
    deckName: 'Demo::ChatGPT-Anki',
    modelName: 'Basic',
    fields: {
      Front: 'What protocol connects ChatGPT Apps to external tools?',
      Back: 'Model Context Protocol (MCP) over Streamable HTTP with OAuth 2.1 + PKCE.',
    },
    tags: ['mcp', 'demo'],
    allowDuplicate: true,
    duplicateScope: 'deck',
    createDeckIfMissing: true,
  });

  console.log(`Seeded demo note ID ${note.noteId}`);
}

seedDemoNotes().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
