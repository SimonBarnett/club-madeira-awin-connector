import { readFile } from 'node:fs/promises';
import { AwinClient } from './awin/client';
import { logRedacted, redact, redactedError } from './awin/redact';
import { readApprovalPercentage, type ProgrammeDetails } from './awin/types';
import { INTERACTIVE_BATCH_MAX, PUBLISHER_ID, RELATIONSHIPS } from './config';
import { rankJoinCandidates, type SelectInput } from './criteria';

type Command = 'list_join_candidates' | 'relationship_status' | 'help';

function parseArgs(argv: string[]): { command: Command; fixture?: string; advertiserId?: number } {
  const rest = argv.slice(2);
  const command = (rest[0] ?? 'help') as string;
  const fixtureIdx = rest.indexOf('--fixture');
  const idIdx = rest.indexOf('--advertiserId');
  const fixture = fixtureIdx >= 0 ? rest[fixtureIdx + 1] : undefined;
  const advertiserRaw = idIdx >= 0 ? rest[idIdx + 1] : undefined;
  const advertiserId = advertiserRaw ? Number(advertiserRaw) : undefined;

  if (command === 'list_join_candidates' || command === 'relationship_status' || command === 'help') {
    return { command, fixture, advertiserId };
  }
  return { command: 'help' };
}

function help(): string {
  return [
    'club-madeira-awin-connector',
    `publisher ${PUBLISHER_ID}`,
    '',
    'Commands:',
    '  list_join_candidates [--fixture path.json]',
    '  relationship_status [--advertiserId N]',
    '',
    'Live calls need AWIN_ACCESS_TOKEN. Dry-run default AWIN_JOIN_DRY_RUN=true.',
    'Do not click Join. There is no join write API.',
  ].join('\n');
}

async function loadFixture(path: string): Promise<SelectInput[]> {
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) {
    throw redactedError('fixture is not a JSON array');
  }
  return data as SelectInput[];
}

async function listJoinCandidates(fixture?: string): Promise<void> {
  let rows: SelectInput[];
  if (fixture) {
    rows = await loadFixture(fixture);
  } else {
    const client = new AwinClient();
    const programmes = await client.getProgrammes('notjoined');
    const batch = programmes.slice(0, INTERACTIVE_BATCH_MAX);
    rows = [];
    for (const programme of batch) {
      const details = await client.getProgrammeDetails(programme.id, 'notjoined');
      rows.push({
        advertiserId: programme.id,
        source: 'awin',
        relationship: 'notjoined',
        approvalPercentage: readApprovalPercentage(details),
      });
    }
  }
  const ranked = rankJoinCandidates(rows);
  const out = ranked.map((row) => ({
    advertiserId: row.advertiserId,
    approvalRate: row.approvalRate ?? row.approvalPercentage,
    lastSeen: row.lastSeen,
    relationship: row.relationship,
  }));
  logRedacted(JSON.stringify(out, null, 2), console.log);
}

async function relationshipStatus(advertiserId?: number): Promise<void> {
  const client = new AwinClient();
  if (advertiserId != null && Number.isFinite(advertiserId)) {
    const details: ProgrammeDetails = await client.getProgrammeDetails(advertiserId, 'any');
    logRedacted(
      JSON.stringify(
        {
          advertiserId,
          approvalPercentage: readApprovalPercentage(details),
          programmeInfo: details.programmeInfo,
        },
        null,
        2,
      ),
      console.log,
    );
    return;
  }
  const counts: Record<string, number> = {};
  for (const rel of RELATIONSHIPS) {
    if (rel === 'any') continue;
    const list = await client.getProgrammes(rel);
    counts[rel] = list.length;
  }
  logRedacted(JSON.stringify({ publisherId: PUBLISHER_ID, counts }, null, 2), console.log);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  try {
    if (args.command === 'help') {
      console.log(help());
      return;
    }
    if (args.command === 'list_join_candidates') {
      await listJoinCandidates(args.fixture);
      return;
    }
    await relationshipStatus(args.advertiserId);
  } catch (err) {
    logRedacted(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && /cli\.[cm]?[jt]s$/.test(process.argv[1].replaceAll('\\', '/'));
if (isMain) {
  void main();
}

export { help, parseArgs, redact };
