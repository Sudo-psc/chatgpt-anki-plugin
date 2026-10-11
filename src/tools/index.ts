import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolExecutionContext } from './context.js';
import { registerCreateDeckTool } from './create-deck.js';
import { registerCreateNoteTool } from './create-note.js';
import { registerDeleteDeckTool } from './delete-deck.js';
import { registerDeleteNoteTool } from './delete-note.js';
import { registerGetCardTool } from './get-card.js';
import { registerGetDeckTool } from './get-deck.js';
import { registerGetDueCardsTool } from './get-due-cards.js';
import { registerGetStatsTool } from './get-stats.js';
import { registerListDecksTool } from './list-decks.js';
import { registerSearchCardsTool } from './search-cards.js';
import { registerSubmitReviewTool } from './submit-review.js';
import { registerUpdateDeckTool } from './update-deck.js';
import { registerUpdateNoteTool } from './update-note.js';

export const REGISTERED_TOOL_NAMES = [
  'list_decks',
  'get_deck',
  'create_deck',
  'update_deck',
  'delete_deck',
  'search_cards',
  'get_card',
  'create_note',
  'update_note',
  'delete_note',
  'get_due_cards',
  'submit_review',
  'get_stats',
] as const;

export function registerAllTools(server: McpServer, ctx: ToolExecutionContext): void {
  registerListDecksTool(server, ctx);
  registerGetDeckTool(server, ctx);
  registerCreateDeckTool(server, ctx);
  registerUpdateDeckTool(server, ctx);
  registerDeleteDeckTool(server, ctx);
  registerSearchCardsTool(server, ctx);
  registerGetCardTool(server, ctx);
  registerCreateNoteTool(server, ctx);
  registerUpdateNoteTool(server, ctx);
  registerDeleteNoteTool(server, ctx);
  registerGetDueCardsTool(server, ctx);
  registerSubmitReviewTool(server, ctx);
  registerGetStatsTool(server, ctx);
}

export * from './context.js';
