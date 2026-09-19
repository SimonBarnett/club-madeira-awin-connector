# Merc hostile MRB evidence — 2026-09-19

**Repo:** club-madeira-awin-connector  
**Default branch:** `main`  
**Evidence collected against:** `0666b74978dcb70cd5cefdda7c076ea6d24b16d6`  
**This PR:** evidence document only. No product code changes.

This is **not** a Merc PASS. This is **not** product ship UAT. This does **not** invent or claim a join write API.

## 1. HEAD at evidence time

```text
$ git rev-parse HEAD
0666b74978dcb70cd5cefdda7c076ea6d24b16d6

$ git log -1 --oneline
0666b74 docs: hostile MRB P5 PASS - ready for Merc hostile test

$ git log -5 --oneline
0666b74 docs: hostile MRB P5 PASS - ready for Merc hostile test
a3ec1c7 P5: inject publisher id; persist per-tenant queue
05eee18 docs: park publisher-agnostic hostile MRB (HOLD/REWORK; supersedes v1 for agent hand-off)
b4e13dc chore: remove accidental MRB PDF probe
48f160e docs: hostile MRB v1 - PASS-ready-for-human-UAT (P0-P4; Join deferred)
```

`0666b74` is the docs commit immediately after P5 code `a3ec1c7`. Tree under `src/` at this SHA is the P5 injection + dry-run stub tree.

**Runtime:** Node v22.14.0 · npm 10.9.7 · `npm install` 55 packages, 56 audited.

## 2. `npm test`

```text
$ npm test

> club-madeira-awin-connector@0.1.0 test
> vitest run

 RUN  v3.2.7 /workspace

 ✓ tests/t-app.test.ts (5 tests) 5ms
 ✓ tests/t-api.test.ts (5 tests) 19ms
 ✓ tests/t-id.test.ts (8 tests) 38ms
 ✓ tests/t-sel.test.ts (6 tests) 3ms
 ✓ tests/t-rate.test.ts (2 tests) 18ms
 ✓ tests/t-red.test.ts (3 tests) 19ms

 Test Files  6 passed (6)
      Tests  29 passed (29)
   Start at  18:47:55
   Duration  443ms
```

| Result | Count |
|---|---|
| Test files passed | 6 / 6 |
| Tests passed | 29 / 29 |
| Failures | **0** |

Suite includes T-ID (missing id throws; injected id in URL; two ids isolated; no compiled `2889699` in `src/`), T-APP (dry-run `dry_run_done`; daily cap; interval; worker `needs_auth`).

## 3. `npm run typecheck`

```text
$ npm run typecheck

> club-madeira-awin-connector@0.1.0 typecheck
> tsc --noEmit

TYPECHECK_EXIT=0
```

`tsc --noEmit` clean. No equivalent extra checker was required; `package.json` script is `typecheck`.

## 4. CLI dry-run — publisher `9999999` (not Club Madeira)

No `AWIN_*` env was set in the shell unless stated. Fixture used so the **read** client is not called:

```json
[{"advertiserId":42,"source":"awin","relationship":"notjoined","approvalPercentage":99}]
```

### 4.1 `--publisherId 9999999` (dry-run env unset → default true)

```text
$ unset AWIN_PUBLISHER_ID AWIN_JOIN_DRY_RUN AWIN_ACCESS_TOKEN
$ npm run cli -- list_join_candidates --publisherId 9999999 --fixture /tmp/mrb-merc-fixture-9999999.json
EXIT=0
```

```json
{
  "publisherId": 9999999,
  "considered": 1,
  "returned": 1,
  "truncated": false,
  "candidates": [
    {
      "advertiserId": 42,
      "approvalRate": 99,
      "relationship": "notjoined"
    }
  ],
  "dryRun": true
}
```

Envelope `publisherId` is **9999999**, not 2889699. `dryRun` is **true** with `AWIN_JOIN_DRY_RUN` unset. No live join attempted (fixture path; no token; no Playwright).

### 4.2 `AWIN_PUBLISHER_ID=9999999` (no `--publisherId`)

```text
$ AWIN_PUBLISHER_ID=9999999 npm run cli -- list_join_candidates --fixture /tmp/mrb-merc-fixture-9999999.json
EXIT=0
```

Same envelope: `"publisherId": 9999999`, `"dryRun": true`.

### 4.3 Flag wins over env

```text
$ AWIN_PUBLISHER_ID=1111111 npm run cli -- list_join_candidates --publisherId 9999999 --fixture /tmp/mrb-merc-fixture-9999999.json
EXIT=0
```

Envelope still `"publisherId": 9999999`. `--publisherId` wins.

### 4.4 Missing publisher id fails loudly (non-zero)

```text
$ unset AWIN_PUBLISHER_ID
$ npm run cli -- list_join_candidates --fixture /tmp/mrb-merc-fixture-9999999.json
Missing publisher id. Pass --publisherId or set AWIN_PUBLISHER_ID.
EXIT=1

$ npm run cli -- relationship_status
Missing publisher id. Pass --publisherId or set AWIN_PUBLISHER_ID.
EXIT=1
```

