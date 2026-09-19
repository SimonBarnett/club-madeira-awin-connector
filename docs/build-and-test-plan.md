# Build and test plan â€” Club Madeira Awin connector

**Repo:** `SimonBarnett/club-madeira-awin-connector`  
**Spec:** [functional-spec.md](./functional-spec.md) + [PDF](./functional-spec-awin-connector-locked-2026-09-18.pdf)  
**P5 addendum:** [p5-publisher-injection.md](./p5-publisher-injection.md) â€” publisher id is injected; Club Madeira `2889699` is an example tenant only.  
**Model preference:** `build0.1` via agentic_build  
**Audience:** build agent â€” execute this plan; do not invent a Join write API; do not click Join until gates below.

---

## 0. Goals and non-goals

### Goals (first shippable slice = â€œFirst ticketâ€ in the spec)

1. TypeScript Awin **read** client for an **injected** publisher id (`--publisherId` / `AWIN_PUBLISHER_ID`; Club Madeira `2889699` is an example tenant only): publishers, programmes, programmedetails, promotions (POST read-only offers).
2. Rate limiter at **18/min** with redaction of tokens in logs/errors.
3. Selection criteria module (`criteria.ts`) matching the locked brief (99% approval, ProductFeed, 90d global exclude, 150-char message).
4. Join **queue** with dry-run apply (`AWIN_JOIN_DRY_RUN=true` default), `list_join_candidates`, `relationship_status`.
5. UI worker **stub** that returns `needs_auth` (no Playwright Join until gates).
6. Automated tests: **T-SEL, T-API, T-APP, T-RED, T-RATE**.
7. README documents locked constants, Phase 0 curls, AM email template, U1â€“U8 checklist.

### Non-goals (this plan)

- Clicking Join in a browser until U1, U2, U6 filled and Simon provides advertiserId for **T-UI-05**.
- Inventing a join write API (B1 closed until U7 = yes).
- Hosting on walrus or IONOS media-host.
- Replacing Welcome IMAP / 8am onboarding.js / partner Add Key flows.
- Guessing `AWIN_PROMOTION_TYPE` or modal URL field presence.

---

## 1. Phase order

| Phase | Name | Exit criteria |
|---|---|---|
| P0 | Orient + scaffold | Repo layout, package.json, CI `npm test` green on empty/smoke |
| P1 | Awin TS client | GET/POST helpers, auth header, 18/min, redaction; T-API T-RED T-RATE |
| P2 | Criteria + queue | criteria.ts + dry-run apply + list/status; T-SEL T-APP |
| P3 | Worker stub | returns `needs_auth`; no Join click |
| P4 | Docs polish | README locked list, Phase 0, AM email, U1â€“U8 |
| P5 | Publisher injection | `PublisherContext` + `--publisherId` / `AWIN_PUBLISHER_ID`; no default id in `src/`; durable per-publisher queue; per-client limiter |
| P5-stop | Stop for human Join | Phase 0 spike + U-gates are **Simon/operator**, not build agent Join |

Do not start Playwright Join work. Document gates only. P5 is identity/durability, not Join.

---

## 2. Suggested tree

```
README.md
package.json
tsconfig.json
src/
  config.ts          # publisher id, bases, caps, dry-run default
  awin/
    client.ts        # fetch wrappers
    rateLimit.ts     # 18/min
    redact.ts
    types.ts
  criteria.ts
  queue.ts
  apply.ts           # dry-run path only until T-UI-05
  worker/
    stub.ts          # needs_auth
  cli.ts             # list_join_candidates, relationship_status
tests/
  t-sel.test.ts
  t-api.test.ts
  t-app.test.ts
  t-red.test.ts
  t-rate.test.ts
docs/
  functional-spec.md
  functional-spec-awin-connector-locked-2026-09-18.pdf
  build-and-test-plan.md
```

---

## 3. Locked config constants (implement as named exports)

```ts
// No compiled default. Inject at runtime:
//   --publisherId <id>   or   AWIN_PUBLISHER_ID=<id>
// Example tenant only (docs/Phase 0): Club Madeira 2889699
export const API_BASE = 'https://api.awin.com';
export const PROMOTION_URL = 'https://www.clubmadeira.uk/for-awin-advertisers';
export const MESSAGE_MAX = 150;
export const CLIENT_CALLS_PER_MIN = 18;
export const MAX_APPLIES_PER_DAY = 20;
export const MIN_SUBMIT_INTERVAL_MS = 30_000;
export const PROGRAMMES_CACHE_MS = 15 * 60_000;
export const DEFAULT_DRY_RUN = true; // AWIN_JOIN_DRY_RUN
```

Env: `AWIN_ACCESS_TOKEN` (required for live calls). Optional later: `AWIN_FEED_KEY`, `AWIN_PROMOTION_TYPE`, RDS connection (U4/U5).

---

## 4. Client requirements (P1)

### Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/publishers/{publisherId}` | Smoke / Phase 0 (inject id) |
| GET | `/publishers/{publisherId}/programmes?relationship=` | `joined\|pending\|suspended\|rejected\|notjoined\|any` |
| GET | `/publishers/{publisherId}/programmedetails?advertiserId=&relationship=` | KPI includes `approvalPercentage` |
| POST | `/publisher/{publisherId}/promotions` | Offers; membership can include not-joined; **read-only** |

Auth: `Authorization: Bearer ${AWIN_ACCESS_TOKEN}`.

### Rate limit

