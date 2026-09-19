export const QUEUE_STATES = [
  'candidate',
  'dry_run_queued',
  'dry_run_done',
  'blocked_needs_ui',
  'applied_pending',
] as const;

export type QueueState = (typeof QUEUE_STATES)[number];

export type QueueItem = {
  advertiserId: number;
  state: QueueState;
  lastSeen?: number;
  message?: string;
  applyTimestamps: number[];
  lastSubmitAt?: number;
};

function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export class JoinQueue {
  private readonly items = new Map<number, QueueItem>();

  constructor(seed: QueueItem[] = []) {
    for (const item of seed) {
      this.items.set(item.advertiserId, {
        ...item,
        applyTimestamps: [...item.applyTimestamps],
      });
    }
  }

  get(advertiserId: number): QueueItem | undefined {
    return this.items.get(advertiserId);
  }

  list(): QueueItem[] {
    return [...this.items.values()].map((item) => ({
      ...item,
      applyTimestamps: [...item.applyTimestamps],
    }));
  }

  ensure(advertiserId: number, extras: Partial<QueueItem> = {}): QueueItem {
    const existing = this.items.get(advertiserId);
    if (existing) {
      Object.assign(existing, extras);
      return existing;
    }
    const created: QueueItem = {
      advertiserId,
      state: extras.state ?? 'candidate',
      lastSeen: extras.lastSeen,
      message: extras.message,
      applyTimestamps: extras.applyTimestamps ? [...extras.applyTimestamps] : [],
      lastSubmitAt: extras.lastSubmitAt,
    };
    this.items.set(advertiserId, created);
    return created;
  }

  setState(advertiserId: number, state: QueueState): QueueItem {
    const item = this.ensure(advertiserId);
    item.state = state;
    return item;
  }

  enqueueDryRun(advertiserId: number, extras: Partial<QueueItem> = {}): QueueItem {
    return this.ensure(advertiserId, { ...extras, state: 'dry_run_queued' });
  }

  recordDryRun(advertiserId: number, now: number): QueueItem {
    const item = this.ensure(advertiserId);
    item.state = 'dry_run_done';
    item.applyTimestamps.push(now);
    item.lastSubmitAt = now;
    return item;
  }

  recordBlockedNeedsUi(advertiserId: number): QueueItem {
    return this.setState(advertiserId, 'blocked_needs_ui');
  }

  countAppliesOnUtcDay(now: number): number {
    const day = utcDay(now);
    let n = 0;
    for (const item of this.items.values()) {
      for (const ts of item.applyTimestamps) {
        if (utcDay(ts) === day) n += 1;
      }
    }
    return n;
  }

  lastSubmitAt(): number | undefined {
    let max: number | undefined;
    for (const item of this.items.values()) {
      if (item.lastSubmitAt == null) continue;
      if (max == null || item.lastSubmitAt > max) max = item.lastSubmitAt;
    }
    return max;
  }
}
