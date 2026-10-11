import type { AnkiAdapter } from '../anki/adapter.js';
import {
  AnkiPluginError,
  createInsufficientScopeError,
  createReadOnlyError,
  type StructuredErrorPayload,
} from '../domain/errors.js';
import type { AppConfig } from '../infra/config.js';
import { logger } from '../infra/logger.js';
import { telemetry } from '../infra/telemetry.js';

export type OAuthScope = 'anki:read' | 'anki:write' | 'anki:review' | 'anki:delete';

export const ALL_OAUTH_SCOPES: ReadonlyArray<OAuthScope> = ['anki:read', 'anki:write', 'anki:review', 'anki:delete'];

export interface ToolExecutionContext {
  anki: AnkiAdapter;
  config: AppConfig;
  grantedScopes?: ReadonlySet<string>;
}

export interface McpToolCallResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export const DECK_BROWSER_WIDGET_URI = 'ui://widget/deck-browser.html';
export const REVIEW_SESSION_WIDGET_URI = 'ui://widget/review-session.html';

export function buildWidgetMeta(options: {
  templateUri?: string;
  invoking: string;
  invoked: string;
  widgetAccessible?: boolean;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    'openai/toolInvocation/invoking': options.invoking,
    'openai/toolInvocation/invoked': options.invoked,
    'openai/widgetAccessible': options.widgetAccessible ?? true,
  };
  if (options.templateUri) {
    meta['openai/outputTemplate'] = options.templateUri;
    meta.ui = { resourceUri: options.templateUri };
  }
  return meta;
}

export function assertWriteAllowed(ctx: ToolExecutionContext): void {
  if (ctx.config.ankiReadOnly) {
    throw createReadOnlyError();
  }
}

export function assertScopeGranted(ctx: ToolExecutionContext, requiredScope: OAuthScope): void {
  if (!ctx.grantedScopes) {
    return;
  }
  if (!ctx.grantedScopes.has(requiredScope)) {
    throw createInsufficientScopeError(requiredScope);
  }
}

export function okResult<T extends Record<string, unknown>>(
  structured: T,
  summaryText: string,
  widgetUri?: string,
): McpToolCallResult {
  const result: McpToolCallResult = {
    content: [{ type: 'text', text: summaryText }],
    structuredContent: structured,
  };
  if (widgetUri) {
    result._meta = {
      'openai/outputTemplate': widgetUri,
      ui: { resourceUri: widgetUri },
    };
  }
  return result;
}

export function formatToolError(err: unknown): { result: McpToolCallResult; errorCode: string } {
  let structuredError: StructuredErrorPayload;
  if (err instanceof AnkiPluginError) {
    structuredError = err.toStructured();
  } else {
    const message = err instanceof Error ? err.message : String(err);
    structuredError = {
      code: 'ANKI_API_ERROR',
      message,
      hint: 'Check the tool parameters and verify that Anki Desktop is running.',
      retryable: false,
    };
  }

  return {
    errorCode: structuredError.code,
    result: {
      isError: true,
      content: [
        {
          type: 'text',
          text: `[${structuredError.code}] ${structuredError.message} Hint: ${structuredError.hint}`,
        },
      ],
      structuredContent: {
        error: structuredError,
      },
    },
  };
}

export async function runToolWithTelemetry(
  toolName: string,
  ctx: ToolExecutionContext,
  options: { requiredScope: OAuthScope; requiresWrite?: boolean },
  handler: () => Promise<McpToolCallResult>,
): Promise<McpToolCallResult> {
  const started = Date.now();
  try {
    assertScopeGranted(ctx, options.requiredScope);
    if (options.requiresWrite) {
      assertWriteAllowed(ctx);
    }
    const res = await handler();
    const durationMs = Date.now() - started;
    telemetry.recordToolCall(toolName, durationMs);
    logger.info({ tool: toolName, durationMs, status: 'ok' }, 'MCP tool executed');
    return res;
  } catch (err) {
    const durationMs = Date.now() - started;
    const { result, errorCode } = formatToolError(err);
    telemetry.recordToolCall(toolName, durationMs, errorCode);
    logger.warn({ tool: toolName, durationMs, status: 'error', errorCode }, 'MCP tool failed');
    return result;
  }
}
