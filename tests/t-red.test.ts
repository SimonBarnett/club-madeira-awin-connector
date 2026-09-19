import { describe, expect, it } from 'vitest';
import { AwinClient, type FetchLike } from '../src/awin/client';
import { RateLimiter } from '../src/awin/rateLimit';
import { REDACTED, logRedacted, redact, redactedError } from '../src/awin/redact';

const TOKEN = 'super-secret-awin-token-fixture';

describe('T-RED', () => {
  it('T-RED-01 Error with token in URL is [REDACTED]', () => {
    const url = `https://api.awin.com/publishers/2889699/programmes?accessToken=${TOKEN}`;
    const err = redactedError(`GET ${url} failed: 401`, [TOKEN]);
    expect(err.message).toContain(REDACTED);
    expect(err.message).toContain('accessToken=[REDACTED]');
    expect(err.message).not.toContain(TOKEN);
  });

  it('T-RED-02 Log line with Authorization has no raw token', () => {
    const lines: string[] = [];
    logRedacted(`Authorization: Bearer ${TOKEN} retry=1`, (s) => lines.push(s), [TOKEN]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(REDACTED);
    expect(lines[0]).not.toContain(TOKEN);
    expect(redact(`Authorization: Bearer ${TOKEN}`)).not.toContain(TOKEN);
  });

  it('HTTP error bodies and URLs are redacted by the client', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(`denied token=${TOKEN}`, {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      });
    const client = new AwinClient({
      token: TOKEN,
      fetch: fetchImpl,
      limiter: new RateLimiter({
        maxCalls: 10,
        windowMs: 60_000,
        now: () => 0,
        sleep: async () => {},
      }),
      env: {},
    });
    await expect(client.getPublisher()).rejects.toThrow();
    try {
      await client.getPublisher();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(TOKEN);
      expect(message).toContain(REDACTED);
    }
  });
});
