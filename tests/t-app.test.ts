import { describe, expect, it } from 'vitest';
import { applyJoin } from '../src/apply';
import { DEFAULT_DRY_RUN, isJoinDryRun, MAX_APPLIES_PER_DAY, MIN_SUBMIT_INTERVAL_MS } from '../src/config';
import { rankJoinCandidates, type SelectInput } from '../src/criteria';
import { JoinQueue } from '../src/queue';
import { runJoinWorker } from '../src/worker/stub';

const DAY = Date.UTC(2026, 8, 19, 12, 0, 0);
const PUBLISHER_ID = 1111111;

function queue(): JoinQueue {
  return new JoinQueue({ publisherId: PUBLISHER_ID, persist: false });
}

describe('T-APP', () => {
  it('T-APP-01 Dry-run apply records dry_run_done and invents no join HTTP', async () => {
    expect(DEFAULT_DRY_RUN).toBe(true);
    expect(isJoinDryRun({})).toBe(true);

    let httpCalls = 0;
    const q = queue();
    const result = await applyJoin(q, 42, {
      now: DAY,
      dryRun: true,
      env: { AWIN_JOIN_DRY_RUN: 'true' },
      worker: async () => {
        httpCalls += 1;
        throw new Error('worker must not run in dry-run');
      },
    });

    expect(result).toEqual({ ok: true, state: 'dry_run_done', advertiserId: 42 });
    expect(q.get(42)?.state).toBe('dry_run_done');
    expect(httpCalls).toBe(0);
  });

  it('T-APP-02 21st apply same day is blocked by daily cap', async () => {
    const q = queue();
    for (let i = 0; i < MAX_APPLIES_PER_DAY; i += 1) {
      const r = await applyJoin(q, 1000 + i, { now: DAY + i * MIN_SUBMIT_INTERVAL_MS, dryRun: true });
      expect(r.ok).toBe(true);
    }
    const blocked = await applyJoin(q, 2000, {
      now: DAY + MAX_APPLIES_PER_DAY * MIN_SUBMIT_INTERVAL_MS,
      dryRun: true,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('daily_cap');
    expect(q.get(2000)?.state).not.toBe('dry_run_done');
  });

  it('T-APP-03 Second submit under 30s is blocked by interval', async () => {
    const q = queue();
    const first = await applyJoin(q, 7, { now: DAY, dryRun: true });
    expect(first.ok).toBe(true);
    const second = await applyJoin(q, 8, { now: DAY + MIN_SUBMIT_INTERVAL_MS - 1, dryRun: true });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('interval');
    const third = await applyJoin(q, 8, { now: DAY + MIN_SUBMIT_INTERVAL_MS, dryRun: true });
    expect(third.ok).toBe(true);
  });

  it('T-APP-04 list_join_candidates orders LastSeen DESC', () => {
    const rows: SelectInput[] = [
      {
        advertiserId: 1,
        source: 'rds',
        productFeed: 'Yes',
        joined: 0,
        approvalRate: 99,
        lastSeen: DAY - 3000,
      },
      {
        advertiserId: 2,
        source: 'rds',
        productFeed: 'Yes',
        joined: 0,
        approvalRate: 100,
        lastSeen: DAY,
      },
      {
        advertiserId: 3,
        source: 'rds',
        productFeed: 'Yes',
        joined: 0,
        approvalRate: 99.5,
        lastSeen: DAY - 1000,
      },
      {
        advertiserId: 4,
        source: 'rds',
        productFeed: 'No',
        joined: 0,
        approvalRate: 100,
        lastSeen: DAY + 5000,
      },
    ];
    const ranked = rankJoinCandidates(rows, DAY);
    expect(ranked.map((r) => r.advertiserId)).toEqual([2, 3, 1]);
  });

  it('P3 worker stub returns needs_auth and does not join', async () => {
    const stub = await runJoinWorker({ advertiserId: 9 });
    expect(stub).toEqual({ status: 'needs_auth' });

    const q = queue();
    const result = await applyJoin(q, 9, { now: DAY, dryRun: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('needs_auth');
      expect(result.state).toBe('blocked_needs_ui');
      expect(result.worker).toEqual({ status: 'needs_auth' });
    }
    expect(q.get(9)?.state).toBe('blocked_needs_ui');
  });
});
