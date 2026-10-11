import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnkiGateway } from '../anki/index.js';
import type { Logger } from '../infra/logger.js';
import { SERVER_NAME, SERVER_VERSION } from '../version.js';
import type { FixedWindowLimiter } from './ratelimit.js';
import { toErrorPayload } from '../tools/errors.js';
import { ToolError, type ErrorPayload, type ToolContext, type ToolDefinition } from '../tools/types.js';

export interface McpServerDeps {
  tools: ToolDefinition[];
  gateway: AnkiGateway;
  logger: Logger;
  limiter: FixedWindowLimiter;
}

/**
 * Builds the MCP server with all tools registered. Scope enforcement and rate
 * limiting happen here (single enforcement point), so every call — regardless
 * of transport — is checked.
 */
export function buildMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const tool of deps.tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      },
      async (args: unknown, extra: { authInfo?: AuthInfo }): Promise<CallToolResult> => {
        return callTool(tool, args, extra.authInfo, deps);
      },
    );
  }

  return server;
}

async function callTool(
  tool: ToolDefinition,
  args: unknown,
  authInfo: AuthInfo | undefined,
  deps: McpServerDeps,
): Promise<CallToolResult> {
  const scopes = authInfo?.scopes ?? [];
  const subject =
    typeof authInfo?.extra?.subject === 'string'
      ? authInfo.extra.subject
      : authInfo?.clientId ?? 'anonymous';
  const startedAt = Date.now();

  if (!scopes.includes(tool.scope)) {
    const payload = toErrorPayload(
      new ToolError(
        'FORBIDDEN',
        `This operation requires the OAuth scope "${tool.scope}", which the current access token does not have.`,
        `Re-authorize the app requesting the scope "${tool.scope}".`,
      ),
    );
    deps.logger.warn('tool_call_forbidden', { tool: tool.name, subject, required_scope: tool.scope });
    return errorResult(payload);
  }

  const decision = deps.limiter.check(subject);
  if (!decision.allowed) {
    const payload: ErrorPayload = {
      code: 'RATE_LIMITED',
      message: `Rate limit exceeded (${deps.limiter.limit} calls/min). Retry in ${decision.retryAfterSeconds}s.`,
      hint: 'Reduce call frequency or raise RATE_LIMIT_PER_MINUTE on the server.',
    };
    deps.logger.warn('tool_call_rate_limited', { tool: tool.name, subject });
    return errorResult(payload);
  }

  const ctx: ToolContext = { gateway: deps.gateway, logger: deps.logger };
  try {
    const handler = tool.handler as (input: unknown, context: ToolContext) => Promise<unknown>;
    const result = await handler(args, ctx);
    deps.logger.info('tool_call', { tool: tool.name, subject, ms: Date.now() - startedAt, ok: true });
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  } catch (error) {
    const payload = toErrorPayload(error);
    deps.logger.warn('tool_call', {
      tool: tool.name,
      subject,
      ms: Date.now() - startedAt,
      ok: false,
      code: payload.code,
      message: payload.message,
    });
    return errorResult(payload);
  }
}

function errorResult(payload: ErrorPayload): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true };
}
