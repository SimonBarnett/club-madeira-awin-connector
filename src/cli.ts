import { readFile } from 'node:fs/promises';
import { AwinClient } from './awin/client';
import { logRedacted, redact, redactedError } from './awin/redact';
import { readApprovalPercentage, type ProgrammeDetails } from './awin/types';
import {
  INTERACTIVE_BATCH_MAX,
  RELATIONSHIPS,
  isJoinDryRun,
  type EnvLike,
} from './config';
import { buildCandidateListEnvelope, type SelectInput } from './criteria';
import { createPublisherContext, type PublisherContext } from './publisher';

type Command = 'list_join_candidates' | 'relationship_status' | 'help';

export type CliArgs = {
  command: Command;
  fixture?: string;
  advertiserId?: number;
  publisherId?: string;
};

export type CliIo = {
  log: (s: string) => void;
  error: (s: string) => void;
};

function takeFlag(rest: string[], name: string): string | undefined {
  const eq = `--${name}=`;
  const idx = rest.findIndex((a) => a === `--${name}` || a.startsWith(eq));
  if (idx < 0) return undefined;
  const token = rest[idx] ?? '';
  if (token.startsWith(eq)) return token.slice(eq.length);
  return rest[idx + 1];
}

export function parseArgs(argv: string[]): CliArgs {
  const rest = argv.slice(2);
  const positional = rest.filter((a) => !a.startsWith('-'));
  const commandRaw = positional[0] ?? 'help';
  const fixture = takeFlag(rest, 'fixture');
  const advertiserRaw = takeFlag(rest, 'advertiserId');
  const publisherId = takeFlag(rest, 'publisherId');
  const advertiserId = advertiserRaw ? Number(advertiserRaw) : undefined;

  if (commandRaw === 'list_join_candidates' || commandRaw === 'relationship_status' || commandRaw === 'help') {
    return { command: commandRaw, fixture, advertiserId, publisherId };
  }
  return { command: 'help', fixture, advertiserId, publisherId };
}

export function help(ctx?: PublisherContext): string {
  const idLine = ctx
    ? `publisherId ${ctx.publisherId} (from --publisherId or AWIN_PUBLISHER_ID)`
    : 'publisherId required: --publisherId <id> or env AWIN_PUBLISHER_ID (no default tenant)';
  return [
    'club-madeira-awin-connector',
    idLine,
    '',
    'Commands:',
    '  list_join_candidates --publisherId ID [--fixture path.json]',
    '  relationship_status --publisherId ID [--advertiserId N]',
    '',
    'Live calls need AWIN_ACCESS_TOKEN. Dry-run default AWIN_JOIN_DRY_RUN=true.',
    'Do not click Join. There is no join write API.',
  ].join('\n');
}

function emit(io: CliIo, value: unknown): void {
  logRedacted(typeof value === 'string' ? value : JSON.stringify(value, null, 2), io.log);
}

async function loadFixture(path: string): Promise<SelectInput[]> {
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) {
    throw redactedError('fixture is not a JSON array');
  }
  return data as SelectInput[];
}

export async function listJoinCandidates(
  ctx: PublisherContext,
  opts: {
    fixture?: string;
    env?: EnvLike;
    client?: AwinClient;
  } = {},
): Promise<ReturnType<typeof buildCandidateListEnvelope>> {
  const env = opts.env ?? process.env;
  let rows: SelectInput[];
  let considered: number;
  if (opts.fixture) {
    rows = await loadFixture(opts.fixture);
    considered = rows.length;
  } else {
    const client =
      opts.client ??
      new AwinClient({
        publisherId: ctx.publisherId,
        env,
      });
    const programmes = await client.getProgrammes('notjoined');
    considered = programmes.length;
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
  return buildCandidateListEnvelope(ctx.publisherId, rows, {
    considered,
    limit: INTERACTIVE_BATCH_MAX,
  });
}

export async function relationshipStatus(
  ctx: PublisherContext,
  opts: {
    advertiserId?: number;
    env?: EnvLike;
    client?: AwinClient;
  } = {},
): Promise<unknown> {
  const env = opts.env ?? process.env;
  const client =
    opts.client ??
    new AwinClient({
      publisherId: ctx.publisherId,
      env,
    });
  const advertiserId = opts.advertiserId;
  if (advertiserId != null && Number.isFinite(advertiserId)) {
    const details: ProgrammeDetails = await client.getProgrammeDetails(advertiserId, 'any');
    return {
      publisherId: ctx.publisherId,
      advertiserId,
      approvalPercentage: readApprovalPercentage(details),
      programmeInfo: details.programmeInfo,
    };
  }
  const counts: Record<string, number> = {};
  for (const rel of RELATIONSHIPS) {
    if (rel === 'any') continue;
    const list = await client.getProgrammes(rel);
    counts[rel] = list.length;
  }
  return { publisherId: ctx.publisherId, counts };
}

function resolveContext(args: CliArgs, env: EnvLike): PublisherContext {
  return createPublisherContext({ publisherId: args.publisherId, env });
}

export async function runCli(
  argv: string[],
  env: EnvLike = process.env,
  io: CliIo = { log: (s) => console.log(s), error: (s) => console.error(s) },
): Promise<number> {
  const args = parseArgs(argv);
  try {
    if (args.command === 'help') {
      let ctx: PublisherContext | undefined;
      try {
        if (args.publisherId || env.AWIN_PUBLISHER_ID) ctx = resolveContext(args, env);
      } catch {
        ctx = undefined;
      }
      emit(io, help(ctx));
      return 0;
    }
    const ctx = resolveContext(args, env);
    if (args.command === 'list_join_candidates') {
      const envelope = await listJoinCandidates(ctx, { fixture: args.fixture, env });
      emit(io, { ...envelope, dryRun: isJoinDryRun(env) });
      return 0;
    }
    const status = await relationshipStatus(ctx, { advertiserId: args.advertiserId, env });
    emit(io, status);
    return 0;
  } catch (err) {
    logRedacted(err instanceof Error ? err.message : err, io.error);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runCli(process.argv, process.env);
  if (code !== 0) process.exitCode = code;
}

const isMain = process.argv[1] && /cli\.[cm]?[jt]s$/.test(process.argv[1].replaceAll('\\', '/'));
if (isMain) {
  void main();
}

export { redact };
