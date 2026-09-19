export const API_BASE = 'https://api.awin.com';

export const TOKEN_UI_URL = 'https://ui.awin.com/awin-api';

/** Official help cap. Not 170. */
export const MESSAGE_MAX = 150;

/** Client budget under Awin's 20/min throttle. */
export const CLIENT_CALLS_PER_MIN = 18;

export const RATE_WINDOW_MS = 60_000;

export const MAX_APPLIES_PER_DAY = 20;

export const MIN_SUBMIT_INTERVAL_MS = 30_000;

export const PROGRAMMES_CACHE_MS = 15 * 60_000;

export const INTERACTIVE_BATCH_MIN = 6;

export const INTERACTIVE_BATCH_MAX = 12;

export const CRON_BATCH = 12;

export const MIN_APPROVAL_RATE = 99;

export const GLOBAL_EXCLUDE_DAYS = 90;

/** AWIN_JOIN_DRY_RUN default until T-UI-05. */
export const DEFAULT_DRY_RUN = true;

/**
 * Join write API does not exist in public catalogues until U7 is yes.
 * Do not invent an endpoint. UI path only.
 */
export const JOIN_WRITE_API: null = null;

export const RELATIONSHIPS = [
  'joined',
  'pending',
  'suspended',
  'rejected',
  'notjoined',
  'any',
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];

export type EnvLike = Record<string, string | undefined>;

/** True unless AWIN_JOIN_DRY_RUN is explicitly false/0. */
export function isJoinDryRun(env: EnvLike = process.env): boolean {
  const raw = env.AWIN_JOIN_DRY_RUN;
  if (raw === undefined || raw === '') return DEFAULT_DRY_RUN;
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

/**
 * Live calls need AWIN_ACCESS_TOKEN. Never log the value.
 * Do not guess AWIN_PROMOTION_TYPE (U1).
 */
export function readAccessToken(env: EnvLike = process.env): string | undefined {
  const t = env.AWIN_ACCESS_TOKEN;
  if (!t) return undefined;
  return t;
}

/** U1 — unset until operator fills the live modal option. Do not guess. */
export function readPromotionType(env: EnvLike = process.env): string | undefined {
  const t = env.AWIN_PROMOTION_TYPE;
  if (!t) return undefined;
  return t;
}

/** Optional per-tenant promotion URL. Never defaulted to a named advertiser. */
export function readPromotionUrl(env: EnvLike = process.env): string | undefined {
  const t = env.AWIN_PROMOTION_URL;
  if (!t) return undefined;
  return t;
}
