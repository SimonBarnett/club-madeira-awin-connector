import { describe, expect, it } from 'vitest';
import { AwinClient, type FetchLike } from '../src/awin/client';
import { readApprovalPercentage } from '../src/awin/types';
import { RateLimiter } from '../src/awin/rateLimit';
import { API_BASE, REDACTED } from '../src';
import { redact } from '../src/awin/redact';

const TOKEN = 'test-token-fixture';
const PUBLISHER_ID = 1111111;

function limiter(): RateLimiter {
  return new RateLimiter({ maxCalls: 100, windowMs: 60_000, now: () => 0, sleep: async () => {} });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('T-API', () => {
  it('T-API-01 Mock GET programmes parses array', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      seen.push(String(input));
      return jsonResponse([
        { id: 1, name: 'One', relationship: 'notjoined' },
        { id: 2, name: 'Two', relationship: 'notjoined' },
      ]);
    };
    const client = new AwinClient({
      token: TOKEN,
      publisherId: PUBLISHER_ID,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });
    const programmes = await client.getProgrammes('notjoined');
    expect(programmes).toHaveLength(2);
    expect(programmes[0]?.id).toBe(1);
    expect(seen[0]).toBe(
      `${API_BASE}/publishers/${PUBLISHER_ID}/programmes?relationship=notjoined`,
    );
  });

  it('T-API-02 Mock programmedetails notjoined reads approvalPercentage', async () => {
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      expect(url).toContain('/programmedetails?');
      expect(url).toContain('advertiserId=55');
      expect(url).toContain('relationship=notjoined');
      return jsonResponse({
        programmeInfo: { id: 55, name: 'Demo' },
        kpi: { approvalPercentage: 99.2 },
      });
    };
    const client = new AwinClient({
      token: TOKEN,
      publisherId: PUBLISHER_ID,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });
    const details = await client.getProgrammeDetails(55, 'notjoined');
    expect(readApprovalPercentage(details)).toBe(99.2);
  });

  it('T-API-03 Missing token is a clear error with no leak', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('fetch must not run');
    };
    const client = new AwinClient({
      token: '',
      publisherId: PUBLISHER_ID,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });
    await expect(client.getPublisher()).rejects.toThrow(/Missing AWIN_ACCESS_TOKEN/);
    try {
      await client.getPublisher();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toMatch(/Bearer/i);
      expect(redact(message)).not.toContain(TOKEN);
      expect(message).not.toContain(TOKEN);
    }
  });

  it('T-API-04 Bearer header is set on the request', async () => {
    let auth: string | null = null;
    const fetchImpl: FetchLike = async (_input, init) => {
      const headers = new Headers(init?.headers);
      auth = headers.get('Authorization');
      return jsonResponse({ id: PUBLISHER_ID });
    };
    const client = new AwinClient({
      token: TOKEN,
      publisherId: PUBLISHER_ID,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });
    await client.getPublisher();
    expect(auth).toBe(`Bearer ${TOKEN}`);
  });

  it('POST promotions uses /publisher singular and is not a join write', async () => {
    let url = '';
    let method = '';
    const fetchImpl: FetchLike = async (input, init) => {
      url = String(input);
      method = init?.method ?? '';
      return jsonResponse({ promotions: [] });
    };
    const client = new AwinClient({
      token: TOKEN,
      publisherId: PUBLISHER_ID,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });
    await client.listPromotions({ membership: 'notjoined' });
    expect(method).toBe('POST');
    expect(url).toBe(`${API_BASE}/publisher/${PUBLISHER_ID}/promotions`);
    expect(url).not.toMatch(/join/i);
    expect(REDACTED).toBe('[REDACTED]');
  });
});