Token-bucket or sliding window: **max 18** successful or attempted HTTP calls per rolling 60s per process. Tests must prove the 19th waits or errors without firing.

### Redaction

Any log, thrown Error message, or fixture dump MUST replace bearer tokens and `accessToken=` query values with `[REDACTED]`.

---

## 5. Criteria + queue (P2)

### Selection (when RDS available â€” U5)

- ProductFeed = Yes
- Joined = 0
- ApprovalRate â‰¥ 99
- Exclude Mode = global within 90 days
- Order LastSeen DESC

### Fallback (no RDS)

Use Awin `relationship=notjoined` + `approvalPercentage` from programmedetails only.

### Message

Template from U3 when available; enforce `length â‰¤ 150`. Reject longer before queue.

### Queue / apply

- Persist candidates + state: `candidate | dry_run_queued | dry_run_done | blocked_needs_ui | applied_pending` (applied only after T-UI-05 â€” not in first ticket).
- `AWIN_JOIN_DRY_RUN=true` (default): apply records intent, **does not** open UI or call any fictional join API.
- Caps: â‰¤20 applies/day; â‰¥30s between submits; interactive batch 6â€“12; cron batch 12.

### CLI surface

- `list_join_candidates` â€” prints ranked list (redacted).
- `relationship_status` â€” pending/joined/notjoined counts or per-id.

---

## 6. Worker stub (P3)

```ts
// worker/stub.ts
export async function runJoinWorker(/* â€¦ */): Promise<{ status: 'needs_auth' }> {
  return { status: 'needs_auth' };
}
```

MUST NOT launch Playwright Join. MAY document future Chrome profile on U6 host.

---

## 7. Test plan (acceptance IDs)

### T-SEL â€” selection / criteria

| ID | Case | Expect |
|---|---|---|
| T-SEL-01 | ApprovalRate 98.9 | reject |
| T-SEL-02 | ApprovalRate 99.0 | pass (given other flags) |
| T-SEL-03 | Message 151 chars | reject |
| T-SEL-04 | Message 150 chars | pass |
| T-SEL-05 | Global mode within 90d | exclude |
| T-SEL-06 | No RDS path uses notjoined + approvalPercentage | deterministic fixture |

### T-API â€” client

| ID | Case | Expect |
|---|---|---|
| T-API-01 | Mock GET programmes | parses array |
| T-API-02 | Mock programmedetails notjoined | reads approvalPercentage |
| T-API-03 | Missing token | clear error, no leak |
| T-API-04 | Bearer header set on request | asserted in mock |

### T-APP â€” dry-run apply / queue

| ID | Case | Expect |
|---|---|---|
| T-APP-01 | Dry-run apply | no HTTP join invent; state dry_run_done |
| T-APP-02 | 21st apply same day | blocked by daily cap |
| T-APP-03 | Second submit <30s | blocked by interval |
| T-APP-04 | list_join_candidates ordering | LastSeen DESC / fixture order |

### T-RED â€” redaction

| ID | Case | Expect |
|---|---|---|
| T-RED-01 | Error with token in URL | `[REDACTED]` |
| T-RED-02 | Log line with Authorization | no raw token |

### T-RATE â€” throttle

| ID | Case | Expect |
|---|---|---|
| T-RATE-01 | 18 calls in 60s | all allowed |
| T-RATE-02 | 19th within window | waits or rejects per documented policy (prefer wait â‰¤2s in test with fake clock) |

### T-UI-05 â€” gated (NOT in first PR)

Playwright Join against one Simon-provided `advertiserId` only after U1, U2, U6 set. Until then: document checklist; stub stays `needs_auth`.

---

## 8. Phase 0 / operator checklist (not automated)

Build agent **writes** these into README; Simon/Merc execute:

1. Phase 0 curls (publishers, pending length, notjoined length) + one programmedetails sample.
2. Headed screenshot of Join modal: type control, URL field yes/no, T&Cs â€” **Cancel**, do not Join.
3. Fill U1, U2; note U6 host name.
4. Optional AM email for U7 (template in functional-spec Â§5).
5. U8: keep John email until T-UI-05 passes.

---

## 9. CI

- Node 20+, `npm test` (vitest or node:test).
- No live calls to `api.awin.com` in CI (mock fetch).
- No Playwright Join in CI until T-UI-05 explicitly enabled with secret + allowlisted advertiserId.

---

## 10. Definition of done (first ticket)

- [ ] P1â€“P4 complete; all T-SEL T-API T-APP T-RED T-RATE green in CI.
- [ ] Default dry-run is on; no code path submits a real Join.
- [ ] README lists locked constants, Phase 0, AM email, U1â€“U8.
- [ ] Worker stub returns `needs_auth`.
- [ ] PR body quotes test summary; notes any narrower choice taken where spec was silent.

**Stop.** Hand back to Bob for hostile MRB. Do not expand into feed-plane or partner Add Key unless a later feature-request PDF says so.

---

## 11. Build-agent kickoff prompt (paste into Start-BobBuild)

```
Repo: https://github.com/SimonBarnett/club-madeira-awin-connector
Read docs/functional-spec.md and docs/build-and-test-plan.md.
Implement First ticket (P0â€“P4) exactly. LOCKED constants are not negotiable.
Do not click Join. Do not invent a join write API.
AWIN_JOIN_DRY_RUN defaults true. Client budget 18/min. Message max 150.
Commit and push to main (or feat/first-ticket then PR). Paste pytest-equivalent npm test summary when done.
```
