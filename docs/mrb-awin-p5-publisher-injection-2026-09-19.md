# Hostile MRB - Awin publisher injection P5 close (2026-09-19)

**Repo:** SimonBarnett/club-madeira-awin-connector  
**Tip:** `a3ec1c7` P5: inject publisher id; persist per-tenant queue  
**Supersedes for agent hand-off:** docs/mrb-awin-publisher-agnostic-2026-09-19.md (HOLD/REWORK)  
**Prior:** mrb-2026-09-19-v1.md remains P0-P4 single-tenant ticket history only.

## Verdict

**PASS - ready for Merc hostile test**

Publisher-agnostic blockers NC-01..NC-05 from the HOLD board are closed in code + tests. Dry-run default and Join stub rules still hold. **Not** Join-shipped. **Not** Merc PASS (Merc decides field UAT).

Bob engineering gate for Merc hand-off: **open**.

## Evidence

| Check | Result |
|---|---|
| `npm test` | 29 passed (6 files) including `t-id.test.ts` |
| `npm run typecheck` | clean |
| `2889699` in `src/` | **absent** (only asserted-against in tests; README example tenant only) |
| `--publisherId` / `AWIN_PUBLISHER_ID` | required; MissingPublisherIdError; CLI help names both |
| Per-publisher queue | `data/join-queue/{id}.json`; T-ID-03 isolation |
| Rate limit | AwinClient per-instance; `limiterForToken`; processLimiter opt-in only |
| Truncation / lastSeen | envelope `truncated` + omit missing lastSeen (T-ID test) |
| Dry-run default | `DEFAULT_DRY_RUN = true` |
| Join write API | still `null`; worker stub needs_auth |

## Prior NCs disposition

| NC | Disposition |
|---|---|
| NC-01 BLOCK compiled Club Madeira / 2889699 in src | **Closed** |
| NC-02 BLOCK no runtime publisher injection | **Closed** |
| NC-03 Major in-memory queue | **Closed** (persist default on) |
| NC-04 Major global limiter | **Closed** (per client/token) |
| NC-05 Major silent truncate / lastSeen | **Closed** (explicit truncated; omit missing) |

## Nits (non-blocking for Merc hand-off)

1. Package/repo name remains `club-madeira-awin-connector` - historical; description states injection. Rename is optional product work.
2. Join / Phase 0 / U1-U8 still operator-gated - Merc must not treat stub as live Join.
3. Live `api.awin.com` not exercised in this MRB (offline vitest only).

## Merc hand-off

Merc: pull `main` @ `a3ec1c7` (or newer). Use skill `merc-hostile-mrb`. Pass or fail. On FAIL return ordered fixes to Bob. On PASS tell Bob + Simon.

## Bob does not claim

- Ready for shipping Join
- Merc test PASS
- Final product UAT without Merc