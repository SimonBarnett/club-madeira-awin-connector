import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { redactedError } from './awin/redact';

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

export type JoinQueueOptions = {
  publisherId: number;
  dataDir?: string;
  persist?: boolean;
  seed?: QueueItem[];
  path?: string;
};

export const DEFAULT_DATA_DIR = 'data';

export function joinQueuePath(publisherId: number, dataDir: string = DEFAULT_DATA_DIR): string {
  return join(dataDir, 'join-queue', `${publisherId}.json`);
}

function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

type PersistedQueue = {
  publisherId: number;
  items: QueueItem[];
};

/**
 * Join queue keyed by publisherId. When persist is on (default), load/save
 * under data/join-queue/{publisherId}.json so daily caps survive restart.
 */
export class JoinQueue {
  readonly publisherId: number;
  private readonly persistPath: string | null;
  private readonly items = new Map<number, QueueItem>();

  constructor(opts: JoinQueueOptions) {
    this.publisherId = opts.publisherId;
    const persist = opts.persist ?? true;
    this.persistPath = persist
      ? (opts.path ?? joinQueuePath(opts.publisherId, opts.dataDir ?? DEFAULT_DATA_DIR))
      : null;
    if (this.persistPath) this.load();
    if (opts.seed) {
      for (const item of opts.seed) {
        this.items.set(item.advertiserId, cloneItem(item));
      }
      this.save();
    }
  }

  get filePath(): string | null {
    return this.persistPath;
  }

  get(advertiserId: number): QueueItem | undefined {
    const item = this.items.get(advertiserId);
    return item ? cloneItem(item) : undefined;
  }

  list(): QueueItem[] {
    return [...this.items.values()].map(cloneItem);
  }

  ensure(advertiserId: number, extras: Partial<QueueItem> = {}): QueueItem {
    const existing = this.items.get(advertiserId);
    if (existing) {
      Object.assign(existing, extras);
      if (extras.applyTimestamps) existing.applyTimestamps = [...extras.applyTimestamps];
      this.save();
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
    this.save();
    return created;
  }

  setState(advertiserId: number, state: QueueState): QueueItem {
    const item = this.ensure(advertiserId);
    item.state = state;
    this.save();
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
    this.save();
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

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.persistPath, 'utf8'));
    } catch (err) {
      throw redactedError(
        `JoinQueue file is not valid JSON: ${this.persistPath}: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      throw redactedError(`JoinQueue file is not an object: ${this.persistPath}`);
    }
    const body = parsed as PersistedQueue;
    if (body.publisherId !== this.publisherId) {
      throw redactedError(
        `JoinQueue publisherId mismatch: file ${body.publisherId} vs ${this.publisherId}`,
      );
    }
    if (!Array.isArray(body.items)) {
      throw redactedError(`JoinQueue file items is not an array: ${this.persistPath}`);
    }
    for (const item of body.items) {
      this.items.set(item.advertiserId, cloneItem(item));
    }
  }

  private save(): void {
    if (!this.persistPath) return;
    mkdirSync(dirname(this.persistPath), { recursive: true });
    const body: PersistedQueue = {
      publisherId: this.publisherId,
      items: this.list(),
    };
    writeFileSync(this.persistPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  }
}

function cloneItem(item: QueueItem): QueueItem {
  return {
    ...item,
    applyTimestamps: [...(item.applyTimestamps ?? [])],
  };
}