Help (no id) names both injection sources and states there is no default tenant:

```text
$ npm run cli -- help
EXIT=0

club-madeira-awin-connector
publisherId required: --publisherId <id> or env AWIN_PUBLISHER_ID (no default tenant)

Commands:
  list_join_candidates --publisherId ID [--fixture path.json]
  relationship_status --publisherId ID [--advertiserId N]

Live calls need AWIN_ACCESS_TOKEN. Dry-run default AWIN_JOIN_DRY_RUN=true.
Do not click Join. There is no join write API.
```

### 4.5 No fixture + no token: read-auth fail, not a join

```text
$ unset AWIN_ACCESS_TOKEN
$ npm run cli -- list_join_candidates --publisherId 9999999
Missing AWIN_ACCESS_TOKEN
EXIT=1
```

This is the **read** client refusing to call `api.awin.com` without a token. It is **not** a join. No Join HTTP path exists in this tree (`JOIN_WRITE_API` is `null`).

## 5. Grep runtime `src/` for `2889699`

```text
$ rg -n --stats '2889699' src/
0 matches
0 matched lines
0 files contained matches
14 files searched
rg_src_exit=1
```

**`src/` hits: none.** NC-01 compiled-id FAIL evidence is **not** present at this SHA.

Non-runtime hits (docs / README examples / tests asserting absence) — allowed:

| path:line | context |
|---|---|
| `tests/t-id.test.ts:99` | `expect(url).not.toContain('2889699')` |
| `tests/t-id.test.ts:228` | walk `src/` and fail if `2889699` or `clubmadeira.uk` appears |
| `README.md:5` | example tenant, not the product |
| `docs/mrb-awin-p5-publisher-injection-2026-09-19.md:22` | prior MRB: absent in `src/` |
| `docs/mrb-awin-p5-publisher-injection-2026-09-19.md:34` | NC-01 closed |
| `docs/functional-spec.md:4,15,70,73,76,86` | parked spec / example curls |
| `docs/mrb-awin-publisher-agnostic-2026-09-19.md:17,38,42` | HOLD board / P5 charge |
| `docs/mrb-2026-09-19-v1.md:39` | P0–P4 history (pre-injection lock) |
| `docs/p5-publisher-injection.md:6` | example tenant only |
| `docs/build-and-test-plan.md:5,15,85,106-109` | plan / example paths (not compiled) |

`src/cli.ts:57` help banner still prints the **package name** `club-madeira-awin-connector`. That is not publisher id `2889699`.

## 6. Worker / join path — stub + dry-run default true

`JOIN_WRITE_API` is explicitly `null`. Dry-run defaults true unless `AWIN_JOIN_DRY_RUN` is `false` / `0` / `no`.

`src/config.ts` 29–36 and 51–58:

```ts
/** AWIN_JOIN_DRY_RUN default until T-UI-05. */
export const DEFAULT_DRY_RUN = true;

/**
 * Join write API does not exist in public catalogues until U7 is yes.
 * Do not invent an endpoint. UI path only.
 */
export const JOIN_WRITE_API: null = null;

/** True unless AWIN_JOIN_DRY_RUN is explicitly false/0. */
export function isJoinDryRun(env: EnvLike = process.env): boolean {
  const raw = env.AWIN_JOIN_DRY_RUN;
  if (raw === undefined || raw === '') return DEFAULT_DRY_RUN;
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}
```

Worker is a stub. It returns `needs_auth`. It must not launch Playwright or click Join.

`src/worker/stub.ts` (entire file):

```ts
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
```

`applyJoin` records dry-run intent only. When dry-run is off it still does **not** invent a join HTTP API; it calls the stub and returns `needs_auth`.

`src/apply.ts` 30–71 (full `applyJoin`; message / cap / interval guards included):

```ts
/**
 * Dry-run default: record intent only. Never invent a join HTTP API.
 * When dry-run is off, the stub returns needs_auth — no Playwright Join.
 */
export async function applyJoin(
  queue: JoinQueue,
  advertiserId: number,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const now = opts.now ?? Date.now();
  const dryRun = opts.dryRun ?? isJoinDryRun(opts.env ?? process.env);

  const msg = validateMessage(opts.message);
  if (!msg.ok) {
    return { ok: false, reason: 'message_length', advertiserId };
  }

  if (queue.countAppliesOnUtcDay(now) >= MAX_APPLIES_PER_DAY) {
    return { ok: false, reason: 'daily_cap', advertiserId };
  }

  const last = queue.lastSubmitAt();
  if (last != null && now - last < MIN_SUBMIT_INTERVAL_MS) {
    return { ok: false, reason: 'interval', advertiserId };
  }

  if (!dryRun) {
    const worker = opts.worker ?? runJoinWorker;
    const result = await worker({ advertiserId });
    queue.recordBlockedNeedsUi(advertiserId);
    return {
      ok: false,
      reason: 'needs_auth',
      state: 'blocked_needs_ui',
      advertiserId,
      worker: result,
    };
  }

  queue.enqueueDryRun(advertiserId, { message: opts.message });
  queue.recordDryRun(advertiserId, now);
  return { ok: true, state: 'dry_run_done', advertiserId };
}
```

