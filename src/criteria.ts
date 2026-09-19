import {
  GLOBAL_EXCLUDE_DAYS,
  MESSAGE_MAX,
  MIN_APPROVAL_RATE,
  type Relationship,
} from './config';
import { readApprovalPercentage, type Programme, type ProgrammeDetails } from './awin/types';

export type CandidateSource = 'rds' | 'awin';

export type SelectInput = {
  advertiserId: number;
  source?: CandidateSource;
  productFeed?: boolean | 'Yes' | 'No' | 'yes' | 'no' | 1 | 0 | string;
  joined?: number | boolean;
  approvalRate?: number;
  approvalPercentage?: number;
  mode?: string;
  lastGlobalAt?: number | string | Date;
  lastSeen?: number | string | Date;
  relationship?: Relationship | string;
  message?: string;
};

export type SelectResult = {
  pass: boolean;
  reasons: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function toTime(value: number | string | Date | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isProductFeedYes(value: SelectInput['productFeed']): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'yes') return true;
  return false;
}

function isJoined(value: SelectInput['joined']): boolean {
  if (value === true || value === 1) return true;
  return false;
}

function isGlobalWithin90d(input: SelectInput, now: number): boolean {
  if ((input.mode ?? '').trim().toLowerCase() !== 'global') return false;
  const at = toTime(input.lastGlobalAt ?? input.lastSeen);
  if (!at) return true;
  return now - at <= GLOBAL_EXCLUDE_DAYS * DAY_MS;
}

export function validateMessage(
  message: string | undefined,
): { ok: true } | { ok: false; reason: 'message_length'; length: number } {
  if (message == null) return { ok: true };
  if (message.length > MESSAGE_MAX) {
    return { ok: false, reason: 'message_length', length: message.length };
  }
  return { ok: true };
}

function resolveApproval(input: SelectInput): number | undefined {
  if (typeof input.approvalRate === 'number') return input.approvalRate;
  if (typeof input.approvalPercentage === 'number') return input.approvalPercentage;
  return undefined;
}

function isRds(input: SelectInput): boolean {
  if (input.source === 'rds') return true;
  if (input.source === 'awin') return false;
  return input.productFeed != null || input.joined != null || input.mode != null;
}

/**
 * RDS: ProductFeed=Yes, Joined=0, ApprovalRate≥99, exclude Mode=global within 90d.
 * No RDS: relationship=notjoined + approvalPercentage only.
 * Message >150 is always rejected when provided.
 */
export function evaluateCandidate(input: SelectInput, now: number = Date.now()): SelectResult {
  const reasons: string[] = [];
  const approval = resolveApproval(input);
  if (approval == null || approval < MIN_APPROVAL_RATE) {
    reasons.push('approval');
  }

  const msg = validateMessage(input.message);
  if (!msg.ok) reasons.push('message_length');

  if (isRds(input)) {
    if (!isProductFeedYes(input.productFeed)) reasons.push('product_feed');
    if (isJoined(input.joined)) reasons.push('already_joined');
    if (isGlobalWithin90d(input, now)) reasons.push('global_90d');
  } else if ((input.relationship ?? 'notjoined') !== 'notjoined') {
    reasons.push('relationship');
  }

  return { pass: reasons.length === 0, reasons };
}

export function rankJoinCandidates(rows: SelectInput[], now: number = Date.now()): SelectInput[] {
  return rows
    .filter((row) => evaluateCandidate(row, now).pass)
    .sort((a, b) => toTime(b.lastSeen) - toTime(a.lastSeen));
}

/** Fallback when U5 RDS is unavailable: notjoined + programmedetails.kpi.approvalPercentage. */
export function selectFromAwin(
  programmes: Programme[],
  detailsById: Record<number, ProgrammeDetails | undefined>,
): number[] {
  const ids: number[] = [];
  for (const programme of programmes) {
    if ((programme.relationship ?? 'notjoined') !== 'notjoined') continue;
    const details = detailsById[programme.id];
    const pct = readApprovalPercentage(details);
    if (pct == null || pct < MIN_APPROVAL_RATE) continue;
    ids.push(programme.id);
  }
  return ids;
}
