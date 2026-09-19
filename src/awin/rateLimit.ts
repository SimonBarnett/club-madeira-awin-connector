import { CLIENT_CALLS_PER_MIN, RATE_WINDOW_MS } from '../config';

export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

export type RateLimiterOptions = {
  maxCalls?: number;
  windowMs?: number;
  now?: Clock;
  sleep?: Sleep;
};

const defaultSleep: Sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Sliding window: max 18 attempted or successful HTTP calls per rolling 60s.
 * Policy: the next call waits until a slot frees; it does not fire early.
 */
export class RateLimiter {
  readonly maxCalls: number;
  readonly windowMs: number;
  private readonly now: Clock;
  private readonly sleep: Sleep;
  private stamps: number[] = [];

  constructor(opts: RateLimiterOptions = {}) {
    this.maxCalls = opts.maxCalls ?? CLIENT_CALLS_PER_MIN;
    this.windowMs = opts.windowMs ?? RATE_WINDOW_MS;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  get pendingCount(): number {
    this.prune(this.now());
    return this.stamps.length;
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = this.now();
      this.prune(now);
      if (this.stamps.length < this.maxCalls) {
        this.stamps.push(now);
        return;
      }
      const oldest = this.stamps[0];
      if (oldest === undefined) {
        this.stamps.push(now);
        return;
      }
      const waitMs = oldest + this.windowMs - now;
      if (waitMs > 0) {
        await this.sleep(waitMs);
      } else {
        this.prune(this.now());
      }
    }
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.stamps.length > 0 && (this.stamps[0] ?? 0) <= cutoff) {
      this.stamps.shift();
    }
  }
}

/**
 * Process-global limiter. Not the production default — AwinClient uses a
 * per-client or per-token limiter. Kept for explicit opt-in / tests only.
 */
export const processLimiter = new RateLimiter();

const limitersByToken = new Map<string, RateLimiter>();

/** One sliding window per access token (or explicit key). Not process-global. */
export function limiterForToken(token: string, opts?: RateLimiterOptions): RateLimiter {
  const key = token.length > 0 ? token : 'missing-token';
  const hit = limitersByToken.get(key);
  if (hit) return hit;
  const created = new RateLimiter(opts);
  limitersByToken.set(key, created);
  return created;
}

export function resetTokenLimiters(): void {
  limitersByToken.clear();
}
