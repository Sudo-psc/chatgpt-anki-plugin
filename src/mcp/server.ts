import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnkiAdapter } from '../anki/adapter.js';
import type { AppConfig } from '../infra/config.js';
import { registerAllTools, type ToolExecutionContext } from '../tools/index.js';
import { registerAllWidgets } from '../widgets/index.js';

export const SERVER_NAME = 'chatgpt-anki-plugin';
export const SERVER_VERSION = '0.1.0';

export const SERVER_INSTRUCTIONS = `You are connected to the user's Anki flashcard collection via chatgpt-anki-plugin.
- Use list_decks and get_deck to inspect deck hierarchy and counts.
- Use search_cards with native Anki search syntax (deck:, tag:, is:due, is:new, prop:ivl>=) and get_card for full card details.
- Use create_deck, update_deck, create_note, and update_note to create or edit decks and notes.
- Destructive tools (delete_deck, delete_note) require explicit user confirmation and confirm=true.
- For study sessions, call get_due_cards to load due cards and submit_review with rating 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).
- Use get_stats to summarize collection progress and daily reviews.`;

export function createMcpServerInstance(options: {
  anki: AnkiAdapter;
  config: AppConfig;
  grantedScopes?: ReadonlySet<string>;
}): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const ctx: ToolExecutionContext = {
    anki: options.anki,
    config: options.config,
    grantedScopes: options.grantedScopes,
  };

  registerAllTools(server, ctx);
  registerAllWidgets(server);

  return server;
}
