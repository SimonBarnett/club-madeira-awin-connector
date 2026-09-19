import type { Relationship } from '../config';

export type { Relationship };

export type Programme = {
  id: number;
  name?: string;
  relationship?: Relationship | string;
  [key: string]: unknown;
};

export type ProgrammeDetails = {
  programmeInfo?: {
    id?: number;
    name?: string;
    [key: string]: unknown;
  };
  kpi?: {
    approvalPercentage?: number;
    [key: string]: unknown;
  };
  approvalPercentage?: number;
  [key: string]: unknown;
};

export type Publisher = {
  id?: number;
  name?: string;
  [key: string]: unknown;
};

export function readApprovalPercentage(details: ProgrammeDetails | undefined): number | undefined {
  if (!details) return undefined;
  const fromKpi = details.kpi?.approvalPercentage;
  if (typeof fromKpi === 'number') return fromKpi;
  if (typeof details.approvalPercentage === 'number') return details.approvalPercentage;
  return undefined;
}
