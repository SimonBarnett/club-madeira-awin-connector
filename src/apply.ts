import { isJoinDryRun, MAX_APPLIES_PER_DAY, MIN_SUBMIT_INTERVAL_MS, type EnvLike } from './config';
import { validateMessage } from './criteria';
import { JoinQueue, type QueueState } from './queue';
import { runJoinWorker, type JoinWorkerResult } from './worker/stub';

export type ApplyOk = {
  ok: true;
  state: 'dry_run_done';
  advertiserId: number;
};

export type ApplyBlocked = {
  ok: false;
  reason: 'daily_cap' | 'interval' | 'needs_auth' | 'message_length';
  state?: QueueState;
  advertiserId: number;
  worker?: JoinWorkerResult;
};

export type ApplyResult = ApplyOk | ApplyBlocked;

export type ApplyOptions = {
  now?: number;
  dryRun?: boolean;
  env?: EnvLike;
  worker?: typeof runJoinWorker;
  message?: string;
};

/**
 * Dry-run default: record intent only. Never invent a join HTTP API.
 * When dry-run is off, the stub returns needs_auth — no Playwright Join.
 */
export async function applyJoin(
  queue: JoinQueue,
  advertiserId: number,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const now = opts.now ?? Date.now();
  const dryRun = opts.dryRun ?? isJoinDryRun(opts.env ?? process.env);

  const msg = validateMessage(opts.message);
  if (!msg.ok) {
    return { ok: false, reason: 'message_length', advertiserId };
  }

  if (queue.countAppliesOnUtcDay(now) >= MAX_APPLIES_PER_DAY) {
    return { ok: false, reason: 'daily_cap', advertiserId };
  }

  const last = queue.lastSubmitAt();
  if (last != null && now - last < MIN_SUBMIT_INTERVAL_MS) {
    return { ok: false, reason: 'interval', advertiserId };
  }

  if (!dryRun) {
    const worker = opts.worker ?? runJoinWorker;
    const result = await worker({ advertiserId });
    queue.recordBlockedNeedsUi(advertiserId);
    return {
      ok: false,
      reason: 'needs_auth',
      state: 'blocked_needs_ui',
      advertiserId,
      worker: result,
    };
  }

  queue.enqueueDryRun(advertiserId, { message: opts.message });
  queue.recordDryRun(advertiserId, now);
  return { ok: true, state: 'dry_run_done', advertiserId };
}
