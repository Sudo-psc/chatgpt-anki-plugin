export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Fixed-window limiter keyed by OAuth subject. In-memory: fine for single-instance deploys (ADR-0007). */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitDecision {
    const current = this.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= current) {
      this.windows.set(key, { count: 1, resetAt: current + this.windowMs });
      return { allowed: true };
    }
    if (window.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - current) / 1000)) };
    }
    window.count += 1;
    return { allowed: true };
  }

  /** Consulta sem consumir: informa se a chave já esgotou a janela atual. */
  blocked(key: string): RateLimitDecision {
    const current = this.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= current || window.count < this.limit) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - current) / 1000)) };
  }
}
