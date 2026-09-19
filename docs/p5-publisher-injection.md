# P5 addendum — publisher injection

**Board:** [mrb-awin-publisher-agnostic-2026-09-19.md](./mrb-awin-publisher-agnostic-2026-09-19.md)  
**Charge:** Agnostic of any one advertiser. Publisher id is given to an agent. Tenants are data, not source.

Club Madeira publisher `2889699` is an **example tenant** only. It must not be compiled into `src/` as a default.

## Identity

- `PublisherContext` + `readPublisherId` in `src/publisher.ts`
- Sources: `--publisherId` (wins) then `AWIN_PUBLISHER_ID`
- Missing id is a hard error
- `AwinClient` is constructed with that id; URL paths use it
- Agent schema `schema/agent.json` lists `publisherId` as required

## Durability

- `JoinQueue` load/save under `data/join-queue/{publisherId}.json` (`data/` is gitignored)
- Daily cap is per publisher and survives process restart
- Rate limiter is per `AwinClient` instance (`new RateLimiter()`). `processLimiter` is not the production default

## CLI

```bash
npx tsx src/cli.ts list_join_candidates --publisherId $PUBLISHER_ID
npx tsx src/cli.ts relationship_status --publisherId $PUBLISHER_ID
```

JSON envelopes include the id used, plus `considered` / `returned` / `truncated` on candidate lists. `lastSeen` is included only when present.

## Keep

Dry-run default true. No invented join write API. Worker `needs_auth`. Do not click Join.
