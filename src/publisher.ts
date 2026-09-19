import type { EnvLike } from './config';

export type PublisherIdSource = {
  publisherId?: number | string;
  env?: EnvLike;
};

export class MissingPublisherIdError extends Error {
  constructor() {
    super('Missing publisher id. Pass --publisherId or set AWIN_PUBLISHER_ID.');
    this.name = 'MissingPublisherIdError';
  }
}

export class InvalidPublisherIdError extends Error {
  constructor(raw: string | number) {
    super(`Invalid publisher id: ${raw}`);
    this.name = 'InvalidPublisherIdError';
  }
}

/** Tenant identity. Publisher id is injected; there is no default tenant. */
export type PublisherContext = {
  publisherId: number;
};

function normalizePublisherId(raw: number | string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw <= 0) {
      throw new InvalidPublisherIdError(raw);
    }
    return raw;
  }
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new InvalidPublisherIdError(trimmed);
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidPublisherIdError(trimmed);
  }
  return n;
}

/**
 * Resolve publisher id from an explicit value, then AWIN_PUBLISHER_ID.
 * Missing id is a hard error. There is no compiled default.
 */
export function readPublisherId(source: PublisherIdSource = {}): number {
  const env = source.env ?? process.env;
  const fromOpt = normalizePublisherId(source.publisherId);
  if (fromOpt != null) return fromOpt;
  const fromEnv = normalizePublisherId(env.AWIN_PUBLISHER_ID);
  if (fromEnv != null) return fromEnv;
  throw new MissingPublisherIdError();
}

export function createPublisherContext(source: PublisherIdSource = {}): PublisherContext {
  return { publisherId: readPublisherId(source) };
}
