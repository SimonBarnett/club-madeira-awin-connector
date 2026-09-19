import { describe, expect, it } from 'vitest';
import { AwinClient, type FetchLike } from '../src/awin/client';
import { RateLimiter } from '../src/awin/rateLimit';
import { CLIENT_CALLS_PER_MIN, RATE_WINDOW_MS } from '../src/config';

describe('T-RATE', () => {
  it('T-RATE-01 18 calls in 60s are all allowed', async () => {
    let now = 1_000;
    const waits: number[] = [];
    const limiter = new RateLimiter({
      maxCalls: CLIENT_CALLS_PER_MIN,
      windowMs: RATE_WINDOW_MS,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    for (let i = 0; i < CLIENT_CALLS_PER_MIN; i += 1) {
      await limiter.acquire();
    }
    expect(limiter.pendingCount).toBe(18);
    expect(waits).toEqual([]);
  });

  it('T-RATE-02 19th call within the window waits and does not fire early', async () => {
    let now = 0;
    const waits: number[] = [];
    const fired: number[] = [];
    const limiter = new RateLimiter({
      maxCalls: CLIENT_CALLS_PER_MIN,
      windowMs: RATE_WINDOW_MS,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });

    const fetchImpl: FetchLike = async () => {
      fired.push(now);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new AwinClient({
      token: 'rate-token',
      fetch: fetchImpl,
      limiter,
      env: {},
    });

    for (let i = 0; i < CLIENT_CALLS_PER_MIN; i += 1) {
      await client.getPublisher();
    }
    expect(fired).toHaveLength(18);
    expect(waits).toEqual([]);

    await client.getPublisher();
    expect(waits.length).toBeGreaterThanOrEqual(1);
    expect(waits[0]).toBe(RATE_WINDOW_MS);
    expect(fired).toHaveLength(19);
    expect(fired[18]).toBe(RATE_WINDOW_MS);
  });
});
