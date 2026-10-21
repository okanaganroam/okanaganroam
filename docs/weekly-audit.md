# Weekly enrichment audit

Every Monday a scheduled Claude session scans the site for anything that has gone stale (opening hours, seasonal
closures, special closures, events), researches the most important items on the open web, and hands Dayton a report
plus plan files. **It never writes to the live site.** Dayton reads the report and applies the plans with the scripts
that already exist, each of which does a dry run first.

## What it can see

`GET /admin/audit` (code in `weekly-audit.js`) is read-only and answers with, ranked by how many reviews a place has
and how soon a date is:

| Part | What it lists |
|---|---|
| Seasonal closures | closed-for-the-season places due to reopen or past their reopening date; "open until" dates that have passed; closed with no reopening date; notes not re-checked in 45 days; old rows that can be cleared; places that look seasonal (golf, boats, tours, farm stands, ski ...) with no season recorded |
| Hours | special closures active now or in the next 14 days; old special closures to clear; verified hours older than 180 days; hours with no recorded source; no hours at all; count of seasonal-hours venues |
| Events | starting within 21 days with a source not checked in 14 days; upcoming with no source; postponed; annual events whose anniversary is within 75 days and have no new dates; towns with no events in the next 30 days |
| Queues | pending event and venue submissions, owner changes and photos, visitor contributions, with the age of the oldest |
| Listing gaps | counts of places with no website, phone, address or map position |

It also carries a hint about what usually opens and closes this month.

## The weekly run (the scheduled session follows this)

1. Run `node scripts/weekly-audit.js` (needs `AUDIT_READ_TOKEN` and network access to okanaganroam.com). It writes
   `drafts/weekly-audit/<date>.json` and `<date>.md`. If it fails, stop and say why in the PR; do not guess.
2. Research, in this order, with a budget of about 40 places and 15 events so the run stays short:
   1. **Seasonal closures due to reopen, past their date, or with no date.** Find the venue's own announcement.
   2. **Special closures active now or soon**: confirm they are still right.
   3. **Places that look seasonal with no season recorded**, most reviewed first (about 15). Is it closed for the
      season, on winter hours, or open as usual?
   4. **Verified hours past the re-check age**, then **hours with no source**, most reviewed first (about 10).
   5. **Events starting soon whose source is old**: open the source and confirm date, time and that it is not cancelled.
   6. **New events**: look at the sources already used in `data/event-batches/*.json` (`source_name`, `source_url`) and
      at the towns with no events in the next 30 days. Add what is missing.
   7. **Annual events due new dates**: look for this year's dates.
3. Evidence rules:
   - Only the venue's or organizer's own website or official social page, a tourism organization, or the municipality.
     Search listings are leads, not evidence. Never infer hours or dates, and never copy from a review site.
   - Every proposed change carries its source URL, the date checked, and a one-line reason (`why`).
   - If it cannot be confirmed, put it under "Could not confirm" in the report with what was tried. Do not propose it.
   - Hours sources are limited to the site's allowed values: `official_website`, `venue_social_media`,
     `google_business_profile`, `venue_phone`, `venue_owner`, `in_person`.
   - Never invent an event, a date or a claim ("award-winning", "family-owned") that the source does not state.
4. Produce, in `drafts/weekly-audit/`:
   - `<date>.md`: the audit report with a **Findings** section added at the top (what changed, what could not be
     confirmed, what needs a human decision) and the sources used.
   - `<date>-venue-updates.json`: for `scripts/apply-venue-updates.js` (hours, season, and field corrections, each with
     `expect` so nothing edited since is overwritten).
   - `<date>-events.json`: for `scripts/apply-nightly-events.js` (create, update, add_occurrences, occurrence_status).
   - Leave a plan file out if it would be empty.
5. Commit to a branch named `weekly-audit-<date>`, push it, and open a PR whose description is the Findings section.
   Do not merge it.

## Hard rules for the scheduled session

- It holds `AUDIT_READ_TOKEN` only: **never** `ENRICHMENT_ADMIN_TOKEN`, and never any write to the live site.
- No secret is ever printed, written to a file, committed or put in the PR.
- No change to site code, tests or data files other than the files in `drafts/weekly-audit/`.
- Do not post to Instagram, Facebook or anywhere else.

## Applying a plan (Dayton)

```
node scripts/apply-venue-updates.js drafts/weekly-audit/<date>-venue-updates.json            # dry run
ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-venue-updates.js drafts/weekly-audit/<date>-venue-updates.json --apply
node scripts/apply-nightly-events.js drafts/weekly-audit/<date>-events.json                   # dry run
ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-nightly-events.js drafts/weekly-audit/<date>-events.json --apply
```

## Setup (once)

1. **Token.** In the hosting variables (Railway) add `AUDIT_READ_TOKEN`, a new random value. It opens only
   `/admin/audit`; it cannot write. Add the same value as a secret in the cloud environment the routine runs in.
2. **Network.** In that environment's settings, allow okanaganroam.com and the sites the research needs (the
   event sources above, venue websites). The simplest is a broader access level; the strictest is an allow-list.
3. **Schedule.** One recurring routine, weekly (see the routine's prompt: it points at this file).

Try the audit by hand at any time: `AUDIT_READ_TOKEN=... node scripts/weekly-audit.js`, or without the site,
`node scripts/weekly-audit.js --db path/to/okanagan.db`.
