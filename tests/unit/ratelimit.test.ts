import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from '../../src/mcp/ratelimit.js';

describe('FixedWindowLimiter', () => {
  it('allows calls under the limit and denies above it', () => {
    const limiter = new FixedWindowLimiter(3, 60_000, () => 0);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    const denied = limiter.check('a');
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.retryAfterSeconds).toBe(60);
  });

  it('isolates subjects', () => {
    const limiter = new FixedWindowLimiter(1, 60_000, () => 0);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('resets when the window expires', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(1, 1000, () => now);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    now = 1000;
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reports a retry hint based on remaining window time', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(1, 10_000, () => now);
    limiter.check('a');
    now = 2500;
    const denied = limiter.check('a');
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.retryAfterSeconds).toBe(8);
  });
});
