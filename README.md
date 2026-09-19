# club-madeira-awin-connector

Club Madeira Awin publisher **2889699** — read client, selection criteria, dry-run join queue, worker stub.

First ticket (P0–P4) is implemented. Phase 0 spike and U1–U8 gates are **operator work**. This is **not** ready for human UAT.

**Do not click Join** in Playwright until U1, U2, U6 are filled and Simon names an `advertiserId` for T-UI-05. There is **no join write API** until U7 is a written yes. Do not invent one.

## Status

| Slice | State |
|---|---|
| P0 scaffold + `npm test` CI | done |
| P1 Awin TS read client, 18/min, redaction | done |
| P2 criteria + dry-run queue + CLI | done |
| P3 worker stub `needs_auth` | done |
| P4 this README | done |
| Phase 0 curls / headed Join screenshot | operator |
| T-UI-05 Playwright Join | gated — not started |

## Locked constants (do not re-litigate)

| Item | Value |
|---|---|
| Publisher | `2889699` Club Madeira |
| Promotion URL | `https://www.clubmadeira.uk/for-awin-advertisers` |
| API base | `https://api.awin.com` (HTTPS) |
| Token UI | `https://ui.awin.com/awin-api` |
| Auth | `Authorization: Bearer` (env `AWIN_ACCESS_TOKEN`). Query `accessToken=` still accepted on older routes |
| Throttle | Awin 20/min; **client budget 18/min** |
| Join write API | **Does not exist** in public catalogues. B1 closed until U7 = yes |
| Message cap | **150** characters (not 170) |
| After join | Pending — `GET programmes?relationship=pending` |
| programmedetails | `relationship=joined\|pending\|suspended\|rejected\|notjoined\|any` (default `joined`). KPI includes `approvalPercentage` |
| programmes list | JSON array, one shot, cache 15 min |
| Offers | `POST /publisher/{id}/promotions` — read-only |
| Selection (RDS) | ProductFeed=Yes, Joined=0, ApprovalRate≥99, exclude Mode=global 90 days, LastSeen DESC |
| Keep | Welcome IMAP + 8am `onboarding.js` + partner Add Key |
| Dry-run | `AWIN_JOIN_DRY_RUN` **defaults true** |
| Caps | 20 applies/day, 1 submit / 30s; interactive batch 6–12; cron 12 |
| Worker host | **Not** walrus, **not** IONOS media-host |

`AWIN_PROMOTION_TYPE` and modal URL-field presence are **unset**. Do not guess them.

## Layout

```
src/config.ts
src/awin/client.ts      # GET publishers/programmes/programmedetails; POST promotions
src/awin/rateLimit.ts   # 18/min sliding window (wait, do not fire early)
src/awin/redact.ts      # Bearer + accessToken= → [REDACTED]
src/criteria.ts
src/queue.ts
src/apply.ts            # dry-run path; no fictional join endpoint
src/worker/stub.ts      # returns { status: 'needs_auth' }
src/cli.ts
tests/t-sel.test.ts
tests/t-api.test.ts
tests/t-app.test.ts
tests/t-red.test.ts
tests/t-rate.test.ts
docs/                   # parked spec + plan
```

## Commands

```bash
npm test
npm run typecheck
npx tsx src/cli.ts list_join_candidates
npx tsx src/cli.ts list_join_candidates --fixture path.json
npx tsx src/cli.ts relationship_status
npx tsx src/cli.ts relationship_status --advertiserId ID
```

Live CLI calls need `AWIN_ACCESS_TOKEN` in the environment. This repo does not ship a token and CI does not call `api.awin.com`.

## Phase 0 spike (operator)

Closes U1, U2, and list sizes. Cancel the modal. **Do not Join.**

```bash
curl -sS -H "Authorization: Bearer $AWIN_ACCESS_TOKEN" \
  https://api.awin.com/publishers/2889699

curl -sS -H "Authorization: Bearer $AWIN_ACCESS_TOKEN" \
  "https://api.awin.com/publishers/2889699/programmes?relationship=pending" | jq length

curl -sS -H "Authorization: Bearer $AWIN_ACCESS_TOKEN" \
  "https://api.awin.com/publishers/2889699/programmes?relationship=notjoined" | jq length

# then programmedetails?advertiserId=ID&relationship=notjoined
# Headed: open Join modal on a row, screenshot, Cancel. Do not Join.
```

Screenshot must record: type control, URL field yes/no, T&Cs label.

## AM email (U7)

**Subject:** Publisher 2889699 Club Madeira — programme application API?

> Is there a supported Publisher API to submit an application (promotional type, message, T&Cs)? If yes: method, URL, payload, rate limits, token. If no: confirm UI is the only supported path.

Until the answer is a written yes, there is no join write API in this repo.

## U1–U8 checklist (operator)

| ID | Unknown | Config | State |
|---|---|---|---|
| U1 | Exact promotional type in the live modal | `AWIN_PROMOTION_TYPE` | open — do not guess |
| U2 | 2026 modal website/promotion URL box? | `true\|false` | open — do not guess |
| U3 | Message template `whyItFits` / `joinRequestMessage` (cap 150) | | open |
| U4 | Feed key in SSM? Separate from OAuth. If no, skip feed-list enrich | `AWIN_FEED_KEY` | open |
| U5 | RDS from MCP host? If no, use Awin `notjoined` + `approvalPercentage` | | open; code supports both |
| U6 | Worker host name (always-on desktop, overnight Awin Chrome profile) | not walrus / not IONOS media-host | open |
| U7 | AM letter: private apply API yes/no + URL | | open; B1 closed |
| U8 | John email cutover | keep until T-UI-05 passes | keep |

## Tests

| ID | Coverage |
|---|---|
| T-SEL | approval 98.9/99.0, message 151/150, global 90d, no-RDS notjoined path |
| T-API | programmes array, programmedetails KPI, missing token, Bearer header |
| T-APP | dry-run `dry_run_done`, 21st/day cap, &lt;30s interval, LastSeen DESC |
| T-RED | token in URL and `Authorization` logs → `[REDACTED]` |
| T-RATE | 18 calls allowed; 19th waits (does not fire early) |
| T-UI-05 | **not in this ticket** |

Rate-limit policy: sliding window, **wait** until a slot frees. Tests inject a fake clock so the 19th wait is not a real 60s sleep.

## Join modal contract (from Awin help)

Nav: `ui.awin.com` → Advertisers → Join Programmes (or profile Join Programme) → **+ Join**.

Order: (1) promotional type required (2) message optional max 150 (3) T&Cs checkbox (4) Join.

Awin help does **not** list a Promotion URL field; Merc skill does. Phase 0 decides U2.

Promotional type families: Content / Cashback / Communities / Comparison / Creators / Discount Code / Editorial / Lead Gen / Loyalty. Club Madeira is likely Discount Code + Content. **Do not guess the exact option.**

## Spec

- [docs/functional-spec.md](docs/functional-spec.md)
- [docs/functional-spec-awin-connector-locked-2026-09-18.pdf](docs/functional-spec-awin-connector-locked-2026-09-18.pdf)
- [docs/build-and-test-plan.md](docs/build-and-test-plan.md)
