import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AwinClient, type FetchLike } from '../src/awin/client';
import { processLimiter, RateLimiter } from '../src/awin/rateLimit';
import { applyJoin } from '../src/apply';
import { runCli, help, parseArgs } from '../src/cli';
import { API_BASE, MAX_APPLIES_PER_DAY, MIN_SUBMIT_INTERVAL_MS } from '../src/config';
import { buildCandidateListEnvelope } from '../src/criteria';
import { JoinQueue } from '../src/queue';
import { AGENT_COMMAND_SCHEMA } from '../src/schema';
import {
  InvalidPublisherIdError,
  MissingPublisherIdError,
  readPublisherId,
} from '../src/publisher';

const PUB_A = 1111111;
const PUB_B = 2222222;
const TOKEN_A = 'token-a-fixture';
const TOKEN_B = 'token-b-fixture';
const DAY = Date.UTC(2026, 8, 19, 12, 0, 0);

function limiter(): RateLimiter {
  return new RateLimiter({ maxCalls: 100, windowMs: 60_000, now: () => 0, sleep: async () => {} });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tmpDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'awin-queue-'));
  tmpDirs.push(dir);
  return dir;
}

describe('T-ID publisher injection', () => {
  it('T-ID-01 missing publisher id throws', async () => {
    expect(() => readPublisherId({ env: {} })).toThrow(MissingPublisherIdError);
    expect(() => readPublisherId({ env: { AWIN_PUBLISHER_ID: '' } })).toThrow(MissingPublisherIdError);
    expect(() => readPublisherId({ publisherId: 'nope', env: {} })).toThrow(InvalidPublisherIdError);

    const lines: string[] = [];
    const code = await runCli(['node', 'cli.ts', 'list_join_candidates'], { AWIN_JOIN_DRY_RUN: 'true' }, {
      log: (s) => lines.push(s),
      error: (s) => lines.push(s),
    });
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/Missing publisher id/i);
    expect(lines.join('\n')).toMatch(/--publisherId|AWIN_PUBLISHER_ID/);

    const statusCode = await runCli(['node', 'cli.ts', 'relationship_status'], {}, {
      log: (s) => lines.push(s),
      error: (s) => lines.push(s),
    });
    expect(statusCode).toBe(1);
  });

  it('T-ID-02 injected id appears in the client URL path', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      seen.push(url);
      if (url.includes('/programmes?')) return jsonResponse([{ id: 1, relationship: 'notjoined' }]);
      if (url.includes('/programmedetails?')) return jsonResponse({ kpi: { approvalPercentage: 99 } });
      if (url.includes('/promotions')) return jsonResponse({ promotions: [] });
      return jsonResponse({ id: PUB_A });
    };
    const client = new AwinClient({
      token: TOKEN_A,
      publisherId: PUB_A,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });
    await client.getPublisher();
    await client.getProgrammes('notjoined');
    await client.getProgrammeDetails(55, 'notjoined');
    await client.listPromotions({});
    expect(seen[0]).toBe(`${API_BASE}/publishers/${PUB_A}`);
    expect(seen[1]).toBe(`${API_BASE}/publishers/${PUB_A}/programmes?relationship=notjoined`);
    expect(seen[2]).toContain(`/publishers/${PUB_A}/programmedetails?`);
    expect(seen[3]).toBe(`${API_BASE}/publisher/${PUB_A}/promotions`);
    for (const url of seen) {
      expect(url).not.toContain('2889699');
    }

    const fromEnv = new AwinClient({
      token: TOKEN_A,
      fetch: fetchImpl,
      limiter: limiter(),
      env: { AWIN_PUBLISHER_ID: String(PUB_B) },
    });
    await fromEnv.getPublisher();
    expect(seen.at(-1)).toBe(`${API_BASE}/publishers/${PUB_B}`);
    expect(fromEnv.publisherId).toBe(PUB_B);
  });

  it('T-ID-03 two publisher ids are isolated for cache and queue', async () => {
    const hits: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      hits.push(String(input));
      return jsonResponse([{ id: 1, relationship: 'notjoined' }]);
    };
    const clientA = new AwinClient({
      token: TOKEN_A,
      publisherId: PUB_A,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });
    const clientB = new AwinClient({
      token: TOKEN_B,
      publisherId: PUB_B,
      fetch: fetchImpl,
      limiter: limiter(),
      env: {},
    });

    await clientA.getProgrammes('notjoined');
    await clientB.getProgrammes('notjoined');
    await clientA.getProgrammes('notjoined');
    expect(hits).toEqual([
      `${API_BASE}/publishers/${PUB_A}/programmes?relationship=notjoined`,
      `${API_BASE}/publishers/${PUB_B}/programmes?relationship=notjoined`,
    ]);

    const dataDir = tmpDataDir();
    const queueA = new JoinQueue({ publisherId: PUB_A, dataDir });
    const queueB = new JoinQueue({ publisherId: PUB_B, dataDir });
    for (let i = 0; i < MAX_APPLIES_PER_DAY; i += 1) {
      const r = await applyJoin(queueA, 1000 + i, {
        now: DAY + i * MIN_SUBMIT_INTERVAL_MS,
        dryRun: true,
      });
      expect(r.ok).toBe(true);
    }
    const aBlocked = await applyJoin(queueA, 2000, {
      now: DAY + MAX_APPLIES_PER_DAY * MIN_SUBMIT_INTERVAL_MS,
      dryRun: true,
    });
    expect(aBlocked.ok).toBe(false);
    if (!aBlocked.ok) expect(aBlocked.reason).toBe('daily_cap');

    const bOk = await applyJoin(queueB, 9, { now: DAY, dryRun: true });
    expect(bOk.ok).toBe(true);

    const queueA2 = new JoinQueue({ publisherId: PUB_A, dataDir });
    const stillBlocked = await applyJoin(queueA2, 3000, {
      now: DAY + (MAX_APPLIES_PER_DAY + 2) * MIN_SUBMIT_INTERVAL_MS,
      dryRun: true,
    });
    expect(stillBlocked.ok).toBe(false);
    if (!stillBlocked.ok) expect(stillBlocked.reason).toBe('daily_cap');

    const saved = JSON.parse(readFileSync(join(dataDir, 'join-queue', `${PUB_A}.json`), 'utf8')) as {
      publisherId: number;
    };
    expect(saved.publisherId).toBe(PUB_A);
    expect(queueA.filePath).toBe(join(dataDir, 'join-queue', `${PUB_A}.json`));
    expect(queueB.filePath).toBe(join(dataDir, 'join-queue', `${PUB_B}.json`));
  });

  it('CLI --publisherId wins over env and JSON includes the id used', async () => {
    expect(parseArgs(['node', 'cli.ts', 'list_join_candidates', '--publisherId', String(PUB_A)]).publisherId).toBe(
      String(PUB_A),
    );
    expect(readPublisherId({ publisherId: PUB_A, env: { AWIN_PUBLISHER_ID: String(PUB_B) } })).toBe(PUB_A);
    expect(readPublisherId({ env: { AWIN_PUBLISHER_ID: String(PUB_B) } })).toBe(PUB_B);

    const helpText = help({ publisherId: PUB_A });
    expect(helpText).toContain(String(PUB_A));
    expect(helpText).toContain('--publisherId');
    expect(helpText).toContain('AWIN_PUBLISHER_ID');
    expect(help()).toMatch(/publisherId required/i);

    const logs: string[] = [];
    const fixture = join(tmpDataDir(), 'fix.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      fixture,
      JSON.stringify([
        {
          advertiserId: 7,
          source: 'awin',
          relationship: 'notjoined',
          approvalPercentage: 99,
        },
      ]),
    );
    const code = await runCli(
      ['node', 'cli.ts', 'list_join_candidates', '--publisherId', String(PUB_A), '--fixture', fixture],
      { AWIN_PUBLISHER_ID: String(PUB_B), AWIN_JOIN_DRY_RUN: 'true' },
      { log: (s) => logs.push(s), error: (s) => logs.push(s) },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(logs.join('\n')) as { publisherId: number; dryRun: boolean };
    expect(parsed.publisherId).toBe(PUB_A);
    expect(parsed.dryRun).toBe(true);
  });

  it('src/ has no compiled default publisher id', () => {
    const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          walk(p);
          continue;
        }
        if (!p.endsWith('.ts')) continue;
        const text = readFileSync(p, 'utf8');
        if (text.includes('2889699') || /clubmadeira\.uk/i.test(text)) {
          hits.push(p);
        }
      }
    };
    walk(srcRoot);
    expect(hits).toEqual([]);
  });

  it('agent schema lists publisherId as required', () => {
    expect(AGENT_COMMAND_SCHEMA.commands.list_join_candidates.required).toContain('publisherId');
    expect(AGENT_COMMAND_SCHEMA.commands.relationship_status.required).toContain('publisherId');
  });

  it('processLimiter is not the AwinClient production default', async () => {
    const before = processLimiter.pendingCount;
    const fetchImpl: FetchLike = async () => jsonResponse({ id: PUB_A });
    const client = new AwinClient({
      token: TOKEN_A,
      publisherId: PUB_A,
      fetch: fetchImpl,
      env: {},
    });
    await client.getPublisher();
    expect(processLimiter.pendingCount).toBe(before);
  });

  it('candidate envelope reports considered/returned/truncated and omits missing lastSeen', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      advertiserId: i + 1,
      source: 'awin' as const,
      relationship: 'notjoined',
      approvalPercentage: 99,
    }));
    const envelope = buildCandidateListEnvelope(PUB_A, rows, { considered: 40, limit: 12 });
    expect(envelope.publisherId).toBe(PUB_A);
    expect(envelope.considered).toBe(40);
    expect(envelope.returned).toBe(12);
    expect(envelope.truncated).toBe(true);
    expect(envelope.candidates[0]).not.toHaveProperty('lastSeen');

    const withSeen = buildCandidateListEnvelope(
      PUB_A,
      [
        {
          advertiserId: 1,
          source: 'awin',
          relationship: 'notjoined',
          approvalPercentage: 99,
          lastSeen: DAY,
        },
        {
          advertiserId: 2,
          source: 'awin',
          relationship: 'notjoined',
          approvalPercentage: 99,
        },
      ],
      { limit: 12 },
    );
    expect(withSeen.truncated).toBe(false);
    expect(withSeen.candidates[0]?.lastSeen).toBe(DAY);
    expect(withSeen.candidates[1]).not.toHaveProperty('lastSeen');
  });
});
