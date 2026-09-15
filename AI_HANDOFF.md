# Okanagan Roam — AI Handoff

This file is the shared coordination point for AI assistants working on this repository.

## Rules

1. GitHub is the source of truth. Always inspect the current repository state before acting.
2. Do not overwrite another assistant's work. Review recent commits and existing changes first.
3. Prefer small, auditable changes with clear commit messages.
4. Never commit secrets, tokens, passwords, API keys, or private credentials.
5. For production/data changes, verify before and after and record the result here.
6. If an action is blocked, document the exact blocker rather than using an unsafe workaround.

## Current Status

* Repository: `okanaganroam/okanaganroam`
* Default branch: `main`
* **Review branch open: `ai-handoff/2026-09-15`** — pushed by Claude for ChatGPT to review directly on GitHub. Contains only `AI_HANDOFF.md` changes (the HIGH-confidence re-triage, the proposed 6-venue enrichment batch, and the lat/lng geocoding findings for #484). `main` is untouched — nothing from this branch has been merged. No code changed, no production data changed, no admin endpoint called.
* Shared AI handoff file established: September 8, 2026
* Recent work includes venue enrichment, guarded corrections, duplicate/redirect infrastructure, and enrichment audit tables.
* Known baseline (2026-09-08): 1,069 total venues, 1,052 active, 17 redirects, 911 complete, 141 missing.
* Updated baseline (2026-09-15, verified live against production `/api/venues`): 1,055 active venues, 989 complete (address+lat+lng all present), 66 missing (all three fields missing together in every case — no partial records). Total-including-redirects and redirect count were not reverified this pass (no admin access this session); only the active/complete/missing figures above were independently confirmed.

## Authentication / Admin API Notes

* `ENRICHMENT_ADMIN_TOKEN` is read from the Railway environment and is not hardcoded in source.
* Admin mutation routes use `Authorization: Bearer <token>`.
* Missing configuration returns 503; invalid/missing bearer token returns 401.
* Token comparison uses a timing-safe comparison.
* Admin correction/enrichment routes are narrowly scoped and validate request fields before database writes.
* Never record or commit the actual admin token here.

## Latest AI Handoff

### Claude

* Continue recording meaningful production/data work in commits with descriptive messages.
* Before changing production-sensitive code or data, reconcile against the current GitHub state.
* Read this file before beginning work that crosses between AI assistants.
* Claude has confirmed the shared handoff file and is ready to coordinate through GitHub with ChatGPT.
* 2026-09-08 — Claude executed the ready 11-venue HIGH-confidence location enrichment batch (IDs: 469, 841, 857, 863, 907, 918, 967, 1000, 1002, 1004, 1041). All 11 were freshly re-verified (not assumed from prior research) via exact phone match to a single unambiguous Google listing before any write. All 11 writes succeeded with zero collateral field changes and zero anomalies. Complete-location count rose from 900 to 911; missing-location count fell from 152 to 141. Active count (1,052), redirect count (17), and all 17 existing redirect mappings were confirmed unchanged. Sitemap remained at 1,240 (expected — pure enrichment of already-active venues does not add/remove sitemap pages). The manifest file was intentionally left byte-for-byte unchanged, since manifest synchronization is a separate, not-yet-authorized task.
* 2026-09-15 — Claude re-checked current missing-location count directly against live production (`GET https://okanaganroam.com/api/venues?limit=2000`, no admin access needed since address/latitude/longitude are public fields). Active venue count is now 1,055 (up from 1,052 on 2026-09-08 — some venues were likely added between sessions). Of those, 989 have complete address+lat+lng and 66 are missing all three (down from 141 missing on 2026-09-08, indicating substantial enrichment progress happened since that note was last updated, though it wasn't logged here at the time). Redirect count and grand total (including redirects) were not reverified this pass. Note: an initial check via a summarizing web-fetch tool undercounted this (reported only 2 missing) because it truncated/summarized the ~1,055-row JSON response before counting — the 66 figure above comes from downloading the full response and counting programmatically, and should be treated as the reliable one.
### ChatGPT

* Review the latest commits and repository state before proposing or making changes.
* Use this file to leave concise coordination notes when a task crosses between assistants.
* Do not overwrite Claude's work; inspect the current GitHub state first.
* Current GitHub integration status: ChatGPT can inspect the repository but its write attempts currently return HTTP 403 (`Resource not accessible by integration`).

## Open Tasks

* **Task: Continue HIGH-confidence location enrichment for the remaining 66 active venues missing address/latitude/longitude (updated 2026-09-15; was 141 as of 2026-09-08).**

* **Why highest priority:** Location data completeness remains the largest remaining gap in the dataset — 66 of 1,055 active venues (~6%) still lack address/lat/lng, down from 141 (13%) on 2026-09-08. Substantial enrichment progress has evidently happened since that note was last updated, but it was not logged in this file at the time — whoever did that work should backfill a Change Log entry here if they see this.
* **Current evidence:** 989 of 1,055 active venues (~94%) now have complete address+lat+lng; 66 remain missing (verified live via `GET /api/venues?limit=2000`, all three fields missing together in every case). The prior candidate-tier breakdown (HIGH/MEDIUM/LOW confidence lists from the 2026-09-08 research pass) has not been re-derived against the current 66 — it should be treated as stale until someone re-identifies which of the 66 fall into which confidence tier. ID 185 (Dosa Crepe Cafe) remains flagged separately: its stored phone belongs to the Rutland (Kelowna) branch of a multi-location chain, not the Osoyoos location the record represents — it needs a combined phone correction + enrichment, not enrichment alone. (Not yet reconfirmed whether ID 185 is still one of the 66 or was already resolved.)
* **Suggested next phase:** Pull the current list of 66 venue IDs/names missing location data, re-triage them into HIGH/MEDIUM/LOW confidence tiers (the same conservative process as before: fresh identity verification immediately before every write, exact phone match preferred, exclusion of any mobile/closed/ambiguous business, individual post-write verification, full redirect/sitemap reconciliation after each batch), and work down from HIGH confidence. A separate manifest-refresh pass should also be scheduled to bring the manifest's recorded totals back in sync with live production state.

## In-Progress Work (not yet committed)

### Claude — guarded `/admin/correct-phone` endpoint (2026-09-15)

* **Status: local-only, uncommitted. Both previously-open items below are now resolved — 58/58 tests passing, stable across repeated runs. Ready for ChatGPT/human review before commit.**
* **Why:** Phone reconciliation on the venue-duplicate/identity audit (IDs 328, 185, and others) found there was no guarded, audited, precondition-checked way to correct an already-populated phone number — only an unauthenticated `PUT /api/venues/:id` could do it. This work adds that missing guarded path.
* **What changed (working tree, `git status --short` shows `M server.js`, `M tests/server.test.js`, plus an unrelated `M okanagan.db` local test artifact — see note below):**
  * `server.js`: new `guardedPhoneCorrectUpdate()` function (mirrors the existing `guardedRegionCorrectUpdate()` pattern; atomic UPDATE with NULL-safe `expected_current_phone` precondition; writes one `venue_enrichment_log` audit row per real change) and a new `POST /admin/correct-phone` route (same bearer-token auth as every other admin route; allowlists exactly `id`, `expected_current_phone`, `corrected_phone`, `reason`, `batch_id`). Zero existing lines modified — confirmed via `git diff`, both hunks are pure insertions.
  * `server.js`: one follow-up fix — `corrected_phone` is now trimmed once and the TRIMMED value is what gets stored (previously validated-as-non-empty-after-trim but stored untrimmed, so padded input could leave stray whitespace in the DB).
  * `tests/server.test.js`: new fixtures (`test-phone-fixture`, `test-null-phone-fixture`, `test-populated-phone-for-null-check`) and test coverage folded into the existing single `'HTTP routes: ...'` test (a second `startServer()`/`server.close()` cycle in this file is documented to break later fetches, so all admin-endpoint coverage lives inside that one test). Covers: 401 wrong token, 400 validation (unexpected key, missing/empty required fields), 404 unknown id, 409 mismatch on a populated field (now also asserts zero new audit-log rows), 409 mismatch on a NULL live phone, **409 the reverse case — `expected_current_phone: null` asserted against a POPULATED live phone** (just added), 200 NULL-precondition match + audit row, 200 success path + full audit-row field verification, a sequential stale-precondition case (simulates the "process acted on a stale read" scenario this atomicity guards against), and a no-op case.
* **Test result: 58/58 passing** (`npm test`), re-run 4 times in a row with no flakiness. No regressions in any pre-existing test.
* **Both previously-open items are now done:**
  1. **`corrected_phone` trimming is now tested.** New assertion sends `"  +1 250-555-8765  "` (padded) and confirms both the HTTP response and the stored DB value are the trimmed `"+1 250-555-8765"`, with no stray whitespace.
  2. **503 (unauthenticated-endpoint-not-configured) is now tested, via a genuinely isolated child process.** Isolation mechanics (documented in-line in `tests/server.test.js` above the test itself): `server.js` and `db.js` are copied byte-for-byte (unmodified — `fs.copyFileSync`, no rewriting) into a fresh `os.tmpdir()` subdirectory; that copy is launched as a separate `node <copy>/server.js` child process with (a) its own `process.env` — built from a shallow copy of the parent's env with `ENRICHMENT_ADMIN_TOKEN` explicitly `delete`d, so it's unset regardless of what the parent's real environment contains, (b) its own port (3098, distinct from the shared harness's 3001), and (c) its own SQLite file, since `db.js` resolves `DB_PATH` relative to its own `__dirname` — now the temp directory, not the project root, so it creates a brand-new empty DB there rather than touching the project's `okanagan.db` or the shared test run's copy. The test polls `/robots.txt` (a harmless public route) until the child is actually listening, then asserts `POST /admin/correct-phone` returns 503. Both the temp directory and the child process are torn down in a `finally` block (confirmed manually afterward: no leftover temp directories, no orphaned process). Runs in ~250ms.
* **No production data was changed.** All testing ran against the local, throwaway `okanagan.db` fixture file that the test suite deletes and reseeds on every run (per that file's own header comment) — never against Railway's `/data` volume. No request was made to `okanaganroam.com` during this work. `ENRICHMENT_ADMIN_TOKEN` was never requested or used — only a hardcoded fixture string (`'test-fixture-admin-token'`) local to the test process.
* **No commit, push, or deployment was performed.** Everything above is an uncommitted working-tree change only; `git status` confirms nothing is staged.
* **For ChatGPT to review before this is committed:**
  * Worth a second opinion on whether folding most `/admin/correct-phone` coverage into the single existing HTTP-routes test (rather than a separate test file) is the right tradeoff — it was done specifically to avoid a documented `startServer()`/`server.close()` double-cycle failure in this file, not for lack of a cleaner option. (The 503 test is its own separate top-level test, since it never touches the shared `app`/server instance at all.)
  * Worth confirming the child-process isolation approach for the 503 test (spawn + temp-dir file copy + separate port) is an acceptable pattern for this codebase's test conventions, versus e.g. refactoring `server.js` to make `ENRICHMENT_ADMIN_TOKEN` re-readable per-call instead of captured once at module load (a larger, out-of-scope change not attempted here).
  * `okanagan.db` shows as modified in `git status` purely as a side effect of running `npm test` locally (it's a disposable fixture DB per the test file's own design) — not a real change, safe to ignore/not stage.
  * This is still an uncommitted, local-only diff. Nothing has been staged or committed pending this review.

## Next Enrichment Batch — Proposed, NOT Executed (2026-09-15)

### Claude — HIGH-confidence re-triage + fresh verification for the 66 missing-location venues

* **Status: read-only preparation only. No admin endpoint was called, no production data was changed, nothing committed/pushed/deployed.**
* **Step 1 — reconciliation:** Pulled `GET https://okanaganroam.com/api/venues?limit=2000` fresh just now and recomputed the missing-address/lat/lng list. **Result: still exactly 66 active venues, identical IDs** to the set identified earlier this session (20, 39, 41, 94, 95, 130, 131, 154, 156, 158, 180, 185, 196, 208, 225, 252, 260, 304, 311, 328, 337, 360, 379, 405, 426, 450, 453, 459, 484, 507, 511, 521, 531, 535, 536, 537, 547, 569, 581, 592, 597, 642, 644, 650, 652, 691, 702, 724, 725, 766, 768, 769, 806, 809, 896, 908, 934, 965, 972, 987, 1014, 1019, 1026, 1051, 1066, 1069). Nothing changed on production since the last check — the earlier HIGH/MEDIUM/LOW internal tiering (done from internal signals only: phone presence, duplicate/mobile/seasonal keyword hits) is still current and not stale, but see the next step for why "internal HIGH" and "verified HIGH" are two different things.
* **Step 2 — fresh external verification of the 13 internally-HIGH candidates** (IDs 95, 131, 180, 360, 426, 484, 511, 547, 592, 702, 806, 934, 987): each was independently web-searched by name+region and cross-checked against its stored phone number, per the same conservative standard as the 2026-09-08 batch (exact phone match to a single unambiguous listing required before treating an address as safe to write). **Result: only 6 of the 13 survived fresh verification.** The other 7 looked clean from internal data alone but turned out to have a real-world complication only visible once actually researched externally — which is exactly why this verification step exists rather than trusting the internal tier alone.

**READY — 6 venues, exact phone match confirmed, single unambiguous location, safe for a write batch:**

| ID | Name | Region | Stored phone | Verified address | Source confidence |
|---|---|---|---|---|---|
| 180 | Dolci Thai Bistro | osoyoos | +1 250-495-6807 | 8710 Main St, Osoyoos, BC V0H 1V0 | Exact phone+address match (Yelp + direct query); one aggregator (tableagent.com) listed a different number, judged to be that third-party booking site's own forwarding line, not the restaurant's real number — the restaurant's own number and address are consistently confirmed together elsewhere |
| 360 | Lala Ji's pizzeria | penticton | +1 778-622-2211 | 625 Main St, Penticton, BC V2A 5C9 | Exact phone+address match (multiple independent sources) |
| 426 | Murray's Pizza Kelowna | kelowna | +1 778-484-3000 | 107-1924 Summit Drive, Kelowna, BC V1V 3E9 | Exact phone+address match; a separate West Kelowna location exists under the same brand with a different address/phone — confirmed our record is the Kelowna one specifically |
| 484 | Parlour Ice Cream | kelowna | +1 250-300-7071 | 1571 Abbott Street, Kelowna, BC V1Y 1A8 | Exact phone+address match (multiple independent sources) |
| 934 | 14th Ave Bar & Grill | vernon | +1 250-549-4653 | 1101 14 Avenue, Vernon, BC V1B 2S6 (Hillview Golf Course) | Exact phone match to Hillview Golf Course's own listed number; venue's name literally derives from the course's street address, a nice corroborating detail. Seasonally closed in winter (normal for a golf-course restaurant) — this is a fixed address, not a mobile concern |
| 987 | China Palace | penticton | +1 250-492-9883 | 1933 Main Street, Penticton, BC V2A 5H5 | Exact phone+address match (multiple independent sources) |

**Note: none of the 6 above have latitude/longitude yet** — only street addresses were verified this pass (no geocoding tool was available/used). Getting precise coordinates should be the next step immediately before any write, consistent with "fresh verification immediately before every write."

**NOT READY — 7 venues downgraded out of the internal-HIGH tier, each for a specific, verified reason:**

| ID | Name | Region | Stored phone | Issue found | Disposition |
|---|---|---|---|---|---|
| 95 | Bright Jenny Coffee | kelowna | +1 250-860-8848 | Genuine multi-location chain (at least 3 Kelowna locations found: Lakeshore Rd, Kane Rd, Kirschner Rd, plus a possible 4th at Laurel Ave); the stored phone could not be tied to one specific location via search | Needs per-location phone lookup before it can be enriched safely — do not write yet |
| 131 | Charros Takos | kelowna | +1 250-870-2854 | Social posts describe it as a rotating food truck ("Now at 📍 1948 Windsor Rd" — a dated, location-specific post, not a fixed address), and the phone found for that address (587-888-9976) doesn't match our stored number | Likely mobile — should probably move to the food-truck exclusion list, not the enrichment queue. Needs a human/product call, not a straightforward write either way |
| 511 | Pizza Factory | osoyoos | +1 250-860-4149 | Address found (8115 Main St, Osoyoos) but its phone (250-495-2033) does not match our stored number | Phone mismatch unresolved — do not write yet |
| 547 | Red Tomato Pies | vernon | +1 236-420-1515 | Confirmed: that exact phone number belongs to the **Kelowna** location of this franchise, not Vernon (401 Glenmore Rd, Kelowna) — same class of error as the Kelly O'Bryan's #328 case found earlier this session | Needs a phone correction (via the new `/admin/correct-phone`, once that work is reviewed/committed/deployed) combined with enrichment, not enrichment alone |
| 592 | Sky High Diner | vernon | +1 778-212-8759 | Address found (6300 Tronson Rd, near Vernon Airport) but one listing explicitly titles it "Food Truck in Vernon" | Possibly a semi-permanent food-truck/trailer at a fixed pad rather than a building — needs confirmation of fixed-vs-mobile status before writing |
| 702 | The Mission Creamery | kelowna | +1 250-764-6171 | Two Kelowna locations found (450 Cook Road "AQUA Boat Club" and 4649 Lakeshore Road); the phone could not be tied to one specific location | Needs per-location disambiguation before it can be enriched safely — do not write yet |
| 806 | barBURRITO | vernon | +1 250-717-0959 | Two Vernon locations found (Square Mall: 236-426-2626; Polson Park: 778-943-0776) — **neither** matches our stored phone | Stored phone may be outdated/wrong or belong to a third, unlisted location — do not write yet |

* **No production data was changed, no admin endpoint was called, nothing was committed, pushed, or deployed.** This entire pass was `GET` requests to the live public API plus external web research only.
* **For ChatGPT to review:** the proposed 6-venue READY batch above (180, 360, 426, 484, 934, 987) is the recommended next enrichment batch, pending (a) a final geocoding pass for lat/lng immediately before writing, and (b) your review/agreement on the verification evidence. The 7 downgraded venues should stay out of any batch until their specific issues are separately resolved — three of them (95, 702, 806) need per-location phone disambiguation, two (131, 592) need a fixed-vs-mobile determination, one (511) has an unexplained phone mismatch, and one (547) needs a phone correction bundled with its enrichment (same pattern as #328 and #185).

## Lat/Lng Geocoding Attempt for the 6 READY Venues (2026-09-15) — Read-Only, Mixed Result

### Claude — geocoding pass, honest result: only 1 of 6 reached verifiable building-level precision

* **Status: read-only. No admin endpoint was called, no production data was changed, nothing committed/pushed/deployed.**
* **Method:** No paid/authoritative geocoding API is available to me directly, so I used OpenStreetMap's public Nominatim search API (`nominatim.openstreetmap.org/search`, `addressdetails=1`) against each verified street address from the prior batch, then checked the **match precision** of each result (does it resolve to the actual building/POI, or just to the street in general?) rather than trusting the returned lat/lon at face value. This caught real problems — several results were street-midpoint matches with no house number, one had a postal code that didn't match the business's real postal code, and one matched to a completely different business at a shared/multi-tenant address.
* **Result: only #484 (Parlour Ice Cream) reached genuine building-level confidence.** The other 5 did not meet the same bar this project has used throughout ("verify each coordinate against the exact verified street address" — not just "get some coordinate"), so their lat/lng is being reported as **unresolved**, not written or approximated.

| ID | Name | Verified address | Nominatim result | Match precision | Confidence |
|---|---|---|---|---|---|
| 484 | Parlour Ice Cream | 1571 Abbott Street, Kelowna, BC V1Y 1A8 | lat 49.8860040, lon -119.4992216 | **Exact POI name+house-number match**: `display_name` = "Parlour Ice Cream, 1571, Abbott Street, Kelowna..." | **HIGH — ready to write** |
| 426 | Murray's Pizza Kelowna | 107-1924 Summit Drive, Kelowna, BC V1V 3E9 | lat 49.9013835, lon -119.4532433 | House number 1924 matched exactly, **but** the indexed POI at that point is "Glenmore Martial Arts" (a different business), and the postal code returned (V1V 1N9) doesn't match the business's own postal code (V1V 3E9) — likely a shared/multi-tenant building where OSM only tagged one unit | **LOW-MODERATE — do not write yet**; the street/building location is probably close, but neither the tenant nor the postal code independently confirm it |
| 934 | 14th Ave Bar & Grill (Hillview Golf Course) | 1101 14 Avenue, Vernon, BC V1B 2S6 | Two conflicting results: (a) an earlier web search tied specifically to "Hillview Golf Course" gave 50.2518398, -119.2509141; (b) a plain Nominatim address search gave 50.2522626, -119.3048354, road-level only, in a **different-sounding neighborhood** ("Okanagan Landing" vs. the golf course's actual area) | The two results are **~4 km apart** — a real discrepancy, not rounding noise | **UNRESOLVED — do not write yet**; the venue-specific source (a) is more likely correct but has no second independent source confirming it |
| 180 | Dolci Thai Bistro | 8710 Main St, Osoyoos, BC V0H 1V0 | lat 49.0284355, lon -119.4596481 | Road-level only (no house number in the result), postal code returned (V0H 1V7) doesn't match the business's confirmed postal code (V0H 1V0) | **LOW — do not write yet** |
| 360 | Lala Ji's pizzeria | 625 Main St, Penticton, BC V2A 5C9 | lat 49.4853834, lon -119.5864221 | Road-level only, postal code returned (V2A 5G1) doesn't match confirmed postal code (V2A 5C9) | **LOW — do not write yet** |
| 987 | China Palace | 1933 Main Street, Penticton, BC V2A 5H5 | lat 49.4823519, lon -119.5853958 | Road-level only, postal code returned (V2A 5G5) doesn't match confirmed postal code (V2A 5H5) | **LOW — do not write yet** |

### Follow-up (2026-09-15) — #484 Parlour Ice Cream coordinate independently cross-verified

* **Status: read-only. No admin endpoint was called, no production data was changed, nothing committed/pushed/deployed.**
* The single-source OSM coordinate reported above was cross-checked against a second, genuinely independent source (not OSM-derived): **geocoder.ca**, a Canada-specific geocoding service built on Canada Post/StatCan address data.

| Source | Data pipeline | Latitude | Longitude | Corroborating detail |
|---|---|---|---|---|
| OpenStreetMap (queried via both Nominatim and Photon — two different query engines, same underlying dataset, so counted as one source) | Crowd-sourced OSM | 49.886004 | -119.4992216 | Matched a POI node **explicitly named "Parlour Ice Cream"** at house number 1571, Abbott Street |
| geocoder.ca | Canada Post / StatCan civic address data — independent of OSM | 49.886150 | -119.499270 | Returned postal code **V1Y 1A8** — an exact match to the business's own confirmed postal code; self-reported confidence 0.8 |

* **The two independent sources agree to within ~17 meters** (a normal spread between a business's POI pin and its parcel/address centroid), and the independent source's postal code exactly matches the verified business address — this is a genuine two-independent-source confirmation, not just the same dataset queried twice.
* **Recommended coordinate for #484: latitude 49.886004, longitude -119.4992216** (the OSM value, chosen because it's tied to the actual named business POI rather than a generic address centroid — geocoder.ca's centroid-based point serves as corroboration, not the primary value).
* **No production data was changed, no admin endpoint was called, nothing was committed, pushed, or deployed.** This pass was public geocoding-API `GET` requests only.

* **Recommendation:** only **#484 (Parlour Ice Cream)** is ready for an actual enrichment write with both address and lat/lng — now with two-source-verified coordinates (49.886004, -119.4992216). The other 5 venues' street addresses remain verified and safe to write on their own (per the earlier phone-match research), but their coordinates should either come from a real geocoding API (Google Maps Geocoding API, which the live site likely already depends on for its own "get directions" links) or a manual human check in Google Maps — not from this free-tier lookup, which has now demonstrably produced wrong-postal-code and wrong-POI results for this specific set of small-town/rural BC addresses.
* **No production data was changed, no admin endpoint was called, nothing was committed, pushed, or deployed.** This pass was public geocoding-API `GET` requests only.

## EXECUTED — #484 Parlour Ice Cream Production Enrichment (2026-09-15)

### Claude — single-venue write, completed and verified

* **Status: DONE. This is the one production data write authorized and performed this session.**
* **Mechanism:** `POST /admin/enrich-venue` via the existing guarded `guardedEnrichUpdate()` path — no new code, no schema change, no bypass. Auth was handled via `railway run` (the Railway CLI, already linked to this project's production environment), which injects the real `ENRICHMENT_ADMIN_TOKEN` into a local subprocess's environment; the literal token value was never printed, logged, committed, or written anywhere, including here.
* **Pre-write verification:** live `GET /api/venues/484` confirmed identity (name "Parlour Ice Cream", region `kelowna`, type `cafe`, phone `+1 250-300-7071`) and confirmed `address`/`latitude`/`longitude` were all still `null`. Active count baseline: 1,055.
* **Write performed:** `{"id": 484, "address": "1571 Abbott Street, Kelowna, BC V1Y 1A8", "latitude": 49.886004, "longitude": -119.4992216}`. Server response: `{"id":484,"results":{"address":"written","latitude":"written","longitude":"written"}}` — all three fields were genuinely empty beforehand and were written (none skipped as already-populated).
* **Post-write verification (all passed):**
  * `address`, `latitude`, `longitude` on the live record now exactly match the approved values.
  * Every other field — `phone`, `name`, `region`, `type`, `slug`, `cuisine`, `rating`, `price`, `reviews`, `description`, `description_fr`, `hours`, `website`, `image_url`, `redirect_to` (still null), and all 12 boolean amenity flags — is byte-for-byte identical to the pre-write record. Only `updated_at` changed, as expected.
  * Active venue count: still 1,055 (unchanged).
  * Redirect count: not independently checkable via any public endpoint (same long-standing limitation noted earlier in this file), but structurally guaranteed unchanged — `guardedEnrichUpdate()` never touches `redirect_to`.
* **Anomaly found and reported, not hidden: no audit-log record exists for this write, and that's expected given the actual code, not a verification failure.** `guardedEnrichUpdate()` (used here, for filling empty fields) was never wired to write to `venue_enrichment_log` — only `guardedCorrectUpdate()` (used for fixing already-wrong values) does that. There was nothing to find because this code path doesn't create one. **Flagging for ChatGPT/team decision:** should `guardedEnrichUpdate()` gain the same audit trail `guardedCorrectUpdate()` already has, for parity? This affects every future enrichment write, not just this one.
* **Missing-location count impact:** 66 → 65 active venues now missing address/lat/lng (arithmetic inference from this single write; not independently re-pulled as part of this entry).
* **Manifest was not touched. No other venue was modified. No duplicates were merged. No application code was changed. No unrelated deploy occurred.**

## Redirect Count Reconciled (2026-09-15) — Resolves a Long-Standing Gap in This File

### Claude — full redirect-count verification, no admin access needed

* **Status: read-only. No admin endpoint was called, no production data was changed.**
* This file has repeatedly noted "redirect count not reverified this pass (no admin access)" since 2026-09-08's baseline of 17. That gap is now closed — **no admin token was needed**, since `GET /api/venues/:id` (single-venue lookup) does NOT filter out redirected rows the way the list endpoint does, so every id can be individually checked.
* **Method:** pulled the full active list (1,055 ids, min 1 / max 1083), found the 28 ids missing from that contiguous range, then checked each one individually via `GET /api/venues/:id`.
* **Result:**
  * **26 of the 28 gaps are genuine redirects** — each has a valid `redirect_to` pointing at a real canonical venue (examples: `#38 BNA Brewing (Vernon) → #40`, `#944 Davison Farmhouse Café → #210`, `#708 The Restaurant at Poplar Grove → #1012`).
  * **2 of the 28 (ids 1070, 1073) are simply nonexistent** — 404, never created or previously hard-deleted, not redirects.
  * Confirmed the table doesn't extend past id 1083 (checked 1084–1090, all 404).
* **Current redirect count: 26** (up from the stale 17 recorded on 2026-09-08 — 9 additional merges happened in production at some point without ever being logged in this file, same pattern already noted for the location-enrichment numbers).
* **Total rows in the venues table: 1,081** (1,055 active + 26 redirected).
* **Production deployment status:** healthy, same stable deployment (`e42326f5`, `SUCCESS`, created 2026-09-15T02:12:11Z) as after the `/admin/correct-phone` code shipped — nothing new has been deployed since; the #484 enrichment was a data write via the API, not a deploy.
* **Recommendation:** the "Known baseline" and "Updated baseline" lines under Current Status should be refreshed to include this redirect count once ChatGPT has reviewed it, and the Open Tasks section's "17 redirects" reference is now confirmed stale.

## Lat/Lng Re-Verification for #180, #360, #426, #934, #987 (2026-09-15) — Proposed, NOT Written

### Claude — read-only geocoding research only. No production write, no commit to main, no deploy.

* **Status: read-only. No admin endpoint was called, no production data was changed, nothing deployed. Stopping here for approval before any write, per instruction.**
* **Why revisit these five:** after #484 was written, these were the remaining venues from the original 6-venue READY batch. The earlier geocoding pass found only #484 reached genuine building-level confidence; these 5 were left unresolved (road-level-only OSM matches with mismatched postal codes, one wrong-POI match, and a ~4km conflict for #934). This pass specifically avoided relying on approximate street-centroid coordinates and looked for authoritative/independently-corroborated sources instead.
* **New method that worked:** queried **geocoder.ca** (a Canada-specific geocoding service built on Canada Post/StatCan civic address data — independent of OpenStreetMap, the same independent source that confirmed #484) for all 5 addresses. All 5 returned an **exact postal-code match** to the business's own independently-confirmed postal code, with self-reported confidence scores of 0.8–1.0. This alone is meaningfully stronger than the earlier OSM road-level results, which had *mismatched* postal codes.
* Also re-attempted OSM (Nominatim and Photon) with full postal codes included, and checked each business's own official website for an embedded Google Maps link (none had one). One additional finding materially improved #934's confidence (see below).

| ID | Name | Verified address | geocoder.ca result (independent of OSM) | Cross-check | Confidence |
|---|---|---|---|---|---|
| 426 | Murray's Pizza Kelowna | 107-1924 Summit Drive, Kelowna, BC V1V 3E9 | lat 49.901388, lon -119.453050, postal **V1V 3E9 (exact match)**, confidence 1.0 | Agrees with the earlier OSM point (49.9013835, -119.4532433) to within **~5 meters** — the earlier "wrong POI name" (Glenmore Martial Arts) concern is now understood as OSM mistagging a shared/multi-tenant building, not a wrong location; the coordinate itself is corroborated by two independent sources | **HIGH — upgraded, ready to write** |
| 934 | 14th Ave Bar & Grill (Hillview Golf Course) | 1101 14 Avenue, Vernon, BC V1B 2S6 | lat 50.251750, lon -119.245500, postal **V1B 2S6 (exact match)**, confidence 0.8 | Queried Nominatim by the course's **name** (not the street address) and found OSM's own mapped golf-course polygon (bounding box lat 50.2479813–50.2528625, lon -119.2460032– -119.2396377). The geocoder.ca point **falls inside** that boundary; the earlier golf-scorecard-sourced point (50.2518398, -119.2509141) **falls just outside it**, to the west. This is real corroborating evidence favoring the geocoder.ca point over the earlier one | **MODERATE-HIGH — meaningfully improved from "unresolved," but the two sources still differ by ~390m, so flagging for your judgment rather than calling it fully closed** |
| 987 | China Palace | 1933 Main Street, Penticton, BC V2A 5H5 | lat 49.476851, lon -119.583657, postal **V2A 5H5 (exact match)**, confidence **1.0 (highest of all five)** | No second independent building-level source found despite trying OSM (Nominatim + Photon, both only road-level) and the business's own website (no embedded map) | **MODERATE-HIGH — single source, but perfect confidence score and exact postal match** |
| 180 | Dolci Thai Bistro | 8710 Main St, Osoyoos, BC V0H 1V0 | lat 49.032963, lon -119.467977, postal **V0H 1V0 (exact match)**, confidence 0.9 | Same — no second independent building-level source found; OSM only resolves to road-level here | **MODERATE — single strong source** |
| 360 | Lala Ji's pizzeria | 625 Main St, Penticton, BC V2A 5C9 | lat 49.493980, lon -119.589999, postal **V2A 5C9 (exact match)**, confidence 0.9 | Same — no second independent building-level source found | **MODERATE — single strong source** |

* **Recommendation:** #426 is now as solid as #484 was (two independent sources agreeing within meters) — ready to write alongside or after #934 if you're comfortable with the corroboration described above. #987, #180, and #360 rest on one strong, independently-computed, exact-postal-code-matched source each, with no second source found despite genuine effort (OSM structurally can't resolve these three small-town Main Street addresses to building level) — your call on whether that single-source bar is sufficient, or whether you want a manual Google Maps check first for these three specifically.
* **No production data was changed, no admin endpoint was called, nothing was committed to main, nothing was deployed.** This pass was public geocoding-API `GET` requests and business-website reads only.

### Follow-up (2026-09-15, same session, Auto mode) — #360 upgraded; #180 and #987 confirmed at their ceiling

* Found a genuine second independent source for **#360 Lala Ji's pizzeria**: querying Photon (a different OSM query engine) by business name returned an exact POI-name match — `restaurant | Lala Ji's Pizzeria | Main Street, postcode V2A 5C7` at (49.4939043, -119.590323). This lands within **~15-20 meters** of geocoder.ca's independently-computed point (49.493980, -119.589999). **#360 is upgraded to HIGH confidence, ready to write.**
* Tried the same name-based approach (plain and location-biased) for **#180 Dolci Thai Bistro** and **#987 China Palace** — neither is tagged as a named POI in OpenStreetMap at all (Photon returned unrelated global results, including actual Chinese palaces for the "China Palace" query, once location-bias didn't restrict it to Penticton). Also re-confirmed neither business's own website has an embedded map. **These two remain at MODERATE confidence — single strong source (geocoder.ca, exact postal match), and I've now made a genuine, exhausted effort to find a second one without success.**

**Updated confidence summary for the full 6-venue batch:**

| ID | Name | Confidence | Status |
|---|---|---|---|
| 484 | Parlour Ice Cream | HIGH (2 sources) | **WRITTEN — done** |
| 426 | Murray's Pizza Kelowna | HIGH (2 sources, ~5m agreement) | Ready, awaiting approval |
| 360 | Lala Ji's pizzeria | HIGH (2 sources, ~15-20m agreement) | Ready, awaiting approval |
| 934 | 14th Ave Bar & Grill | MODERATE-HIGH (corroborated by course boundary, ~390m spread) | Awaiting your judgment call |
| 987 | China Palace | MODERATE (1 source, confidence 1.0, exhausted search for a 2nd) | Awaiting your judgment call |
| 180 | Dolci Thai Bistro | MODERATE (1 source, confidence 0.9, exhausted search for a 2nd) | Awaiting your judgment call |

* **No production data was changed, no admin endpoint was called, nothing was committed to main, nothing was deployed.**

## EXECUTED — #426 and #360 Production Enrichment (2026-09-15)

### Claude — two-venue write, completed and verified. Scope strictly limited to these two IDs, per instruction.

* **Status: DONE.** Only IDs 426 and 360 were touched. #934, #987, and #180 were explicitly NOT written, per instruction — they remain "awaiting your judgment call" as documented above.
* **Mechanism:** `POST /admin/enrich-venue` via the existing guarded `guardedEnrichUpdate()` path, same as the #484 write — no new code, no schema change, no bypass. Auth via `railway run` (already-linked Railway project), so `ENRICHMENT_ADMIN_TOKEN`'s value was never printed, logged, or exposed anywhere.
* **Pre-write verification (both):** live `GET /api/venues/{426,360}` confirmed identity — #426 "Murray's Pizza Kelowna", region `kelowna`, phone `+1 778-484-3000`; #360 "Lala Ji's pizzeria", region `penticton`, phone `+1 778-622-2211`. Both had `address`/`latitude`/`longitude` all `null`. Active count baseline: 1,055.
* **Writes performed (the exact HIGH-confidence values documented above in this file):**
  * `#426`: `{"address": "107-1924 Summit Drive, Kelowna, BC V1V 3E9", "latitude": 49.901388, "longitude": -119.453050}` → `{"id":426,"results":{"address":"written","latitude":"written","longitude":"written"}}`
  * `#360`: `{"address": "625 Main St, Penticton, BC V2A 5C9", "latitude": 49.493980, "longitude": -119.589999}` → `{"id":360,"results":{"address":"written","latitude":"written","longitude":"written"}}`
  * Both responses show all three fields as `"written"` (not `"skipped_not_empty"`), confirming both were genuinely empty beforehand.
* **Post-write verification (all passed, both venues):**
  * `address`, `latitude`, `longitude` on both live records now exactly match the values written.
  * Every other field on both — `phone`, `name`, `region`, `type`, `slug`, `cuisine`, `rating`, `price`, `reviews`, `description`, `description_fr`, `hours`, `website`, `image_url`, `redirect_to` (still null on both), and all 12 boolean amenity flags — is byte-for-byte identical to each pre-write record. Only `updated_at` changed on each, as expected.
  * Active venue count: still 1,055 (unchanged).
  * Redirect count: structurally unchanged (same reasoning as the #484 write) — `guardedEnrichUpdate()` never touches `redirect_to`, and both records still show `redirect_to: null` directly.
* **No anomalies found.**
* **Missing-location count impact:** 65 → 63 active venues now missing address/lat/lng (arithmetic inference from these two writes plus the earlier #484 write; not independently re-pulled as part of this entry).
* **Manifest was not touched. No other venue was modified. No duplicates were merged or retired. No application code was changed. No deployment occurred.**
* **Remaining in the original 6-venue batch:** #934 (moderate-high, ~390m spread between two sources), #987 and #180 (moderate, single-source each) — **not written, awaiting separate approval as instructed.**

## Further Read-Only Research: #934, #987, #180 (2026-09-15) — Proposed, NOT Written

### Claude — additional independent-source research. #934 resolved to HIGH; #987 and #180 remain single-source after exhausted search.

* **Status: read-only. No admin endpoint was called, no production data was changed, no merge/retire performed, no code changed, no deployment.**
* **Method:** beyond the geocoder.ca / OSM (Nominatim + Photon) sources already tried, this pass added: Overpass API (structured name + house-number queries directly against OSM, more precise than Photon's fuzzy text ranking), golf-specific directories (GolfPass, Hole19, InteGolf), and raw-HTML fetches (bypassing AI-summarization, which can miss embedded JSON-LD) against Yelp, restaurantji, foodpages.ca, canpages.ca, and yellowpages.ca.

**#934 14th Ave Bar & Grill (Hillview Golf Course) — RESOLVED to HIGH confidence.**

Found a genuinely independent **third** source: **InteGolf**'s own course listing page embeds `schema.org GeoCoordinates` structured data for Hillview Golf Course specifically, including its own geocode timestamp (`"geocodeFetchedAt":"2026-03-17T08:13:26.551Z"`) — proof it's InteGolf's own independently-run geocode, not copied from OSM or geocoder.ca.

| Source | Lat | Lon | Independent of |
|---|---|---|---|
| golftraxx (golf scorecard site, used earlier) | 50.2518398 | -119.2509141 | — |
| geocoder.ca | 50.251750 | -119.245500 | OSM |
| **InteGolf** (new) | **50.2517967** | **-119.2458648** | OSM and geocoder.ca |

geocoder.ca and InteGolf — two genuinely independent sources — agree to within **~27 meters**. The golftraxx point is now the clear outlier, off by **~360m in longitude** from both. Combined with the earlier finding that geocoder.ca's point falls inside OSM's own mapped golf-course boundary polygon while golftraxx's point falls just outside it, there are now three separate pieces of evidence converging on the same ~50.2518, -119.2459 area and one outlier. **Recommended coordinate: latitude 50.2517967, longitude -119.2458648** (InteGolf's value, chosen for being both course-specific and independently timestamped; geocoder.ca's near-identical value serves as corroboration). **Confidence: HIGH — ready to write.**

**#987 China Palace and #180 Dolci Thai Bistro — still single-source, despite a genuinely exhausted search.**

Neither business is tagged as a named POI in OpenStreetMap (confirmed via both Photon fuzzy search and Overpass structured name/house-number queries — Overpass returned a clean, complete **empty result** for Dolci Thai's exact address, and a **timeout** for China Palace's structured query after two attempts, so that one specific check remains inconclusive rather than a clean negative). All of Yelp, restaurantji, foodpages.ca, canpages.ca, and yellowpages.ca either 403'd bot traffic or had no embedded geo data in their raw HTML. Neither business's own website has an embedded map. Both remain resting on their single geocoder.ca result documented earlier (#180: 49.032963, -119.467977, postal V0H 1V0 exact match, confidence 0.9; #987: 49.476851, -119.583657, postal V2A 5H5 exact match, confidence 1.0). **Confidence: MODERATE for both — unchanged from the prior pass. Your call on whether the single strong source is sufficient to write, given further free-tier search has been genuinely exhausted for these two.**

* **No production data was changed, no admin endpoint was called, no merge/retire performed, no application code was changed, nothing was deployed.**

## Google Maps / Manual Verification Attempt for #934, #987, #180 (2026-09-15) — Proposed, NOT Written

### Claude — read-only research. Important tooling caveat, then real progress via a different route.

* **Status: read-only. No admin endpoint was called, no production data was changed, no merge/retire performed, no code changed, nothing deployed.**
* **Tooling caveat, stated upfront rather than glossed over:** I do not have a browser or the Google Maps/Places API. Direct fetches of `google.com/maps` URLs (both via the standard fetch tool and raw `curl` with a browser user-agent) only return Google's JavaScript application shell with an encoded session/tile-request blob — no rendered place data, no real coordinates. I cannot literally "open Google Maps and read a pin" the way a person would. I'm reporting this limitation directly rather than fabricating a Google Maps result.
* **What I did instead:** searched for third-party pages that have already published Google-sourced (or independently computed) coordinates as plain text/structured data for these three businesses, then applied raw-HTML fetches (bypassing AI-summarization, which was missing embedded JSON) to promising candidates. This surfaced a genuinely useful new source: **restaurantguru.com**, which embeds precise `lat`/`lng` values in its raw page source for both #180 and #987.

**#180 Dolci Thai Bistro** — geocoder.ca (49.032963, -119.467977) vs. restaurantguru.com (49.0329628, -119.4679765): **0.0m apart** (agree to sub-meter precision). This is close enough that I want to flag the honest caveat rather than oversell it: this could mean two independent geocoders both landed on the exact right point, or it could mean restaurantguru licenses/shares a data pipeline with a similar Canadian civic-geocoding provider. The China Palace result below argues against pure copying (see next). **Confidence: HIGH** (two sources, effectively identical). **Recommended: latitude 49.032963, longitude -119.467977.**

**#987 China Palace** — geocoder.ca (49.476851, -119.583657) vs. restaurantguru.com (49.4769317, -119.5840477): **29.6m apart**. This is a real, non-trivial difference — not a copy-paste match — which is actually reassuring: it suggests restaurantguru is running its own geocoding rather than mechanically reproducing geocoder.ca's output (which in turn supports treating the near-identical #180 result above as genuine independent agreement rather than a copied value). A ~30m spread between two independently-computed geocodes for a real building is normal and comparable to the #934/#426 upgrades already recorded in this file. **Confidence: HIGH** (two sources, ~30m agreement — same tier as #426 and #360's already-approved evidence). **Recommended: latitude 49.476851, longitude -119.583657** (geocoder.ca's value, since it carries the higher self-reported confidence score of 1.0 vs. restaurantguru's unstated confidence).

**#934 14th Ave Bar & Grill (Hillview Golf Course) — the ~390m discrepancy, resolved as far as available tools allow.** I could not access Google Maps directly to arbitrate this. Instead, precise distance calculations (haversine) across all three sources now on record:

| Pair | Distance |
|---|---|
| geocoder.ca ↔ InteGolf (both from the prior research pass) | **26.5m** |
| golftraxx (the original scorecard source) ↔ InteGolf | **359.0m** |

This confirms numerically what was described qualitatively before: geocoder.ca and InteGolf — two sources independent of each other and of OSM — tightly agree, while golftraxx is the clear outlier. I was not able to bring in a fourth, Google-sourced point to further triangulate, given the tooling limitation above. **Confidence: HIGH** (two independent sources agreeing within 27m, consistent with the course-boundary-polygon corroboration already documented). **Recommended: latitude 50.2517967, longitude -119.2458648** (unchanged from the prior pass).

**Summary — all three now at HIGH confidence, each backed by two independently-sourced coordinates in reasonably close agreement:**

| ID | Name | Recommended lat | Recommended lon | Sources agreeing | Distance apart | Confidence |
|---|---|---|---|---|---|---|
| 934 | 14th Ave Bar & Grill | 50.2517967 | -119.2458648 | geocoder.ca + InteGolf | 26.5m | HIGH |
| 987 | China Palace | 49.476851 | -119.583657 | geocoder.ca + restaurantguru.com | 29.6m | HIGH |
| 180 | Dolci Thai Bistro | 49.032963 | -119.467977 | geocoder.ca + restaurantguru.com | 0.0m | HIGH |

* **No production data was changed, no admin endpoint was called, no merge/retire performed, no application code was changed, nothing was deployed.** This pass was public web research only (search + raw-HTML fetches of publicly-accessible pages).

## FULL BATCH REPORT — All 63 Remaining Missing-Location Venues (2026-09-15)

### Claude — read-only research, all 63 venues covered. NOT written. Awaiting approval.

* **Status: read-only research only.** No admin endpoint was called, no production data was changed, no merge/retire performed, no application code changed, no deployment, no manifest change. Everything below is a recommendation for the next phase, not an executed action.
* **Method:** combined (a) research already on record in this file from the earlier duplicate/chain-reconciliation deep-dive and the two prior geocoding passes (covers 20 of the 63 directly), with (b) three parallel research batches covering the remaining 19 previously-unresearched clean venues, using the same methodology established throughout this file (identity verification via multiple independent sources, phone cross-check where a phone is stored, geocoding via geocoder.ca / OpenStreetMap Nominatim+Photon / restaurantguru.com raw-HTML, confidence rated by source agreement), plus (c) the pre-existing internal food-truck/mobile/seasonal keyword flags and the previously-completed external verification of the original 13 internally-HIGH candidates (7 of which were downgraded with specific issues already documented earlier in this file).

---

### A. SAFE TO ENRICH — HIGH confidence (11)

| ID | Name | Region | Type | Phone | Verified Address | Rec. Lat | Rec. Lon | Evidence/Sources | Coord. Agreement |
|---|---|---|---|---|---|---|---|---|---|
| 180 | Dolci Thai Bistro | osoyoos | restaurant | +1 250-495-6807 | 8710 Main St, Osoyoos, BC V0H 1V0 | 49.032963 | -119.467977 | geocoder.ca + restaurantguru.com | 0.0m |
| 987 | China Palace | penticton | restaurant | +1 250-492-9883 | 1933 Main Street, Penticton, BC V2A 5H5 | 49.476851 | -119.583657 | geocoder.ca + restaurantguru.com | 29.6m |
| 934 | 14th Ave Bar & Grill | vernon | restaurant | +1 250-549-4653 | 1101 14 Avenue, Vernon, BC V1B 2S6 (Hillview Golf Course) | 50.2517967 | -119.2458648 | geocoder.ca + InteGolf | 26.5m |
| 521 | Poplar Grove Winery | penticton | winery | +1 250-493-9463 | 425 Middle Bench Rd N, Penticton, BC V2A 8S5 | 49.5124383 | -119.5738655 | co-located with already-complete #1012 (The Restaurant at Poplar Grove), same site, same phone | n/a — reused from sibling record |
| 597 | Snowshoe Sam's | big-white | pub | +1 250-765-5959 | Big White Ski Resort, 5375 Big White Rd, Beaverdell, BC V1P 1P3 | 49.7218817 | -118.9288701 | co-located with already-complete #1054 (Sopra: Sam's Italian Kitchen), same building, same phone | n/a — reused from sibling record |
| 1014 | Bench Patio Bistro | naramata | restaurant | +1 250-490-4965 | 1775 Naramata Rd, Penticton, BC V2A 8T8 | 49.5467438 | -119.5697538 | co-located with already-complete #65 (Bench 1775 Winery), same site, same phone | n/a — reused from sibling record |
| 20 | Anarchy Coffee Roasters | kelowna | cafe | none | 1880 Baron Rd C, Kelowna, BC V1X 6G3 | 49.884900 | -119.424325 | geocoder.ca + Photon POI-name match | 18.7m |
| 725 | Tickleberry's on the Beach | penticton | cafe | none | 3798 Parkview St, Penticton, BC V2A 3W4 | 49.453079 | -119.585694 | geocoder.ca + Photon POI "Tickleberries at Skaha Park" | 92.1m |
| 768 | WINGS Restaurants & Pubs - Kelowna | kelowna | pub | none | 1-590 Highway 33 West, Kelowna, BC V1X 6A8 (Rutland) | 49.890341 | -119.397449 | geocoder.ca + Photon suburb-area cross-check; 5 independent directories agree | general-area agreement |
| 769 | WINGS Restaurants & Pubs - Penticton | penticton | pub | none | 152 Riverside Dr, Penticton, BC V2A 5Y4 | 49.498786 | -119.612814 | geocoder.ca, confidence 1.0, unambiguous across sources checked | single source, perfect confidence |
| 908 | Quench on the Boardwalk | kelowna | restaurant | none | 1310 Water St, Kelowna, BC V1Y 9P3 (Delta Hotels Grand Okanagan Resort) | 49.891640 | -119.496681 | geocoder.ca + Photon exact-POI match on the hotel | 73m |

Notes: #521/#597/#1014 reuse coordinates from already-complete sibling records at the exact same physical site (winery/resort/vineyard shared address pattern established earlier in this file) — no fresh geocoding needed, treated as HIGH by construction. #768's geocoder.ca response labeled the city "West Kelowna" for a Rutland address — confirmed this is a postal-routing quirk, not a real location error; Rutland is genuinely part of Kelowna, and a separate, distinct "Wings West Kelowna" location was confirmed NOT to be this record.

---

### B. SAFE TO ENRICH — MODERATE-HIGH confidence (13)

| ID | Name | Region | Type | Phone | Verified Address | Rec. Lat | Rec. Lon | Evidence/Sources | Coord. Agreement |
|---|---|---|---|---|---|---|---|---|---|
| 1019 | Greenside Bar & Grill | osoyoos | restaurant | +1 250-495-7003 | 12300 Golf Course Dr, Osoyoos, BC V0H 1V0 | 49.015736 | -119.491028 | geocoder.ca, confidence 0.8, single source | n/a |
| 535 | RANGE restaurant, bar + patio | vernon | restaurant | +1 250-503-3556 | 301 Village Centre Place, Vernon, BC V1H 1T2 | 50.189133 | -119.387605 | geocoder.ca, confidence 0.9, single source | n/a |
| 581 | Shahi Pakwan | vernon | restaurant | +1 236-426-2627 | 2810 43rd Ave, Vernon, BC V1T 3L3 | 50.274629 | -119.269786 | geocoder.ca, confidence 1.0, single source | n/a |
| 536 | Rail Trail Cafe & Market | coldstream | cafe | none | 13904 Kalamalka Rd, Coldstream, BC V1B 1Y9 | 50.232437 | -119.268655 | geocoder.ca, confidence 0.9, single source | n/a |
| 896 | Kelly & Carlos O'Bryans Restaurant | kelowna | restaurant | +1 250-861-1338 | 262 Bernard Ave, Kelowna, BC V1Y 6N4 | 49.886535 | -119.497750 | geocoder.ca, confidence 1.0; phone independently confirmed via official chain locations page | n/a |
| 39 | BNA Brewing Kelowna | kelowna | brewery | +1 236-420-0025 | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | geocoder.ca, confidence 1.0; phone independently confirmed | n/a |
| 41 | BNA Burger | kelowna | restaurant | +1 236-420-0025 | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | same building as #39, co-located sibling business | n/a |
| 154 | Craft 42 Roasters | kelowna | cafe | none | 1178 High Road, Kelowna, BC V1Y 7B1 | 49.892941 | -119.476575 | geocoder.ca + restaurantguru.com | 83.9m |
| 337 | King's Vegetarian Food | kelowna | restaurant | none | 1631 Dickson Ave, Kelowna, BC | 49.879876 | -119.461448 | geocoder.ca + restaurantguru.com | 68.3m |
| 724 | Tickleberry's at the Peach | penticton | cafe | none | 185 Lakeshore Drive, Penticton, BC (city-owned "Peach" concession, Tickleberry's-operated) | 49.502472 | -119.595796 | geocoder.ca, confidence 1.0; weak secondary corroboration only | n/a |
| 766 | Viva Mexicana Taco Bar | vernon | restaurant | none | 3414 Coldstream Ave, Vernon, BC V1T 1Y1 | 50.263247 | -119.278873 | geocoder.ca, confidence 0.9; strong multi-source identity corroboration (DoorDash x2, order.online x2, Downtown Vernon Association, own site) | n/a |
| 1051 | Moose Lounge | big-white | restaurant | none | 5315 Big White Rd, Kelowna, BC V1P 1P3 (Happy Valley Lodge, Big White Ski Resort) | 49.721408 | -118.926566 | geocoder.ca, confidence 1.0; confirmed via Yelp, Big White's own site | n/a |
| 1069 | Pit Stop Cafeteria | apex | restaurant | none | 100 Strayhorse Rd, Penticton, BC V1M 8L7 (Apex Mountain Resort village address — most precise available) | 49.392108 | -119.903267 | geocoder.ca, confidence 0.77 — noted MODERATE rather than MODERATE-HIGH, single source, but identity and fixed-location status are solid | n/a |

Notes: #1019, #535, #581, #536 are the **canonical records of duplicate pairs** (see category E for their duplicates: #252, #965, #972, #537). Recommended workflow: merge the duplicate into the canonical first (using the existing guarded merge-and-retire mechanism), then enrich the canonical — enriching before merging risks the merge later needing to reconcile a populated field. #1069 is included here despite being only MODERATE confidence (not MODERATE-HIGH) because its identity is fully resolved and a single reasonable-confidence source exists — flagging the distinction rather than silently rounding it up.

---

### C. NEEDS PHONE CORRECTION (3)

| ID | Name | Region | Type | Stored Phone (WRONG) | Correct Phone | Verified Address | Rec. Lat | Rec. Lon | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 328 | Kelly O'Bryan's Restaurant and Carlos O'Bryan's Pub | west-kelowna | pub | +1 250-549-2112 (belongs to Vernon location #954) | +1 250-768-8442 | 3470 Carrington Rd, West Kelowna, BC V4T 3C1 | 49.838433 | -119.609413 | geocoder.ca confidence 1.0; phone correction confirmed via official chain locations page (kobcob.com) |
| 185 | Dosa Crepe Cafe | osoyoos | restaurant | +1 778-753-6939 (belongs to Rutland/Kelowna branch) | 778-597-0245 | 8143 Main St, Osoyoos, BC V0H 1V0 | 49.031811 | -119.463718 | geocoder.ca confidence 0.9; phone correction confirmed via dosacrepecafe.com official site |
| 547 | Red Tomato Pies | vernon | restaurant | +1 236-420-1515 (confirmed to belong to the Kelowna location, 401 Glenmore Rd) | **not yet determined** | 3002 41st Ave, Vernon, BC V1T 3H6 | — | — | address confirmed via multiple sources; the correct Vernon-specific phone still needs a fresh lookup before this can move to enrichment-ready |

Recommended action: use the new (uncommitted, awaiting review — see the earlier `/admin/correct-phone` entry in this file) guarded phone-correction endpoint for #328 and #185 once that work is committed and deployed, combined with the guarded address enrichment. #547 needs one more research step (find Red Tomato Pies Vernon's actual phone number) before it's ready for either correction or enrichment.

---

### D. AMBIGUOUS / NEEDS REVIEW (11)

| ID | Name | Region | Type | Phone | Issue |
|---|---|---|---|---|---|
| 95 | Bright Jenny Coffee | kelowna | cafe | +1 250-860-8848 | 3-4 Kelowna locations found (Lakeshore Rd, Kane Rd, Kirschner Rd, possibly Laurel Ave); phone not disambiguated to one |
| 511 | Pizza Factory | osoyoos | restaurant | +1 250-860-4149 | Address found (8115 Main St, Osoyoos) but its published phone (250-495-2033) doesn't match the stored number — mismatch unresolved, not yet confirmed which is correct |
| 592 | Sky High Diner | vernon | restaurant | +1 778-212-8759 | Address found (6300 Tronson Rd, near Vernon Airport) but one source explicitly labels it "Food Truck in Vernon" — fixed-vs-mobile status unresolved |
| 702 | The Mission Creamery | kelowna | cafe | +1 250-764-6171 | Two Kelowna locations found (450 Cook Rd "AQUA Boat Club"; 4649 Lakeshore Rd); phone not disambiguated to one |
| 806 | barBURRITO | vernon | restaurant | +1 250-717-0959 | Two Vernon locations found (Square Mall: 236-426-2626; Polson Park: 778-943-0776) — **neither** matches the stored phone; may be a third, unlisted location, or the stored number may simply be outdated |
| 225 | Freshslice Pizza | penticton | restaurant | none | Two Penticton locations found (3094 Skaha Lake Rd; 205 Martin Street); no stored phone to disambiguate |
| 311 | Jugo Juice | kelowna | cafe | none | Two Kelowna locations found (4075 Gordon Drive; 219 Bernard Ave); no stored phone to disambiguate |
| 379 | MEX-KELOWNA TACOS | west-kelowna | restaurant | none | Multiple sources call it a food truck, but 4+ independent listings consistently show one fixed address (2241 Moose Rd, Westbank) — this is a **policy question** (does a food truck parked at one consistent, well-documented spot count as enrichable?) rather than a data-quality problem; flagging for a team decision instead of assuming an answer |
| 459 | Okanagan premium fruit juice | kelowna | cafe | none | **Identity could not be confirmed at all** despite genuine search effort — no business by this exact name was located; possibly closed, renamed, or a data-entry variant of a similarly-named business |
| 650 | Tacos del cartel | oliver | restaurant | none | **Identity could not be confirmed at all** — the only "Tacos del Cartel" found is an unrelated restaurant in Louisiana; Oliver's actual taco spots ("Tacos Del Norte", "TacoRiendo") don't match this name |
| 1066 | Francuccino's Gelato and Fries | silverstar | cafe | none | Business identity confirmed as real and currently operating in SilverStar Village, but geocoding is weak and internally inconsistent (two geocoder.ca attempts landed ~1.3km apart, both low confidence 0.2-0.3); recommend manual verification rather than writing a low-confidence coordinate |

Note the important distinction within this category: #95, #225, #311, #702, #806 are "which of several real locations" problems (identity of the business chain is solid, specific branch is not); #459 and #650 are "we cannot confirm this business exists at all" problems (a more serious data-quality flag, worth a closer look at whether these records should even remain active); #379 is a policy question, not a data problem; #511 and #592 are phone/fixed-location doubts layered on an otherwise-plausible single address; #1066 is a confirmed-real business with unreliable geocoding only.

---

### E. LIKELY EXCLUDE / MOBILE / DUPLICATE / OTHER (25)

**Duplicates (5)** — each is the same business as an already-listed canonical record above (categories A/B), recommend merge via the existing guarded merge-and-retire mechanism rather than independent enrichment:

| ID | Name | Duplicate of | Notes |
|---|---|---|---|
| 252 | Greenside Bar and Grill | #1019 | Same business (Osoyoos Golf Club restaurant), same phone |
| 965 | Range Lounge & Grill | #535 | Same business, legacy name, same phone |
| 972 | Shahi Pakwaan | #581 | Same business, spelling variant, same phone |
| 1026 | Pappa's Firehall Bistro | #213 (already complete: 6077 Main St, Oliver BC, lat 49.1815137, lon -119.5503935) | Same business, "Pappa's" is the current branded name; same phone |
| 537 | Rail Trail Cafe Ice Cream Parlor | #536 | Same site, ice-cream counter within the same establishment |

**Confirmed mobile / food truck (19)** — no fixed street address to enrich:

130 CharCo Wood Fired Sandwiches · 131 Charros Takos (also has a phone mismatch) · 156 Crepe Bistro · 158 Creperie Ooolala - Food truck · 196 El Sabor De Marina · 208 Eye Tasty Food · 260 Hammer's House of Hog · 304 Jeffer's Fryzz · 405 Mi Taqueria- Mexican Cantina (pop-up) · 450 OKF Grill · 453 Ogopogo Concessions (confirmed via fresh research: tours BC/AB during summer season, no fixed public location) · 507 Pit Stop Smokery · 531 Queen City Eats · 569 Same Same But Different Thai Food · 642 THE MAGIC FOOD TRUCK LTD · 644 TORI DORI Japanese Chicken & Grill · 652 Tak-Oh · 691 The Hot Box · 809 reggaefusionfood

**Confirmed via fresh research this pass (1)** — was previously in the internally-"clean" tier, corrected here:

| ID | Name | Notes |
|---|---|---|
| 94 | Bread & Cheese Co | Own website explicitly calls it "Summerland Food Truck"; a separate "Bread & Cheese Truck" also exists on Facebook (Delta, BC) — genuinely mobile, not a fixed-location restaurant |

---

### Summary

* **Total researched: 63**
* **A. SAFE TO ENRICH — HIGH: 11** (180, 987, 934, 521, 597, 1014, 20, 725, 768, 769, 908)
* **B. SAFE TO ENRICH — MODERATE-HIGH: 13** (1019, 535, 581, 536, 896, 39, 41, 154, 337, 724, 766, 1051, 1069)
* **C. NEEDS PHONE CORRECTION: 3** (328, 185, 547)
* **D. AMBIGUOUS / NEEDS REVIEW: 11** (95, 511, 592, 702, 806, 225, 311, 379, 459, 650, 1066)
* **E. LIKELY EXCLUDE / MOBILE / DUPLICATE / OTHER: 25** (252, 965, 972, 1026, 537, 130, 131, 156, 158, 196, 208, 260, 304, 405, 450, 453, 507, 531, 569, 642, 644, 652, 691, 809, 94)

**Exact IDs recommended for production enrichment (A + B, 24 total):** 20, 39, 41, 154, 337, 521, 535, 536, 581, 597, 724, 725, 766, 768, 769, 896, 908, 934, 987, 1014, 1019, 1051, 1069, 180 — **with the caveat that #1019, #535, #581, #536 should be merged with their duplicates (#252, #965, #972, #537 respectively) before or as part of enrichment, not enriched independently first.**

**Exact IDs requiring phone correction (3):** 328, 185, 547 (547 additionally needs the correct phone number sourced before it's ready)

**Exact IDs requiring further review (11):** 95, 511, 592, 702, 806, 225, 311, 379, 459, 650, 1066

**Exact IDs recommended for exclusion (25):** 252, 965, 972, 1026, 537, 130, 131, 156, 158, 196, 208, 260, 304, 405, 450, 453, 507, 531, 569, 642, 644, 652, 691, 809, 94

**Particularly important findings/anomalies:**
1. **Two venues have no confirmable identity at all** (#459 Okanagan premium fruit juice, #650 Tacos del cartel) — genuine search effort turned up nothing matching. This is a more serious data-quality flag than the usual "which location" ambiguity and may warrant checking whether these records reflect closed/renamed businesses that should be corrected or retired rather than enriched.
2. **One food truck (#379) is consistently listed at a single fixed address across 4+ independent sources** — this is a policy question for the team (should a food truck with one well-documented, unchanging location be treated like any other fixed venue?), not something resolved unilaterally here.
3. **One previously "clean" internal-tier venue was reclassified to EXCLUDE** on fresh research (#94 Bread & Cheese Co, confirmed mobile) — a reminder that the original internal keyword-based tiering from 2026-09-08 continues to need fresh external verification, exactly as this project's conservative process requires.
4. **Five genuine duplicates were found within this batch** (#252, #965, #972, #1026, #537), all already known from the earlier duplicate-reconciliation research in this file — no *new* duplicates surfaced, which is a reassuring consistency check on the earlier work.
5. **#511 Pizza Factory and #547 Red Tomato Pies both show the same "phone belongs to the wrong location" pattern already established for #328 and #185** — suggests this data-quality issue (phone numbers copied across chain locations during the original scrape) may be more widespread than the four cases found so far; worth keeping an eye out for in any future batches.

* **No production data was changed, no admin endpoint was called, no merge/retire performed, no application code was changed, no manifest change, no deployment.** This entire batch was public web research (search, geocoding APIs, raw-HTML fetches of publicly-accessible pages) only.

## EXECUTED — #180, #934, #987 Production Enrichment (2026-09-15)

### Claude — three-venue write, completed and verified. Scope strictly limited to these three IDs, per instruction.

* **Status: DONE.** Only IDs 180, 934, and 987 were touched — the three Category A (HIGH confidence) venues from the full 63-venue batch report whose coordinates weren't already covered by the earlier #426/#360 write. #360, #426, and #484 were not touched (already complete from prior batches). No other venue from the 63-venue report was written, merged, retired, or otherwise modified.
* **Mechanism:** `POST /admin/enrich-venue` via the existing guarded `guardedEnrichUpdate()` path, same as every prior write this session — no new code, no schema change, no bypass. Auth via `railway run` (already-linked Railway project), so `ENRICHMENT_ADMIN_TOKEN`'s value was never printed, logged, or exposed anywhere.
* **Pre-write verification (all three):** live `GET /api/venues/{180,934,987}` confirmed identity — #180 "Dolci Thai Bistro", osoyoos, phone `+1 250-495-6807`; #934 "14th Ave Bar & Grill", vernon, phone `+1 250-549-4653`; #987 "China Palace", penticton, phone `+1 250-492-9883`. All three had `address`/`latitude`/`longitude` all `null`. Active count baseline: 1,055.
* **Writes performed (the exact HIGH-confidence values documented in the full batch report above):**
  * `#180`: `{"address": "8710 Main St, Osoyoos, BC V0H 1V0", "latitude": 49.032963, "longitude": -119.467977}` → `{"id":180,"results":{"address":"written","latitude":"written","longitude":"written"}}`
  * `#934`: `{"address": "1101 14 Avenue, Vernon, BC V1B 2S6", "latitude": 50.2517967, "longitude": -119.2458648}` → `{"id":934,"results":{"address":"written","latitude":"written","longitude":"written"}}`
  * `#987`: `{"address": "1933 Main Street, Penticton, BC V2A 5H5", "latitude": 49.476851, "longitude": -119.583657}` → `{"id":987,"results":{"address":"written","latitude":"written","longitude":"written"}}`
  * All three responses show all three fields as `"written"` (not `"skipped_not_empty"`), confirming all were genuinely empty beforehand.
* **Post-write verification (all passed, all three venues):**
  * `address`, `latitude`, `longitude` on all three live records now exactly match the values written.
  * Every other field on all three — `phone`, `name`, `region`, `type`, `slug`, `cuisine`, `rating`, `price`, `reviews`, `description`, `description_fr`, `hours`, `website`, `image_url`, `redirect_to` (still null on all three), and all 12 boolean amenity flags — confirmed unchanged (structurally guaranteed by `guardedEnrichUpdate()`'s field allowlist, which only ever touches address/latitude/longitude; independently re-confirmed via direct comparison against the pre-write values for name/region/type/phone/redirect_to). Only `updated_at` changed on each, as expected.
  * Active venue count: still 1,055 (unchanged).
  * Redirect count: structurally unchanged — `guardedEnrichUpdate()` never touches `redirect_to`, and all three records still show `redirect_to: null` directly.
* **No anomalies found.**
* **Missing-location count impact:** 63 → 60 active venues now missing address/lat/lng (arithmetic inference from these three writes; not independently re-pulled as part of this entry).
* **Manifest was not touched. No other venue was modified. No duplicates were merged or retired. No application code was changed. No deployment occurred.**
* **Remaining from the full 63-venue batch report:** Category B (13 venues), Category C (3, need phone correction), Category D (11, ambiguous), and Category E (25, exclude/duplicate) — **none written, awaiting separate approval.**

## Preflight — Category A (HIGH confidence) Batch, Pre-Approval Check (2026-09-15)

### Claude — read-only preflight only. No production writes performed.

* **Status: read-only. No admin endpoint was called, no production data was changed, no merge/retire performed, no code changed, nothing deployed.**
* **Scope:** all 11 Category A (HIGH confidence) IDs from the full 63-venue batch report (20, 180, 521, 597, 725, 768, 769, 908, 934, 987, 1014). Pulled fresh `GET /api/venues/:id` for every one of them.
* **Already completed (3) — confirmed untouched by this preflight, matches the approved write exactly:**
  * `#180` Dolci Thai Bistro — address/lat/lon populated, matches the approved values exactly.
  * `#934` 14th Ave Bar & Grill — address/lat/lon populated, matches the approved values exactly.
  * `#987` China Palace — address/lat/lon populated, matches the approved values exactly.
* **Still safe to enrich (8) — all pass preflight cleanly, no drift since the original research, identity/region/type/phone all still match:**

| ID | Name | Region | Type | Phone | Still Empty? | Matches Research? |
|---|---|---|---|---|---|---|
| 20 | Anarchy Coffee Roasters | kelowna | cafe | none | yes | yes |
| 521 | Poplar Grove Winery | penticton | winery | +1 250-493-9463 | yes | yes |
| 597 | Snowshoe Sam's | big-white | pub | +1 250-765-5959 | yes | yes |
| 725 | Tickleberry's on the Beach | penticton | cafe | none | yes | yes |
| 768 | WINGS Restaurants & Pubs - Kelowna | kelowna | pub | none | yes | yes |
| 769 | WINGS Restaurants & Pubs - Penticton | penticton | pub | none | yes | yes |
| 908 | Quench on the Boardwalk | kelowna | restaurant | none | yes | yes |
| 1014 | Bench Patio Bistro | naramata | restaurant | +1 250-490-4965 | yes | yes |

* **No venues required flagging.** No identity drift, no phone changes, no region/type changes, no field already populated by another process since the research was recorded.
* **No production data was changed, no admin endpoint was called, nothing was deployed.** This was `GET`-only verification.

**READY FOR NEXT APPROVAL:**
* IDs still safe to enrich: 20, 521, 597, 725, 768, 769, 908, 1014
* IDs requiring review: none
* IDs already completed: 180, 934, 987 (and 360, 426, 484 from the prior batch)

## FINAL STATUS — #180, #934, #987 Production Enrichment: COMPLETED (2026-09-15)

### Claude — consolidated, freshly re-verified execution record. This supersedes any earlier partial mentions of this batch scattered above; this is the authoritative summary.

**Result for all three: COMPLETED.** Freshly re-verified against live production immediately before writing this entry (not reused from memory).

| Field | #180 Dolci Thai Bistro | #934 14th Ave Bar & Grill | #987 China Palace |
|---|---|---|---|
| Write status | **COMPLETED** | **COMPLETED** | **COMPLETED** |
| Address written | 8710 Main St, Osoyoos, BC V0H 1V0 | 1101 14 Avenue, Vernon, BC V1B 2S6 | 1933 Main Street, Penticton, BC V2A 5H5 |
| Latitude written | 49.032963 | 50.2517967 | 49.476851 |
| Longitude written | -119.467977 | -119.2458648 | -119.583657 |
| Pre-write state | address/lat/lon all `null` (verified) | address/lat/lon all `null` (verified) | address/lat/lon all `null` (verified) |
| Post-write live values (just re-checked) | address/lat/lon match exactly | address/lat/lon match exactly | address/lat/lon match exactly |
| Phone unchanged | +1 250-495-6807 ✓ | +1 250-549-4653 ✓ | +1 250-492-9883 ✓ |
| `redirect_to` unchanged | null ✓ | null ✓ | null ✓ |
| `updated_at` | 2026-09-15 06:58:58 (only field-level timestamp changed) | 2026-09-15 06:59:00 | 2026-09-15 06:59:01 |

* **Mechanism used:** `POST /admin/enrich-venue` (the existing guarded `guardedEnrichUpdate()` path), executed via `railway run` so `ENRICHMENT_ADMIN_TOKEN` was never exposed. No code was modified to perform this write — it used the endpoint already shipped and reviewed earlier in this branch's history.
* **All other fields confirmed unchanged on all three** — `name`, `region`, `type`, `slug`, `cuisine`, `rating`, `price`, `reviews`, `description`, `description_fr`, `hours`, `website`, `image_url`, and all 12 boolean amenity flags, verified by direct re-read just now against the values recorded at write time. Only `updated_at` changed, as expected of any successful write.
* **Active venue count:** 1,055 both before and after this batch (re-confirmed via `GET /api/stats` just now) — unchanged, as expected (enrichment never adds/removes active venues).
* **Redirect count:** unchanged — structurally guaranteed, since `guardedEnrichUpdate()` never touches `redirect_to`, and all three records still show `redirect_to: null` directly.
* **No other venue was modified.** Only these three IDs were targeted by any write call in this batch. `#360`, `#426`, and `#484` (from the prior batch) remain untouched and complete; confirmed via this same session's git/branch state that no merge, retire, or code change accompanied this write.
* **Commit SHA for the original execution record:** `5a480b9` ("Record executed production enrichment for IDs 180, 934, 987") — the write itself happened before that commit; this new entry is a fresh, independent re-verification, not a restatement from memory.
* **Commit SHA for this consolidated FINAL STATUS entry:** this entry's own commit, reported in the chat response accompanying this update (a file cannot embed its own future commit hash).
* **No production writes, code changes, merges/retirements, manifest changes, or deployments were performed as part of producing this status report.** This entry is documentation of an already-completed action, re-verified read-only.

## Live Status Check — #180, #934, #987 (2026-09-15, re-confirmed)

Direct, minimal re-check of live production, no writes performed:

| ID | Name | address | latitude | longitude |
|---|---|---|---|---|
| 180 | Dolci Thai Bistro | ✅ `8710 Main St, Osoyoos, BC V0H 1V0` | ✅ `49.032963` | ✅ `-119.467977` |
| 934 | 14th Ave Bar & Grill | ✅ `1101 14 Avenue, Vernon, BC V1B 2S6` | ✅ `50.2517967` | ✅ `-119.2458648` |
| 987 | China Palace | ✅ `1933 Main Street, Penticton, BC V2A 5H5` | ✅ `49.476851` | ✅ `-119.583657` |

All three fields are populated on all three venues, live, right now. This matches the FINAL STATUS entry immediately above and the original execution record at commit `5a480b9`. **Note for anyone not seeing this file's history: this content exists only on the `ai-handoff/2026-09-15` branch, never on `main`** — that separation was set up deliberately earlier in this session so `main` stays untouched until a human explicitly merges. If this content isn't visible, check that the branch selector is set to `ai-handoff/2026-09-15`, not `main`.

## EXECUTED — 8-Venue Production Enrichment Batch (2026-09-15)

### Claude — IDs 20, 521, 597, 725, 768, 769, 908, 1014. Completed and fully verified. Strict scope, zero anomalies.

* **Status: DONE.** All 8 approved IDs written successfully. No other venue was touched.
* **Mechanism:** `POST /admin/enrich-venue` via the existing guarded `guardedEnrichUpdate()` path — no new code, no schema change, no bypass. Auth via `railway run` (already-linked Railway project); `ENRICHMENT_ADMIN_TOKEN`'s value was never printed, logged, or exposed.
* **Pre-write verification (all 8):** live `GET /api/venues/:id` confirmed identity, region, type, and phone for every one of the 8 matched the approved research exactly, and all 8 had `address`/`latitude`/`longitude` entirely `null`. No precondition mismatches — nothing needed to be stopped or flagged. Baseline: active count 1,055; missing-location count 60.

| ID | Name | Address Written | Lat | Lon | Write Result |
|---|---|---|---|---|---|
| 20 | Anarchy Coffee Roasters | 1880 Baron Rd C, Kelowna, BC V1X 6G3 | 49.8849 | -119.424325 | written / written / written |
| 521 | Poplar Grove Winery | 425 Middle Bench Rd N, Penticton, BC V2A 8S5 | 49.5124383 | -119.5738655 | written / written / written |
| 597 | Snowshoe Sam's | Big White Ski Resort, 5375 Big White Rd, Beaverdell, BC V1P 1P3 | 49.7218817 | -118.9288701 | written / written / written |
| 725 | Tickleberry's on the Beach | 3798 Parkview St, Penticton, BC V2A 3W4 | 49.453079 | -119.585694 | written / written / written |
| 768 | WINGS Restaurants & Pubs - Kelowna | 1-590 Highway 33 West, Kelowna, BC V1X 6A8 | 49.890341 | -119.397449 | written / written / written |
| 769 | WINGS Restaurants & Pubs - Penticton | 152 Riverside Dr, Penticton, BC V2A 5Y4 | 49.498786 | -119.612814 | written / written / written |
| 908 | Quench on the Boardwalk | 1310 Water St, Kelowna, BC V1Y 9P3 | 49.89164 | -119.496681 | written / written / written |
| 1014 | Bench Patio Bistro | 1775 Naramata Rd, Penticton, BC V2A 8T8 | 49.5467438 | -119.5697538 | written / written / written |

* **Every response showed all three fields as `"written"`** (never `"skipped_not_empty"`), confirming all 8 were genuinely empty immediately before the write.
* **Post-write verification (all 8, all passed):**
  * `address`/`latitude`/`longitude` on all 8 live records exactly match the table above.
  * Every other field on all 8 — `phone`, `name`, `region`, `type`, `slug`, `cuisine`, `rating`, `price`, `reviews`, `description`, `description_fr`, `hours`, `website`, `image_url`, `redirect_to` (still null on all 8), and all 12 boolean amenity flags — confirmed unchanged via direct comparison against the pre-write values. Only `updated_at` changed on each, as expected.
  * **Active venue count: 1,055 both before and after — unchanged.**
  * **Redirect count: structurally unchanged** — `guardedEnrichUpdate()` never touches `redirect_to`; all 8 records confirmed `redirect_to: null` directly.
  * **Missing-location count: 60 → 52, a decrease of exactly 8.** Verified precisely via a full before/after set diff (not just a count comparison): the set of ids removed from "missing" was exactly `{20, 521, 597, 725, 768, 769, 908, 1014}` — an exact match to the approved batch — and the set of ids newly added to "missing" was empty. No other venue's missing/complete status changed in either direction.
* **No anomalies of any kind.** No write failed, no precondition mismatch, no unexpected field change, no count drift.
* **No merge, retire, delete, redirect, or venue creation occurred. No manifest change. No application code change. No deployment.**
* **Category A (HIGH confidence, 11 total) is now FULLY COMPLETE:** all 8 written this batch (20, 521, 597, 725, 768, 769, 908, 1014) plus the 3 written in the prior batch (180, 934, 987) account for the entire Category A list — verified by exact set comparison, no Category A member remains unwritten.
* **Category B (MODERATE-HIGH, 13 total) remains entirely unwritten** — none of this batch's 8 IDs were Category B members (confirmed: zero overlap). Category B still needs a decision on its 4 duplicate-pair canonicals (1019, 535, 581, 536 — each has a duplicate, #252/#965/#972/#537 respectively, that should be merged first) plus the 9 non-duplicate members (896, 39, 41, 154, 337, 724, 766, 1051, 1069).
* **Category C (3, need phone correction), Category D (11, ambiguous), and Category E (25, exclude/duplicate) remain entirely unwritten**, awaiting separate approval.

## Category B (MODERATE-HIGH) Research — Duplicate Pairs + Non-Duplicate Candidates (2026-09-15)

### Claude — read-only research only. No production writes, no merges, no code changes, no deployment.

* **Status: read-only.** No admin endpoint was called, no production data was changed, no merge/retire performed, no code changed, no manifest change, nothing deployed.
* **Step 1 — reconciliation:** pulled `GET /api/venues?limit=2000` fresh. **Result: exactly 52 active venues missing address/lat/lng, identical to the count/IDs reported after the Category A batch completed.** No drift since the last check.
* **Step 2 — fresh field comparison for the 4 duplicate pairs**, pulled directly from live data (not reused from memory) to confirm nothing has changed since the earlier reconciliation research.

---

### Duplicate pairs — investigation, NOT executed

**#252 → #1019 (Greenside Bar and Grill / Greenside Bar & Grill, Osoyoos)**
- Same real-world business: confirmed — both are the restaurant at Osoyoos Golf Club. Phone identical on both (`+1 250-495-7003`, live-confirmed), rating identical (4.3), address 12300 Golf Course Dr, Osoyoos, BC V0H 1V0 (externally corroborated via Yelp/Destination Osoyoos/Facebook).
- Canonical recommendation: **#1019** (fuller description explicitly naming "Osoyoos Golf Club" and matching menu detail).
- What a merge would preserve: `description_fr` (populated on #252, null on canonical #1019) — **mergeable**. `price`/`reviews` already populated on the canonical (2 / 83) — not mergeable, nothing lost (canonical's values are correct and untouched either way).
- Reason not to merge: none found.

**#965 → #535 (Range Lounge & Grill / RANGE restaurant, bar + patio, Vernon/Predator Ridge)**
- Same real-world business: confirmed — both are the Predator Ridge Resort restaurant. Phone identical (`+1 250-503-3556`, live-confirmed), rating identical (4.3). Current official branding is "RANGE restaurant, bar + patio" per Predator Ridge's own site; "Range Lounge & Grill" is a legacy name still present in some directories.
- Canonical recommendation: **#535** (matches current official branding).
- What a merge would preserve: nothing is actually mergeable this time — `reviews` differ (965=546, 535=535) but the canonical is already non-null so the guarded merge path can't touch it (not lost — the duplicate's row is retained, not deleted, when retired, just not reconciled into one number). `price` and `description_fr` are already populated identically/appropriately on the canonical.
- Reason not to merge: none found.

**#972 → #581 (Shahi Pakwaan / Shahi Pakwan, Vernon)**
- Same real-world business: confirmed — single family-run Vernon restaurant, a name-spelling duplicate. Phone identical (`+1 236-426-2627`, live-confirmed), rating identical (4.5), address 2810 43rd Ave, Vernon, BC V1T 3L3 (multiple independent sources).
- Canonical recommendation: **#581** ("Shahi Pakwan" — matches the majority of external listings; the business's own domain is oddly spelled "shaipakwan.ca" but that's not treated as decisive).
- What a merge would preserve: `price` (2) and `reviews` (705) are populated on the duplicate #972 but null on canonical #581 — **both mergeable**. `description_fr` already populated on canonical.
- Reason not to merge: none found.

**#537 → #536 (Rail Trail Cafe Ice Cream Parlor / Rail Trail Cafe & Market, Coldstream)**
- Same real-world business: confirmed — one physical site at 13904 Kalamalka Rd, Coldstream, BC V1B 1Y9. An independent source explicitly describes one building housing both the "market" and "ice cream" functions these two records separately describe. Neither has a phone stored. Ratings differ (537=4.9, 536=4.5) — real variance in scraped review sentiment, not evidence against being the same site.
- Canonical recommendation: **#536** ("Rail Trail Cafe & Market" matches the official name used by Facebook/Tripadvisor/Google).
- What a merge would preserve: nothing is mergeable — `description_fr` is populated on BOTH sides with genuinely different text (not lost, just not reconciled into one field; both texts remain readable on the retired duplicate's row).
- Reason not to merge: none found.

**Summary: all 4 pairs are genuine duplicates with a clear canonical choice and no reason found not to merge. None were merged — this is investigation only, awaiting separate approval.**

---

### Non-duplicate Category B candidates — fresh identity + second-source coordinate research

Dispatched two parallel research passes specifically hunting for a SECOND independent building-level coordinate source for every single-source candidate (restaurantguru.com raw-HTML fetch, Photon/Nominatim POI-name search, Overpass structured queries, ski-resort/golf directories) — the same techniques that worked for the already-written Category A batch.

| ID | Name | Region | Phone | Verified Address | Lat | Lon | Sources | Agreement | Confidence | Caveat |
|---|---|---|---|---|---|---|---|---|---|---|
| 896 | Kelly & Carlos O'Bryans Restaurant | kelowna | +1 250-861-1338 | 262 Bernard Ave, Kelowna, BC V1Y 6N4 | 49.886535 | -119.497750 | geocoder.ca + restaurantguru.com | **9.2m** | **HIGH** (upgraded) | restaurantguru.com carries a separate listing for the West Kelowna location (#328) — confirmed the correct downtown listing was used, not confused with #328 |
| 39 | BNA Brewing Kelowna | kelowna | +1 236-420-0025 | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | geocoder.ca + restaurantguru.com | **0.0m** | **HIGH** (upgraded) | none |
| 41 | BNA Burger | kelowna | +1 236-420-0025 | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | co-located sibling of #39, same building | 0.0m | **HIGH** (upgraded) | none |
| 154 | Craft 42 Roasters | kelowna | none | 1178 High Road, Kelowna, BC V1Y 7B1 | 49.892941 | -119.476575 | geocoder.ca + restaurantguru.com (reconfirmed) | 83.9m | MODERATE-HIGH (unchanged) | none |
| 337 | King's Vegetarian Food | kelowna | none | 1631 Dickson Ave, Kelowna, BC | 49.879876 | -119.461448 | geocoder.ca + restaurantguru.com (reconfirmed) | 68.3m | MODERATE-HIGH (unchanged) | none |
| 724 | Tickleberry's at the Peach | penticton | none | 185 Lakeshore Drive, Penticton, BC | 49.502472 | -119.595796 | geocoder.ca + Nominatim/Photon exact POI "The Peach" (ice_cream amenity, house-number exact) | **103.0m** | MODERATE-HIGH (upgraded from a weak prior match) | Nominatim and Photon aren't fully independent of each other (same underlying OSM data), but both are independent of geocoder.ca and this is a genuine POI+housenumber match, not a road midpoint |
| 766 | Viva Mexicana Taco Bar | vernon | none | 3414 Coldstream Ave, Vernon, BC V1T 1Y1 | 50.263247 | -119.278873 | geocoder.ca only | n/a | MODERATE (unchanged) | Genuine second-source search exhausted — restaurantguru 404'd (3 URL variants tried), Nominatim only road-level, Photon found only unrelated same-named restaurants elsewhere |
| 1051 | Moose Lounge | big-white | none | 5315 Big White Rd, Kelowna, BC V1P 1P3 (Happy Valley Lodge) | 49.721408 | -118.926566 | geocoder.ca only | n/a | MODERATE-HIGH (unchanged) | Overpass queries for the resort timed out twice (server overload, inconclusive rather than a real negative) — worth retrying later, not a confirmed dead end |
| 1069 | Pit Stop Cafeteria | apex | none | 100 Strayhorse Rd, Penticton, BC V1M 8L7 (Apex Mountain Resort's general address) | 49.392108 | -119.903267 | geocoder.ca only, confidence 0.77 (weakest in this batch) | n/a | **MODERATE — explicitly do NOT upgrade** | Overpass found real Apex Mountain Resort structured data (a specific building "Apex Mtn Inn," the resort's own sports-centre node) but **neither matches this address** — both are 216–253m away. This is new evidence of genuine uncertainty about exactly where within Apex Village this cafeteria sits, not corroboration. Recommend holding this one back rather than treating it as ready. |

---

### Proposed next batch — meets the same HIGH-confidence standard as the already-written Category A batch

Applying the same bar used throughout this project (two independent sources agreeing within ~50m, or a single very-high-confidence source reused directly from an already-verified sibling record — neither applies loosely here):

**#896, #39, #41** — all three newly upgraded to HIGH confidence this pass (9.2m and 0.0m agreement respectively). These are the only Category B members that meet the strict HIGH bar right now.

The rest of Category B (154, 337, 724, 1051, 766, 1069) remain at MODERATE-HIGH or MODERATE and are **not** included in this proposed batch — presented above for your own judgment call on whether to accept a looser bar for any of them, but not recommended as "HIGH-confidence ready" under the standard this project has used for every actual write so far.

**#1069 specifically is flagged as weaker than before this pass, not stronger** — the new Apex Mountain Resort structured data revealed a real 216–253m gap rather than closing it. Recommend treating this one with more caution than its prior single-source MODERATE rating already implied.

* **No production data was changed, no admin endpoint was called, no merge/retire performed, no application code was changed, no manifest change, no deployment.** This entire pass was public web research (search, geocoding APIs, raw-HTML fetches, Overpass structured queries) only.

## COMPLETE READ-ONLY RESEARCH & CLASSIFICATION PASS — All 52 Remaining Missing-Location Venues (2026-09-15)

### Claude — full reconciliation, full classification, zero production writes.

* **Status: read-only research only. No admin endpoint was called, no production data was changed, no merge/retire performed, no phone corrected, no code changed, no manifest change, no deployment, `main` untouched.**
* **Step 1 — independent reconciliation, not reliant on old notes:** pulled `GET /api/venues?limit=2000` fresh just now. **Result: 1,055 active venues, exactly 52 missing address/lat/lng, identical IDs to every prior count this session.** Also pulled fresh `name`/`region`/`type`/`phone`/`redirect_to` for all 52 directly from this live pull — **zero drift** from any earlier research: every identity/phone value matches exactly what prior research (all from earlier in this same live session, not an old manifest) already established. `redirect_to` is `null` on all 52 — none are already-redirected duplicates.
* **Step 2 — gap analysis:** cross-checked all 52 against everything researched so far this session. **Result: all 52 already had at least initial research from this session** — none were untouched. This pass's job was therefore to (a) close specific known gaps (two-source coordinate verification for #185 and #328, the correct phone for #547), (b) consolidate every classification into one complete, internally-consistent table, and (c) preserve prior conclusions where fresh evidence didn't change them, per instruction.
* **New research closed this pass:**
  * **#185 Dosa Crepe Cafe** now has a genuine second coordinate source: restaurantguru.com (49.0318206, -119.4635092) agrees with geocoder.ca (49.031811, -119.463718) within **~15m** — HIGH-tier coordinate agreement. (Note: Photon also surfaced a *different* "Dosa Crepe Cafe" at Gray Road, Kelowna — that's the already-known Rutland branch, and a possible third "523 Bernard Avenue" location — both irrelevant to Osoyoos but reinforcing why the phone-branch confusion this record has is a real, multi-location risk, not a one-off.)
  * **#328 Kelly O'Bryan's (West Kelowna)** now has a second coordinate source: restaurantguru.com (49.8395276, -119.6103717) vs. geocoder.ca (49.838433, -119.609413) — **~140m apart**, a real but non-trivial gap (MODERATE-HIGH coordinate tier, not HIGH).
  * **#547 Red Tomato Pies** — found the correct Vernon-specific phone via the business's own official website (redtomatopies.com/vernon): **(236) 426-1234**. This is a different number from both the stored (wrong, Kelowna's) number and any number previously floated — sourced directly from the official site, high confidence. No second coordinate source was found (Photon surfaced 5 *other* Red Tomato Pies franchise locations across BC, none in Vernon) — coordinate remains single-source geocoder.ca (confidence 0.77).

---

### Full classification — every one of the 52 IDs, exactly once

**A. HIGH — ready for production enrichment (3)**

| ID | Name | Region | Type | Phone | Verified Address | Lat | Lon | Sources | Agreement | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| 896 | Kelly & Carlos O'Bryans Restaurant | kelowna | restaurant | +1 250-861-1338 | 262 Bernard Ave, Kelowna, BC V1Y 6N4 | 49.886535 | -119.497750 | geocoder.ca + restaurantguru.com | 9.2m | Two genuinely independent sources, tight agreement, confirmed distinct restaurantguru listing from #328's |
| 39 | BNA Brewing Kelowna | kelowna | brewery | +1 236-420-0025 | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | geocoder.ca + restaurantguru.com | 0.0m | Two independent sources, effectively identical |
| 41 | BNA Burger | kelowna | restaurant | +1 236-420-0025 | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | co-located sibling of #39 | 0.0m | Same building, same evidence as #39 |

**B. MODERATE-HIGH — probably correct, stronger evidence would help (8)**

| ID | Name | Region | Type | Phone | Verified Address | Lat | Lon | Sources | Agreement | What's missing for HIGH |
|---|---|---|---|---|---|---|---|---|---|---|
| 154 | Craft 42 Roasters | kelowna | cafe | none | 1178 High Road, Kelowna, BC V1Y 7B1 | 49.892941 | -119.476575 | geocoder.ca + restaurantguru.com | 83.9m | A closer-agreeing third source, or a POI-name-exact match |
| 337 | King's Vegetarian Food | kelowna | restaurant | none | 1631 Dickson Ave, Kelowna, BC | 49.879876 | -119.461448 | geocoder.ca + restaurantguru.com | 68.3m | Same as above |
| 724 | Tickleberry's at the Peach | penticton | cafe | none | 185 Lakeshore Drive, Penticton, BC | 49.502472 | -119.595796 | geocoder.ca + Nominatim/Photon exact POI "The Peach" | 103.0m | Nominatim/Photon share an OSM backend, not fully independent of each other; a third, non-OSM source would close this |
| 1051 | Moose Lounge | big-white | restaurant | none | 5315 Big White Rd, Kelowna, BC V1P 1P3 (Happy Valley Lodge) | 49.721408 | -118.926566 | geocoder.ca only, confidence 1.0 | n/a | Overpass queries for the resort timed out twice (server overload, not a real negative) — retry when the server is less loaded |
| 1019 | Greenside Bar & Grill | osoyoos | restaurant | +1 250-495-7003 | 12300 Golf Course Dr, Osoyoos, BC V0H 1V0 | 49.015736 | -119.491028 | geocoder.ca only, confidence 0.8 | n/a | Single source; canonical of duplicate pair with #252 — merge first (see below) |
| 535 | RANGE restaurant, bar + patio | vernon | restaurant | +1 250-503-3556 | 301 Village Centre Place, Vernon, BC V1H 1T2 | 50.189133 | -119.387605 | geocoder.ca only, confidence 0.9 | n/a | Single source; canonical of duplicate pair with #965 — merge first |
| 581 | Shahi Pakwan | vernon | restaurant | +1 236-426-2627 | 2810 43rd Ave, Vernon, BC V1T 3L3 | 50.274629 | -119.269786 | geocoder.ca only, confidence 1.0 | n/a | Single source; canonical of duplicate pair with #972 — merge first |
| 536 | Rail Trail Cafe & Market | coldstream | cafe | none | 13904 Kalamalka Rd, Coldstream, BC V1B 1Y9 | 50.232437 | -119.268655 | geocoder.ca only, confidence 0.9 | n/a | Single source; canonical of duplicate pair with #537 — merge first |

**C. MODERATE / AMBIGUOUS — insufficient evidence for a safe write (13)**

| ID | Name | Region | Type | Phone | Issue | What would resolve it |
|---|---|---|---|---|---|---|
| 95 | Bright Jenny Coffee | kelowna | cafe | +1 250-860-8848 | 3-4 Kelowna locations found, phone not disambiguated | Calling the stored number directly, or finding a per-location phone listing |
| 225 | Freshslice Pizza | penticton | restaurant | none | 2 Penticton locations found, no phone to disambiguate | A phone lookup, or accepting one location on other grounds |
| 311 | Jugo Juice | kelowna | cafe | none | 2 Kelowna locations found, no phone to disambiguate | Same as above |
| 379 | MEX-KELOWNA TACOS | west-kelowna | restaurant | none | Food truck consistently at one fixed address (4+ sources) — a policy question, not a data gap | A team decision on whether fixed-location food trucks are enrichable |
| 459 | Okanagan premium fruit juice | kelowna | cafe | none | **Identity could not be confirmed at all** despite genuine search effort | Manual confirmation of whether this business still exists under this name |
| 511 | Pizza Factory | osoyoos | restaurant | +1 250-860-4149 | Address found (8115 Main St) but its published phone (250-495-2033) doesn't match stored — unconfirmed which is correct | A definitive source stating the current correct number (unlike #185/#328/#547, no authoritative replacement was found, just a conflicting one) |
| 592 | Sky High Diner | vernon | restaurant | +1 778-212-8759 | Address found (6300 Tronson Rd) but one source calls it "Food Truck in Vernon" | Confirmation of fixed-vs-mobile status |
| 650 | Tacos del cartel | oliver | restaurant | none | **Identity could not be confirmed at all** | Same as #459 |
| 702 | The Mission Creamery | kelowna | cafe | +1 250-764-6171 | 2 Kelowna locations found, phone not disambiguated | Same as #95/#225/#311 |
| 766 | Viva Mexicana Taco Bar | vernon | restaurant | none | Single source only (geocoder.ca 0.9); restaurantguru 404'd, Nominatim road-level, Photon found only unrelated same-named restaurants elsewhere | A second genuinely independent source — none found despite real effort |
| 806 | barBURRITO | vernon | restaurant | +1 250-717-0959 | 2 Vernon locations found, **neither** matches stored phone | Confirming whether the stored number is simply outdated, or belongs to a third location |
| 1066 | Francuccino's Gelato and Fries | silverstar | cafe | none | Business confirmed real, but geocoding is weak and internally inconsistent (two attempts ~1.3km apart, both low confidence) | Manual verification in SilverStar Village |
| 1069 | Pit Stop Cafeteria | apex | restaurant | none | Single source (confidence 0.77, weakest in the set); new Apex resort structured data found this pass does **not** corroborate it — reveals a genuine 216-253m gap instead | A source that actually names this specific cafeteria within Apex Village, not just the resort's general address |

**D. NEEDS PHONE CORRECTION (3)**

| ID | Name | Region | Type | Stored Phone (WRONG) | Correct Phone | Verified Address | Lat | Lon | Coordinate Confidence |
|---|---|---|---|---|---|---|---|---|---|
| 185 | Dosa Crepe Cafe | osoyoos | restaurant | +1 778-753-6939 (Rutland/Kelowna branch's number) | 778-597-0245 (per dosacrepecafe.com official site) | 8143 Main St, Osoyoos, BC V0H 1V0 | 49.031811 | -119.463718 | **HIGH** (2 sources, ~15m — newly closed this pass) |
| 328 | Kelly O'Bryan's Restaurant and Carlos O'Bryan's Pub | west-kelowna | pub | +1 250-549-2112 (Vernon #954's number) | +1 250-768-8442 (per kobcob.com official chain locations page) | 3470 Carrington Rd, West Kelowna, BC V4T 3C1 | 49.838433 | -119.609413 | MODERATE-HIGH (2 sources, ~140m — newly closed this pass) |
| 547 | Red Tomato Pies | vernon | restaurant | +1 236-420-1515 (Kelowna location's number) | **(236) 426-1234** (per redtomatopies.com/vernon official site — newly found this pass) | 3002 41st Ave, Vernon, BC V1T 3H6 | 50.272171 | -119.272075 | MODERATE (single source, confidence 0.77; no second coordinate source found — Photon surfaced 5 other franchise locations, none in Vernon) |

**E. DUPLICATE — requires merge decision, not ordinary enrichment (5)**

See the full duplicate-pair investigation already on record above in this file (same-business confirmation, canonical choice, mergeable-field comparison, reasons not to merge — none found for any pair). Summary:

| Duplicate ID | Canonical ID | Business |
|---|---|---|
| 252 | 1019 | Greenside Bar and Grill / Greenside Bar & Grill (Osoyoos Golf Club) |
| 965 | 535 | Range Lounge & Grill / RANGE restaurant, bar + patio (Predator Ridge) |
| 972 | 581 | Shahi Pakwaan / Shahi Pakwan (Vernon) |
| 537 | 536 | Rail Trail Cafe Ice Cream Parlor / Rail Trail Cafe & Market (Coldstream) |
| 1026 | #213 (already complete, not in the missing-52) | Pappa's Firehall Bistro / Firehall Bistro (Oliver) |

For all 5, the same-business determination, canonical recommendation, and exact mergeable-field breakdown were freshly re-confirmed against live data this session (see the full writeup above) — no change from the prior conclusion. **None have been merged.**

**F. EXCLUDE / DO NOT ENRICH — mobile, seasonal-touring, or otherwise unsuitable (20)**

*Freshly confirmed via external research this session (not just internal signal):*

| ID | Name | Evidence |
|---|---|---|
| 94 | Bread & Cheese Co | Own website explicitly calls it "Summerland Food Truck"; a separate "Bread & Cheese Truck" also exists on Facebook (Delta, BC) |
| 131 | Charros Takos | Social posts describe rotating "Now at 📍[address]" placements; phone found at that address doesn't match stored |
| 453 | Ogopogo Concessions | Own site/socials explicitly state it tours "a variety of venues throughout BC and Alberta during the summer season" — no fixed public location |

*Carried forward from the original internal keyword audit (each record's own description text explicitly says "food truck" or equivalent) — not independently re-verified externally this specific pass, flagged transparently rather than overclaiming fresh verification:*

130 CharCo Wood Fired Sandwiches · 156 Crepe Bistro · 158 Creperie Ooolala - Food truck · 196 El Sabor De Marina · 208 Eye Tasty Food · 260 Hammer's House of Hog · 304 Jeffer's Fryzz · 405 Mi Taqueria- Mexican Cantina (pop-up) · 450 OKF Grill · 507 Pit Stop Smokery · 531 Queen City Eats · 569 Same Same But Different Thai Food · 642 THE MAGIC FOOD TRUCK LTD · 644 TORI DORI Japanese Chicken & Grill · 652 Tak-Oh · 691 The Hot Box · 809 reggaefusionfood

---

### Reconciliation check — completeness proof

Verified programmatically: **all 52 missing-location IDs appear in the classification above exactly once, no ID is missing, no ID is duplicated.** (39, 41, 94, 95, 130, 131, 154, 156, 158, 185, 196, 208, 225, 252, 260, 304, 311, 328, 337, 379, 405, 450, 453, 459, 507, 511, 531, 535, 536, 537, 547, 569, 581, 592, 642, 644, 650, 652, 691, 702, 724, 766, 806, 809, 896, 965, 972, 1019, 1026, 1051, 1066, 1069.) Counts: A=3, B=8, C=13, D=3, E=5, F=20 → **3+8+13+3+5+20 = 52.**

---

### Final proposed production worklist — ranked in safest order

**1. First — straightforward HIGH-confidence enrichments (3 IDs, no dependencies):** #896, #39, #41.

**2. Second — phone corrections that unlock safe enrichment (3 IDs, each phone+address+coordinates now fully documented):** #185, #328, #547 — in decreasing coordinate confidence order (185 HIGH-tier coordinate, 328 MODERATE-HIGH, 547 MODERATE). Each needs the phone correction and the address/lat/lng write together (the existing `/admin/enrich-venue` path can't touch phone; the reviewed-but-not-yet-committed `/admin/correct-phone` work from earlier in this branch's history would be the mechanism once it's live).

**3. Third — duplicate merges (4 pairs + 1 pre-resolved, requiring explicit approval before any merge tool call):** #252→#1019, #965→#535, #972→#581, #537→#536, #1026→#213. Once merged, the 4 canonicals (#1019, #535, #581, #536) become immediately enrichable with their already-documented (single-source, MODERATE-HIGH) coordinates — or could be enriched with a fresh second-source pass first, at your discretion.

**4. Fourth — remaining research/ambiguous cases needing more work before any write (13 in Category C):** #95, #225, #311, #379, #459, #511, #592, #650, #702, #766, #806, #1066, #1069 — none recommended for a near-term write; each has a specific documented blocker and a specific documented next research step.

**Not on the worklist at all — excluded (20 in Category F):** confirmed or carried-forward mobile/food-truck businesses; no further action recommended unless the team wants deeper individual reconsideration of any specific one.

---

### Final live counts (confirmed at the end of this pass)

* **Active venue count: 1,055**
* **Redirect count: 26** (last independently verified this session via a full per-ID sweep of every gap in the id range — not re-swept in this pass since no merge/retire operation has occurred anywhere in production since that count was established, so it's mechanically guaranteed unchanged; every one of the 52 records checked in this pass also directly confirms its own `redirect_to: null`)
* **Total rows (active + redirected): 1,081** (same basis as above)
* **Active venues still missing address/lat/lng: 52** (unchanged by this pass — read-only, no writes)
* **Exact IDs still missing:** 39, 41, 94, 95, 130, 131, 154, 156, 158, 185, 196, 208, 225, 252, 260, 304, 311, 328, 337, 379, 405, 450, 453, 459, 507, 511, 531, 535, 536, 537, 547, 569, 581, 592, 642, 644, 650, 652, 691, 702, 724, 766, 806, 809, 896, 965, 972, 1019, 1026, 1051, 1066, 1069

* **Production remained completely untouched throughout this entire pass.** No admin endpoint was called, no venue was written, merged, retired, redirected, created, or deleted. No phone was corrected. No application code was modified. No manifest was modified. Nothing was deployed. `main` was not touched — this update exists only on `ai-handoff/2026-09-15`.

## EXECUTED — #896, #39, #41 Production Enrichment (2026-09-15)

### Claude — three-venue write, completed and verified. Strict scope, zero anomalies.

* **Status: DONE.** All 3 approved IDs written successfully. No other venue was touched.
* **Mechanism:** `POST /admin/enrich-venue` via the existing guarded `guardedEnrichUpdate()` path — no new code, no schema change, no bypass. Auth via `railway run` (already-linked Railway project); `ENRICHMENT_ADMIN_TOKEN`'s value was never printed, logged, or exposed.
* **Pre-write verification (all 3):** live `GET /api/venues/:id` confirmed identity, region, type, and phone for every one of the 3 matched the approved research exactly, and all 3 had `address`/`latitude`/`longitude` entirely `null`. No precondition mismatches. Baseline: active count 1,055; missing-location count 52.

| ID | Name | Address Written | Lat | Lon | Write Result |
|---|---|---|---|---|---|
| 896 | Kelly & Carlos O'Bryans Restaurant | 262 Bernard Ave, Kelowna, BC V1Y 6N4 | 49.886535 | -119.49775 | written / written / written |
| 39 | BNA Brewing Kelowna | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | written / written / written |
| 41 | BNA Burger | 1250 Ellis St, Kelowna, BC V1Y 1Z4 | 49.892787 | -119.493793 | written / written / written |

* **Every response showed all three fields as `"written"`** (never `"skipped_not_empty"`), confirming all 3 were genuinely empty immediately before the write.
* **Post-write verification (all 3, all passed):**
  * `address`/`latitude`/`longitude` on all 3 live records exactly match the table above.
  * Every other field on all 3 — `phone`, `name`, `region`, `type`, `slug`, `cuisine`, `rating`, `price`, `reviews`, `description`, `description_fr`, `hours`, `website`, `image_url`, `redirect_to` (still null on all 3), and all 12 boolean amenity flags — confirmed unchanged via direct comparison against the pre-write values. Only `updated_at` changed on each, as expected.
  * **Active venue count: 1,055 both before and after — unchanged.**
  * **Redirect count and redirect mappings: unchanged** — no merge/retire endpoint was called anywhere in this batch, so this is structurally guaranteed, not just inferred; all 3 records independently confirm `redirect_to: null`.
  * **Missing-location count: 52 → 49, a decrease of exactly 3.** Verified via a precise before/after set diff (not just a count comparison): the set of IDs removed from "missing" was exactly `{896, 39, 41}` — an exact match to the approved batch — and the set of IDs newly added to "missing" was empty. No other venue's status changed in either direction.
* **No anomalies of any kind.** No write failed, no precondition mismatch, no unexpected field change, no count drift.
* **No merge, retire, delete, redirect, or venue creation occurred. No manifest change. No application code change. No deployment.**
* **Remaining from the full classification pass:** Category A is now fully complete (all 3 members written). Category B (8, including the 4 duplicate-pair canonicals), Category C (13, ambiguous), Category D (3, need phone correction), Category E (5, duplicate), and Category F (20, exclude) remain entirely unwritten, awaiting separate approval.

## Category B Next-Group Preparation — 8 Records (2026-09-15) — READ-ONLY, NOT WRITTEN

### Claude — fresh live verification + strengthened coordinate research. No production changes.

* **Status: read-only. No admin endpoint was called (neither `/admin/enrich-venue` nor `/admin/merge-and-retire-duplicate`), no production data was changed, no merge/retire performed, no phone corrected, no code changed, no manifest change, no deployment. `main` untouched.**
* **Fresh live re-read of all 8 target records plus their 4 duplicate counterparts (252, 965, 972, 537) performed just now — zero drift** from the classification pass a few turns ago: every ID/name/region/type/phone/`redirect_to` matches exactly (all `redirect_to: null`, confirming none of the duplicate pairs have been merged).
* **New research this pass:** attempted a second independent coordinate source for every record in this group of 8 that was still single-source. **Found strong results for all 4 duplicate-pair canonicals** via restaurantguru.com (searched for and confirmed the correct listing URL for each, rather than guessing a slug) — all four now have genuine two-independent-source, building-level agreement well under 50m. Also attempted (but did not find) a second source for #1051.

---

### Classification

**READY — HIGH confidence (4):**

| ID | Name | Region | Phone | Verified Address | Lat | Lon | Sources | Agreement |
|---|---|---|---|---|---|---|---|---|
| 1019 | Greenside Bar & Grill | osoyoos | +1 250-495-7003 | 12300 Golf Course Dr, Osoyoos, BC V0H 1V0 | 49.015736 | -119.491028 | geocoder.ca + restaurantguru.com | **36.6m** |
| 535 | RANGE restaurant, bar + patio | vernon | +1 250-503-3556 | 301 Village Centre Place, Vernon, BC V1H 1T2 | 50.189133 | -119.387605 | geocoder.ca + restaurantguru.com | **5.4m** |
| 581 | Shahi Pakwan | vernon | +1 236-426-2627 | 2810 43rd Ave, Vernon, BC V1T 3L3 | 50.274629 | -119.269786 | geocoder.ca + restaurantguru.com | **5.3m** |
| 536 | Rail Trail Cafe & Market | coldstream | none | 13904 Kalamalka Rd, Coldstream, BC V1B 1Y9 | 50.232437 | -119.268655 | geocoder.ca + restaurantguru.com | **35.6m** |

geocoder.ca's value is kept as the recommended coordinate for each (already the value referenced elsewhere in this document); restaurantguru.com's independently-sourced value is the corroborating second source. **These 4 all now meet the same HIGH-confidence bar used for every write so far.**

**MORE RESEARCH NEEDED (4) — unchanged from the prior classification pass, no new evidence found this round:**

| ID | Name | Region | Phone | Verified Address | Lat | Lon | Sources | Agreement | What's still missing |
|---|---|---|---|---|---|---|---|---|---|
| 154 | Craft 42 Roasters | kelowna | none | 1178 High Road, Kelowna, BC V1Y 7B1 | 49.892941 | -119.476575 | geocoder.ca + restaurantguru.com | 83.9m | A closer-agreeing or POI-exact third source |
| 337 | King's Vegetarian Food | kelowna | none | 1631 Dickson Ave, Kelowna, BC | 49.879876 | -119.461448 | geocoder.ca + restaurantguru.com | 68.3m | Same as above |
| 724 | Tickleberry's at the Peach | penticton | none | 185 Lakeshore Drive, Penticton, BC | 49.502472 | -119.595796 | geocoder.ca + Nominatim/Photon exact POI "The Peach" | 103.0m | A non-OSM-backed third source (Nominatim/Photon share an underlying dataset) |
| 1051 | Moose Lounge | big-white | none | 5315 Big White Rd, Kelowna, BC V1P 1P3 (Happy Valley Day Lodge, Big White) | 49.721408 | -118.926566 | geocoder.ca only, confidence 1.0 | n/a | Tried restaurantguru.com and Photon again this pass — neither has a listing for this specific venue. Identity is solidly confirmed (Big White's own site, TripAdvisor) but the coordinate remains single-source |

**DO NOT ENRICH (0):** none of these 8 records warrant exclusion — all are confirmed fixed, real, currently-operating businesses.

---

### Duplicate-pair reconfirmation (investigation only — nothing merged)

All four relationships freshly re-verified against live data just now; **no change from the prior conclusion for any of them.**

**#252 → #1019 (Greenside Bar and Grill / Greenside Bar & Grill)**
- Merge still appropriate: **yes** — phone identical on both (+1 250-495-7003, live-confirmed again), same business (Osoyoos Golf Club).
- Canonical: **#1019**. Duplicate: **#252**.
- What the guarded merge would preserve: `description_fr` (populated on #252, null on canonical #1019).
- Not reconciled by the merge: nothing else — `price`/`reviews` are already correctly populated on the canonical.
- Conflict to review before merging: none found.

**#965 → #535 (Range Lounge & Grill / RANGE restaurant, bar + patio)**
- Merge still appropriate: **yes** — phone identical (+1 250-503-3556, live-confirmed again), same business (Predator Ridge Resort).
- Canonical: **#535**. Duplicate: **#965**.
- What the guarded merge would preserve: nothing is actually mergeable — canonical already has non-null `price`/`reviews`/`description_fr`.
- Not reconciled by the merge: `reviews` differ (965=546 vs 535=535) — not lost, just not reconciled into one number (the duplicate's row is retained, not deleted, when retired).
- Conflict to review before merging: none found.

**#972 → #581 (Shahi Pakwaan / Shahi Pakwan)**
- Merge still appropriate: **yes** — phone identical (+1 236-426-2627, live-confirmed again), same business, spelling-variant duplicate.
- Canonical: **#581**. Duplicate: **#972**.
- What the guarded merge would preserve: `price` (2) and `reviews` (705), both populated on #972, null on canonical #581.
- Not reconciled by the merge: nothing else — `description_fr` already correctly populated on the canonical.
- Conflict to review before merging: none found.

**#537 → #536 (Rail Trail Cafe Ice Cream Parlor / Rail Trail Cafe & Market)**
- Merge still appropriate: **yes** — same physical site (one building housing both the "market" and "ice cream" functions these two records separately describe).
- Canonical: **#536**. Duplicate: **#537**.
- What the guarded merge would preserve: nothing is mergeable — `description_fr` is populated on BOTH sides with genuinely different text.
- Not reconciled by the merge: the duplicate's distinct `description_fr` text is not folded into the canonical (not lost, just retained on the retired row rather than merged).
- Conflict to review before merging: none found.

---

### Final recommendation for this group of 8

* **Ready for the next production-write approval: #1019, #535, #581, #536** (all newly confirmed HIGH confidence this pass) — **but note these are duplicate-pair canonicals.** The standing recommendation (unchanged from earlier research) is still to **merge the duplicate first** (#252→#1019, #965→#535, #972→#581, #537→#536) before or as part of enriching the canonical, so the merge's own precondition (`canonical_field_not_null`) doesn't later block reconciling `description_fr` for the two pairs where that's mergeable (#252→#1019 and #972→#581). Enriching address/lat/lng first would not itself block a later merge, but doing the merge first keeps the sequence clean and auditable.
* **Not ready — needs more research: #154, #337, #724, #1051** — no regression from prior status, just no fresh evidence to justify upgrading them to HIGH this round despite genuine effort.
* **No production data was changed, no admin endpoint was called, no merge/retire performed, no phone corrected, no application code was changed, no manifest change, no deployment.** This entire pass was public web research (search, restaurantguru.com raw-HTML fetches, Photon) plus live `GET` verification only.

## Production Preflight — 4 Duplicate Pairs (2026-09-15) — READ-ONLY, NOTHING MERGED

### Claude — full live re-verification of both records in all 4 pairs immediately before any potential merge approval. Zero anomalies.

* **Status: read-only. `/admin/merge-and-retire-duplicate` and `/admin/enrich-venue` were NOT called. No production data was changed, no phone corrected, no code changed, no manifest change, no deployment. `main` untouched.**
* **Method:** pulled the complete live record (every field) for all 8 IDs across the 4 pairs, immediately before writing this entry — not reused from any prior pull.

**Per-pair verification:**

| Pair | Names match research | Region/Type match | Phone match (dup vs canonical) | `redirect_to` on both (must be null) | Canonical address/lat/lon (must be null) | Mergeable fields (re-derived from this exact live data) |
|---|---|---|---|---|---|---|
| #252 → #1019 | ✅ Greenside Bar and Grill → Greenside Bar & Grill | ✅ osoyoos/restaurant on both | ✅ both `+1 250-495-7003` | ✅ null / null | ✅ null/null/null on #1019 | `description_fr` only |
| #965 → #535 | ✅ Range Lounge & Grill → RANGE restaurant, bar + patio | ✅ vernon/restaurant on both | ✅ both `+1 250-503-3556` | ✅ null / null | ✅ null/null/null on #535 | none (canonical already has non-null price/reviews/description_fr) |
| #972 → #581 | ✅ Shahi Pakwaan → Shahi Pakwan | ✅ vernon/restaurant on both | ✅ both `+1 236-426-2627` | ✅ null / null | ✅ null/null/null on #581 | `price`, `reviews` |
| #537 → #536 | ✅ Rail Trail Cafe Ice Cream Parlor → Rail Trail Cafe & Market | ✅ coldstream/cafe on both | ✅ both `null` (neither has a stored phone) | ✅ null / null | ✅ null/null/null on #536 | none (canonical already has non-null description_fr, distinct text) |

* **All 4 mergeable-field results are byte-for-byte identical to the prior research** — zero drift since the last check. No field conflict, no unexpected value change, no phone change on any of the 8 records.
* **Duplicate relationships all still valid; canonical/duplicate IDs unchanged** — confirmed by the same identity/phone evidence already on record (Osoyoos Golf Club, Predator Ridge Resort, the Vernon Pakistani restaurant, and the Coldstream rail-trail site respectively).
* **Active venue count: 1,055** (unchanged from every prior check this session — expected, since no write of any kind has occurred).
* **Redirect count: 26** — not re-swept via the full 28-gap-id method in this pass (that's a broader operation than this preflight calls for), but mechanically guaranteed unchanged: no `/admin/merge-and-retire-duplicate` or `/admin/retire-duplicate` call has been made anywhere in production this entire session, and all 8 records here directly confirm their own `redirect_to: null`.
* **No other venue is unexpectedly involved in any of these 4 pairs:** cross-checked the duplicate IDs (252, 965, 972, 537) against the full list of 26 known redirect targets established earlier this session — **none of the 4 duplicates is itself the target of any other venue's redirect**, so retiring any of them cannot orphan a redirect chain. None of the 4 canonicals (1019, 535, 581, 536) has its own `redirect_to` set, so none is itself already a duplicate of something else.
* **Zero anomalies of any kind found.** No unexpected drift, no field conflict, no missing record, no changed phone, no changed canonical data.

**Conclusion: all 4 pairs remain exactly as documented and are still eligible for merge approval, with no new blocker found.** Nothing was merged, retired, enriched, or otherwise modified during this preflight.

## EXECUTED — 4 Duplicate Merges (2026-09-15)

### Claude — all 4 approved merges completed and fully verified. Zero anomalies.

* **Status: DONE.** All 4 approved duplicate pairs merged. No other venue was touched, no venue was enriched, no phone was corrected, no code/schema/manifest was changed, nothing deployed, `main` untouched.
* **Mechanism:** `POST /admin/merge-and-retire-duplicate` (for the 2 pairs with mergeable fields) and `POST /admin/retire-duplicate` (for the 2 pairs with nothing to merge — using the correct existing endpoint for each case, not forcing merge-and-retire with an empty payload). Auth via `railway run`; `ENRICHMENT_ADMIN_TOKEN` never exposed.
* **Pre-merge verification (all 4 pairs, immediately before each individual merge call):** re-fetched both live records for each pair right before executing that pair's merge. All identities, phones, and mergeable-field sets matched the approved preflight exactly — no drift, no precondition failure, no need to stop for any pair.

**Per-pair execution and verification:**

| Pair | Endpoint used | Mergeable fields | Result | Canonical fields changed | Duplicate `redirect_to` after |
|---|---|---|---|---|---|
| #252 → #1019 | `merge-and-retire-duplicate` | `description_fr` | ok | `description_fr` (null→set), `updated_at` — **nothing else** | 1019 ✓ |
| #965 → #535 | `retire-duplicate` (no mergeable fields) | none | ok | **none** — #535's `updated_at` confirmed unchanged (`2026-09-04 16:11:08`, byte-identical before and after) | 535 ✓ |
| #972 → #581 | `merge-and-retire-duplicate` | `price`, `reviews` | ok | `price` (null→2), `reviews` (null→705), `updated_at` — **nothing else** | 581 ✓ |
| #537 → #536 | `retire-duplicate` (no mergeable fields) | none | ok | **none** — #536's `updated_at` confirmed unchanged | 536 ✓ |

Field-level diff performed on both changed canonicals (#1019, #581) confirms **only** the intended merged field(s) plus `updated_at` changed — nothing else.

**Post-merge reconciliation (whole-dataset, not just the 8 involved records):**
* Pulled the complete live venue list before and after. **Active set diff: exactly `{252, 965, 972, 537}` left the active set (moved to redirect status), nothing else changed, nothing unexpected added.**
* **Every venue present in both before/after snapshots was diffed field-by-field. Only #1019 and #581 differ — exactly the intended merged fields. Zero unrelated venues changed.**
* **Active venue count: 1,055 → 1,051** (decrease of exactly 4, matching the 4 retired duplicates leaving the active set).
* **Missing-location count: 49 → 45** (decrease of exactly 4 — the removed IDs are exactly `{252, 965, 972, 537}`, the same 4 that left the active set; none of the 4 canonicals were enriched, so this is purely the duplicates leaving the missing/active accounting, not new location data).
* **Redirect count: 26 → 30**, confirmed via a full ID-range gap-set analysis (not just a delta assumption) — the only new gaps in the active ID range are exactly the 4 just-merged duplicates; the 2 previously-confirmed nonexistent IDs (1070, 1073) are unchanged.
* **All 4 redirect mappings verified exactly correct**, both in the raw data (`redirect_to` field) and in live site behavior:

| Duplicate | `redirect_to` | Live URL behavior |
|---|---|---|
| #252 | 1019 | `GET /osoyoos/restaurants/greenside-bar-and-grill` → **301** → `/osoyoos/restaurants/greenside-bar-grill` |
| #965 | 535 | `GET /vernon/restaurants/range-lounge-grill` → **301** → `/vernon/restaurants/range-restaurant-bar-patio` |
| #972 | 581 | `GET /vernon/restaurants/shahi-pakwaan` → **301** → `/vernon/restaurants/shahi-pakwan` |
| #537 | 536 | `GET /coldstream/cafes/rail-trail-cafe-ice-cream-parlor` → **301** → `/coldstream/cafes/rail-trail-cafe-market` |

* **Sitemap behavior confirmed correct:** retired duplicates' own slugs no longer appear in `/sitemap.xml` (0 occurrences each); canonical slugs still appear. Each canonical's own page still resolves 200.
* **Existing test suite:** `npm test` — **58/58 passing**, unaffected (no code was changed, as expected — this was a pure data operation through already-shipped, already-reviewed guarded endpoints).
* **No anomalies of any kind found anywhere in this batch.**

**Missing-location breakdown after this batch:** the four canonicals (#1019, #535, #581, #536) remain in the missing-location set — they were confirmed HIGH confidence for enrichment in the preflight but were **not** enriched as part of this merge batch, per the strict scope (merges only). They're now unblocked for a future `/admin/enrich-venue` batch with their already-documented HIGH-confidence coordinates.

* **No other production action was taken.** No venue besides the 8 involved in these 4 pairs was read-write touched. No application code changed. No manifest changed. No deployment occurred. `main` was not merged into or otherwise modified — this record exists only on `ai-handoff/2026-09-15`.

## Change Log

* 2026-09-08 — Initial shared AI handoff file created to establish coordination between Claude and ChatGPT.
* 2026-09-08 — Claude confirmed the shared AI handoff workflow is ready.
* 2026-09-08 — Claude reviewed current repository/production state and identified continued location enrichment (152 active venues missing address/lat/lng) as the highest-priority next task; added details and a suggested approach under Open Tasks.
* 2026-09-08 — Claude executed the ready 11-venue enrichment batch (IDs 469, 841, 857, 863, 907, 918, 967, 1000, 1002, 1004, 1041). All 11 succeeded with zero anomalies. Complete-location count: 900 → 911. Missing-location count: 152 → 141. Active/redirect counts and all 17 redirects confirmed unchanged. Manifest intentionally left unchanged (separate task).
