export type JoinWorkerInput = {
  advertiserId: number;
};

export type JoinWorkerResult = {
  status: 'needs_auth';
};

/**
 * UI worker is gated on U1, U2, U6 and a Simon-provided advertiserId for T-UI-05.
 * Must not launch Playwright or click Join.
 */
export async function runJoinWorker(_input?: JoinWorkerInput): Promise<JoinWorkerResult> {
  return { status: 'needs_auth' };
}
