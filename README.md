# club-madeira-awin-connector

Club Madeira Awin publisher **2889699** — programmes / join connector.

Field kit: TypeScript API client, selection criteria, dry-run apply queue, worker stub. **No Join clicks in Playwright** until U1, U2, U6 are filled and Simon names an advertiserId for T-UI-05.

## Docs

| Path | Role |
|---|---|
| [docs/functional-spec-awin-connector-locked-2026-09-18.pdf](docs/functional-spec-awin-connector-locked-2026-09-18.pdf) | Locked decisions + remaining unknowns (source handoff) |
| [docs/functional-spec.md](docs/functional-spec.md) | Markdown mirror of locked constants |
| [docs/build-and-test-plan.md](docs/build-and-test-plan.md) | Full build + test plan for a build agent |

## Status

Repo created for Bob’s functional-spec loop. Spec + plan parked. **Build agent not started yet.**

## Locked (do not re-litigate)

- Publisher `2889699` Club Madeira
- Promotion URL `https://www.clubmadeira.uk/for-awin-advertisers`
- API `https://api.awin.com` — Bearer token; budget **18 calls/min** (Awin throttle 20)
- Join **write API does not exist** — UI path only until AM confirms otherwise (U7)
- Message cap **150** characters
- Dry-run default `AWIN_JOIN_DRY_RUN=true`
- Caps: 20 applies/day, 1 submit / 30s; interactive batch 6–12; cron 12
- Worker host: not walrus, not IONOS media-host

See docs for U1–U8 and Phase 0 spike.