CLI candidate lists attach `dryRun: isJoinDryRun(env)` (`src/cli.ts` ~181). Help text: `Dry-run default AWIN_JOIN_DRY_RUN=true.` / `Do not click Join. There is no join write API.`

Read client comment (`src/awin/client.ts`): `There is no join write API.` `POST /publisher/{id}/promotions` is the **offers catalogue** (read), not apply.

Runtime confirmation (tsx, publisher `9999999`, empty env, persist off):

```json
{
  "DEFAULT_DRY_RUN": true,
  "isJoinDryRunEmptyEnv": true,
  "JOIN_WRITE_API": null,
  "applyDefaultEnv": { "ok": true, "state": "dry_run_done", "advertiserId": 42 },
  "workerStub": { "status": "needs_auth" },
  "applyDryRunFalse": {
    "ok": false,
    "reason": "needs_auth",
    "state": "blocked_needs_ui",
    "advertiserId": 99,
    "worker": { "status": "needs_auth" }
  }
}
```

## 7. `package.json` scripts and publisher-id injection

```json
{
  "name": "club-madeira-awin-connector",
  "description": "Awin publisher connector — read client, selection criteria, dry-run join queue. Publisher id is injected.",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "cli": "tsx src/cli.ts",
    "list_join_candidates": "tsx src/cli.ts list_join_candidates",
    "relationship_status": "tsx src/cli.ts relationship_status"
  }
}
```

**How publisher id is injected** (no compiled default):

| Layer | Mechanism |
|---|---|
| CLI flag | `--publisherId` / `--publisherId=` (`src/cli.ts` `takeFlag`) |
| Env | `AWIN_PUBLISHER_ID` |
| Precedence | explicit `--publisherId` **then** `AWIN_PUBLISHER_ID` |
| Resolver | `readPublisherId` / `createPublisherContext` in `src/publisher.ts` |
| Missing | `MissingPublisherIdError` — `"Missing publisher id. Pass --publisherId or set AWIN_PUBLISHER_ID."` — CLI `runCli` returns **1** |
| Client | `AwinClient` constructor calls `createPublisherContext`; URLs use `/publishers/${this.publisherId}` |
| Queue | `JoinQueue` keyed by `publisherId`; persist `data/join-queue/{publisherId}.json` |
| Agent schema | `schema/agent.json` and `src/schema.ts`: `publisherId` **required** on `list_join_candidates` and `relationship_status` |
| `.env.example` | `AWIN_PUBLISHER_ID=` (empty); `AWIN_JOIN_DRY_RUN=true`; `AWIN_ACCESS_TOKEN=` empty |

`src/publisher.ts` 47–58:

```ts
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
```

Package / repo name still contains `club-madeira`. That is historical naming, not a compiled publisher id. Rename is out of scope for this evidence PR.

## 8. What was NOT run

| Item | Status |
|---|---|
| Live Join (Playwright click Join / T-UI-05) | **Not run** |
| Real `AWIN_ACCESS_TOKEN` | **Not present; not used** |
| Live `https://api.awin.com` (publishers / programmes / programmedetails / promotions) | **Not called** |
| Phase 0 headed Join-modal screenshot | **Not run** |
| Invented join write HTTP API | **Does not exist; not added** |
| Product ship UAT / human UAT | **Not claimed; not run** |
| Merc PASS / FAIL verdict | **Merc decides** |
| U1 promotional type / U2 URL-box / U6 worker host / U7 AM letter | **Still open operator gates** |

`.env.example` ships empty `AWIN_ACCESS_TOKEN=`. This environment had no Awin token. CLI without fixture failed `Missing AWIN_ACCESS_TOKEN` before any network read.

## 9. Evidence summary (for Merc)

| Check | Result at `0666b74` |
|---|---|
| `git rev-parse HEAD` | `0666b74978dcb70cd5cefdda7c076ea6d24b16d6` |
| `npm test` | 29 passed / 0 failed (6 files) |
| `npm run typecheck` | clean (`tsc --noEmit`) |
| CLI `--publisherId 9999999` | envelope `publisherId: 9999999`, `dryRun: true` |
| CLI `AWIN_PUBLISHER_ID=9999999` | same |
| Missing publisher id | stderr + exit 1 |
| `rg 2889699 src/` | **0 matches** |
| Dry-run default | `DEFAULT_DRY_RUN = true` |
| Worker / non-dry-run apply | `{ status: 'needs_auth' }` / `reason: 'needs_auth'` |
| Join write API | `JOIN_WRITE_API === null` |
| Live Join / real token | **not run** |

Merc: this document is lab evidence on `main` @ `0666b74`. Pass or fail the hostile board. Do not treat the stub as live Join. Do not treat this file as ship UAT.
