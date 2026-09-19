# Hostile MRB — Awin publisher-agnostic (2026-09-19)

**Source PDF:** [mrb-awin-publisher-agnostic-2026-09-19.pdf](./mrb-awin-publisher-agnostic-2026-09-19.pdf)

**Supersedes:** `docs/mrb-2026-09-19-v1.md` for **agent hand-off** (v1 remains valid only as P0–P4 single-tenant ticket close).

**Reviewed tip:** `b4e13dc`

**Verdict:** **HOLD / REWORK** — not agent-ready. Weighted ~4.6/10 (pass bar 8).

## Charge

Must be agnostic of Club Madeira. Publisher id is given to an agent. Tenants are data, not source.

## Blocking NCs

- **NC-01 BLOCK:** `2889699` / Club Madeira promotion URL compiled into `src/config.ts`, CLI, package identity, README, docs.
- **NC-02 BLOCK:** No `--publisherId` / `AWIN_PUBLISHER_ID`; `AwinClient(publisherId)` exists but unused by entrypoint.

## Major

- **NC-03:** JoinQueue in-memory Map — persist per publisher.
- **NC-04:** Global process rate limiter — scope per client/token.
- **NC-05:** Live candidate list silent truncate; lastSeen sort without lastSeen.

## Keep

Dry-run default, no invented join API, worker `needs_auth`, redaction, wait-not-fire rate policy.

## Required P5 rework

| Slice | Change |
|---|---|
| P5a identity | `PublisherContext` + `readPublisherId`; kill default constant in runtime paths |
| P5b CLI | `--publisherId`, env, help, JSON envelopes include actual id |
| P5c tests | T-ID-01 missing throws; T-ID-02 URL uses injected id; T-ID-03 two ids isolated |
| P5d durability | JoinQueue load/save under `data/`; limiter per client |
| P5e docs | README + addendum: Club Madeira is tenant example `2889699`, not the product |

## Exit criteria (§10)

1. No default publisher id in `src/` — `grep 2889699` only docs/examples/fixtures.
2. CLI refuses list/relationship without `--publisherId` or `AWIN_PUBLISHER_ID`.
3. CLI constructs `AwinClient` with that id; unit test two ids against fake fetch.
4. Agent-facing schema lists `publisherId` required.
5. Queue keyed by publisherId; cap survives process restart from disk.
6. `processLimiter` not production default.
7. Candidate payload includes considered/returned/truncated; lastSeen only when present.
8. README examples use `$PUBLISHER_ID`; Madeira once as example.
9. `npm test` green + new id tests.
10. Dry-run default true; worker `needs_auth`; no join write API.

Join / U1–U8 remain operator work. This board does not authorise Playwright Join.
