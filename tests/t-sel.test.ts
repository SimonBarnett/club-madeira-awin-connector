import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX, MIN_APPROVAL_RATE } from '../src/config';
import {
  evaluateCandidate,
  selectFromAwin,
  validateMessage,
  type SelectInput,
} from '../src/criteria';

const NOW = Date.UTC(2026, 8, 19);

function rdsPass(over: Partial<SelectInput> = {}): SelectInput {
  return {
    advertiserId: 1001,
    source: 'rds',
    productFeed: 'Yes',
    joined: 0,
    approvalRate: MIN_APPROVAL_RATE,
    mode: 'normal',
    lastSeen: NOW,
    message: 'ok',
    ...over,
  };
}

describe('T-SEL', () => {
  it('T-SEL-01 ApprovalRate 98.9 is rejected', () => {
    const result = evaluateCandidate(rdsPass({ approvalRate: 98.9 }), NOW);
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain('approval');
  });

  it('T-SEL-02 ApprovalRate 99.0 passes given other flags', () => {
    const result = evaluateCandidate(rdsPass({ approvalRate: 99.0 }), NOW);
    expect(result.pass).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('T-SEL-03 Message 151 chars is rejected', () => {
    const message = 'x'.repeat(MESSAGE_MAX + 1);
    expect(message.length).toBe(151);
    expect(validateMessage(message).ok).toBe(false);
    const result = evaluateCandidate(rdsPass({ message }), NOW);
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain('message_length');
  });

  it('T-SEL-04 Message 150 chars passes', () => {
    const message = 'y'.repeat(MESSAGE_MAX);
    expect(message.length).toBe(150);
    expect(validateMessage(message).ok).toBe(true);
    const result = evaluateCandidate(rdsPass({ message }), NOW);
    expect(result.pass).toBe(true);
  });

  it('T-SEL-05 Global mode within 90d is excluded', () => {
    const within = evaluateCandidate(
      rdsPass({
        mode: 'global',
        lastGlobalAt: NOW - 10 * 24 * 60 * 60 * 1000,
      }),
      NOW,
    );
    expect(within.pass).toBe(false);
    expect(within.reasons).toContain('global_90d');

    const outside = evaluateCandidate(
      rdsPass({
        mode: 'global',
        lastGlobalAt: NOW - 91 * 24 * 60 * 60 * 1000,
      }),
      NOW,
    );
    expect(outside.pass).toBe(true);
  });

  it('T-SEL-06 No RDS path uses notjoined + approvalPercentage', () => {
    const programmes = [
      { id: 11, relationship: 'notjoined' },
      { id: 12, relationship: 'joined' },
      { id: 13, relationship: 'notjoined' },
      { id: 14, relationship: 'notjoined' },
    ];
    const detailsById = {
      11: { kpi: { approvalPercentage: 99.5 } },
      12: { kpi: { approvalPercentage: 100 } },
      13: { kpi: { approvalPercentage: 80 } },
      14: { approvalPercentage: 99 },
    };
    expect(selectFromAwin(programmes, detailsById)).toEqual([11, 14]);

    const awinPass = evaluateCandidate(
      {
        advertiserId: 11,
        source: 'awin',
        relationship: 'notjoined',
        approvalPercentage: 99.5,
      },
      NOW,
    );
    expect(awinPass.pass).toBe(true);

    const awinJoined = evaluateCandidate(
      {
        advertiserId: 12,
        source: 'awin',
        relationship: 'joined',
        approvalPercentage: 100,
      },
      NOW,
    );
    expect(awinJoined.pass).toBe(false);
    expect(awinJoined.reasons).toContain('relationship');
  });
});
