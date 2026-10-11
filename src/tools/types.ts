import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { AnkiGateway } from '../anki/index.js';
import type { Logger } from '../infra/logger.js';

export const TOOL_SCOPES = ['anki:read', 'anki:write', 'anki:review', 'anki:admin'] as const;
export type ToolScope = (typeof TOOL_SCOPES)[number];

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'ANKI_UNAVAILABLE'
  | 'ANKI_ERROR'
  | 'INTERNAL';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  hint?: string;
}

export class ToolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export const ToolErrors = {
  validation(message: string, hint?: string): ToolError {
    return new ToolError('VALIDATION_ERROR', message, hint ?? 'Check the tool input schema and retry.');
  },
  notFound(message: string, hint?: string): ToolError {
    return new ToolError('NOT_FOUND', message, hint ?? 'Use the corresponding list/search tool to discover valid identifiers.');
  },
  conflict(message: string, hint?: string): ToolError {
    return new ToolError('CONFLICT', message, hint ?? 'Adjust the request to the current collection state and retry.');
  },
  forbidden(scope: ToolScope): ToolError {
    return new ToolError(
      'FORBIDDEN',
      `This operation requires the OAuth scope "${scope}", which the current access token does not have.`,
      `Re-authorize the app requesting the scope "${scope}".`,
    );
  },
};

export interface ToolContext {
  gateway: AnkiGateway;
  logger: Logger;
}

/**
 * Storage shape used by the registry/server (schemas and handler are loose so
 * heterogeneous tools can live in one array). `defineTool` below enforces the
 * precise input/output types at each tool's definition site.
 */
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  annotations: ToolAnnotations;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

export interface TypedToolDefinition<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  annotations: ToolAnnotations;
  inputSchema: I;
  outputSchema: O;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O>>;
}

export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  definition: TypedToolDefinition<I, O>,
): ToolDefinition {
  // The generic constraints above guarantee the handler matches its schemas;
  // the cast only widens to the registry's heterogeneous storage type.
  return definition as unknown as ToolDefinition;
}
