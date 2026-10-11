/**
 * Lightweight in-memory operational telemetry collector (OpenTelemetry-compatible counters).
 * Tracks tool invocation counts, latencies, error codes, and HTTP request counts without storing user data.
 */

export interface ToolMetricEntry {
  calls: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

export interface TelemetrySnapshot {
  uptimeSeconds: number;
  httpRequestsTotal: number;
  oauthTokensIssued: number;
  tools: Record<string, ToolMetricEntry>;
  errorCodes: Record<string, number>;
}

export class TelemetryRegistry {
  private readonly startedAt = Date.now();
  private httpRequestsTotal = 0;
  private oauthTokensIssued = 0;
  private readonly tools = new Map<string, ToolMetricEntry>();
  private readonly errorCodes = new Map<string, number>();

  public recordHttpRequest(): void {
    this.httpRequestsTotal += 1;
  }

  public recordOAuthTokenIssued(): void {
    this.oauthTokensIssued += 1;
  }

  public recordToolCall(toolName: string, durationMs: number, errorCode?: string): void {
    const existing = this.tools.get(toolName) ?? {
      calls: 0,
      errors: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    existing.calls += 1;
    existing.totalDurationMs += durationMs;
    if (durationMs > existing.maxDurationMs) {
      existing.maxDurationMs = durationMs;
    }
    if (errorCode) {
      existing.errors += 1;
      this.errorCodes.set(errorCode, (this.errorCodes.get(errorCode) ?? 0) + 1);
    }
    this.tools.set(toolName, existing);
  }

  public snapshot(): TelemetrySnapshot {
    const toolsObj: Record<string, ToolMetricEntry> = {};
    for (const [k, v] of this.tools.entries()) {
      toolsObj[k] = { ...v };
    }
    const errorsObj: Record<string, number> = {};
    for (const [k, v] of this.errorCodes.entries()) {
      errorsObj[k] = v;
    }
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      httpRequestsTotal: this.httpRequestsTotal,
      oauthTokensIssued: this.oauthTokensIssued,
      tools: toolsObj,
      errorCodes: errorsObj,
    };
  }
}

export const telemetry = new TelemetryRegistry();
