import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from './types.js';
import { deckTools } from './decks.js';
import { cardTools } from './cards.js';
import { noteTools } from './notes.js';
import { reviewTools } from './review.js';
import { modelTools } from './models.js';

/**
 * The 13 mandated tools plus 2 extension tools (manage_tags,
 * update_model_templates). See docs/05-tools-mcp.md for the contract.
 */
export const ALL_TOOLS: ToolDefinition[] = [
  ...deckTools,
  ...cardTools,
  ...noteTools,
  ...reviewTools,
  ...modelTools,
];

export function getTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

export function toolNames(): string[] {
  return ALL_TOOLS.map((tool) => tool.name);
}

/** JSON Schema (draft-07) for a tool input, used by contract tests and docs. */
export function inputJsonSchema(tool: ToolDefinition): Record<string, unknown> {
  const schema = zodToJsonSchema(tool.inputSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** JSON Schema (draft-07) for a tool output, used by contract tests and docs. */
export function outputJsonSchema(tool: ToolDefinition): Record<string, unknown> {
  const schema = zodToJsonSchema(tool.outputSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
