# Functional specification â€” Club Madeira Awin connector

**Source:** [functional-spec-awin-connector-locked-2026-09-18.pdf](./functional-spec-awin-connector-locked-2026-09-18.pdf)  
**Date:** 2026-09-18 Â· **Publisher:** 2889699 Club Madeira  

> **P5:** Publisher id is injected. Club Madeira 2889699 below is an **example tenant**, not a compiled default.
**Audience:** build agent Â· Treat **LOCKED** rows as constants. Do not re-litigate.

This is an addendum-style handoff: locked facts from public Awin docs + Merc brief, plus eight unknowns only Simon or Phase 0 can close.

---

## 1. LOCKED â€” do not re-litigate

| Item | Value |
|---|---|
| Publisher (example tenant) | `2889699` Club Madeira — not a compiled default; inject at runtime |
| Promotion URL | `https://www.clubmadeira.uk/for-awin-advertisers` |
| API base | `https://api.awin.com` (HTTPS). Token UI: `https://ui.awin.com/awin-api`. Personal token. Rights changes lag up to 10 minutes |
| Auth | `Authorization: Bearer {token}`. Query `accessToken=` still accepted on older routes |
| Throttle | 20 calls/min/user. **Client budget 18/min** |
| Join write API | **Does not exist** in llms.txt, Publisher catalogue, Advertiser catalogue, Zapier, or third-party Awin MCPs |
| Join UX | Advertisers â†’ Join Programmes â†’ + Join. Modal: promotional type, optional message, T&Cs, Join |
| Message cap | **150** characters (official EN+FR help). Not 170 |
| After join | Pending. Track My Programmes â†’ Pending or `GET programmes?relationship=pending` |
| programmedetails | `relationship=joined\|pending\|suspended\|rejected\|notjoined\|any`. Default `joined`. KPI includes `approvalPercentage`. Works for `notjoined` if relationship set |
| programmes list | JSON array. No page/pageSize documented. One shot, cache 15 min |
| Offers | `POST /publisher/{id}/promotions`. membership filter includes not-joined. Read-only |
| Feed plane | `productdata.awin.com/datafeed/list/apikey/{FEEDKEY}`. Different secret. CSV gzip. XML retired |
| Zapier / market MCP | No Join action |
| Selection (brief) | RDS: ProductFeed=Yes, Joined=0, ApprovalRateâ‰¥99, exclude Mode=global 90 days, LastSeen DESC |
| Keep | Welcome IMAP + 8am `onboarding.js` + partner Add Key |
| Dry-run default | `AWIN_JOIN_DRY_RUN=true` until T-UI-05 |
| Caps | 20 applies/day, 1 submit / 30s. Interactive batch 6â€“12. Cron 12 |
| Worker host | **Not** walrus, **not** IONOS media-host |

---

## 2. Join modal contract (from Awin help)

- Nav: `ui.awin.com` â†’ Advertisers â†’ Join Programmes (or profile Join Programme)
- Quick: **+ Join**
- Modal order: (1) promotional type (required) (2) message optional max 150 (3) T&Cs checkbox (4) Join
- Awin help does **NOT** list a Promotion URL field. Merc skill does.
- Phase 0 screenshot must record: type control, URL field yes/no, T&Cs label.
- Promotional type families: Content / Cashback / Communities / Comparison / Creators / Discount Code / Editorial / Lead Gen / Loyalty.
- Club Madeira is likely Discount Code + Content. **Do not guess** the exact option.

---

## 3. Remaining unknowns â€” only these eight

| ID | Unknown | Config / note |
|---|---|---|
| U1 | Promotion type â€” exact option in live modal | `AWIN_PROMOTION_TYPE` |
| U2 | URL field? Does 2026 modal still have website/promotion URL box? | `true\|false` |
| U3 | Message template `whyItFits` / `joinRequestMessage` from clubscan. Cap 150. Redacted sample | |
| U4 | Feed key in SSM? Separate from OAuth. If no, skip feed-list enrich | |
| U5 | RDS from MCP host? If no, use Awin `notjoined` + `approvalPercentage` only | |
| U6 | Worker host name â€” always-on desktop with overnight Awin Chrome profile | |
| U7 | AM letter â€” private apply API yes/no + URL. Until written yes, B1 closed | |
| U8 | John email cutover â€” default: keep until T-UI-05 passes | |

U3â€“U5 not closable from public GitHub search of SimonBarnett (`clubscan` / `AwinHighApprovalMerchants` / `getAwinConfig` not visible).

---

## 4. Phase 0 spike (closes U1 U2 + list sizes)

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

---

## 5. AM email (U7)

**Subject:** Publisher 2889699 Club Madeira â€” programme application API?

> Is there a supported Publisher API to submit an application (promotional type, message, T&Cs)? If yes: method, URL, payload, rate limits, token. If no: confirm UI is the only supported path.

---

## 6. First ticket â€” implement with no more questions

- TS client: GET `publishers` / `programmes` / `programmedetails`; POST `promotions`; 18/min; redaction.
- `criteria.ts` â€” 99 / ProductFeed / 90d / 150-char. RDS optional.
- Queue + dry-run apply + `list_join_candidates` + `relationship_status`.
- Worker stub returns `needs_auth`. Tests T-SEL T-API T-APP T-RED T-RATE.
- README with locked list, Phase 0 curl, AM email, U1â€“U8 checklist.

**Do not click Join in Playwright** until U1, U2, U6 are filled and Simon writes an advertiserId for T-UI-05.

---

## Sources

programmedetails relationship enum; How do I join an advertiser programme (150 chars); promotional types article; ui.awin.com/awin-api; Funnel 10-min rights lag; productdata list; Zapier Awin MCP; Merc brief 2026-09-18.


## P5 tenant-injection addendum (2026-09-19)

**Product identity:** publisher id is injected at runtime (--publisherId or AWIN_PUBLISHER_ID). There is no compiled default in src/.

**Club Madeira 2889699:** example / first deployment tenant for Phase 0 curls and operator notes only. Do not treat it as a locked compile-time constant for agent hand-off. Agents that reintroduce 2889699 into src/ fail the publisher-agnostic board.

See p5-publisher-injection.md and mrb-merc-2026-09-19-v1.md.
