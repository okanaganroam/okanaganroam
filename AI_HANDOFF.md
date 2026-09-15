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

## Next Location-Enrichment Batch Preparation (2026-09-15, post-merge) — READ-ONLY

### Claude — full reconciliation after the 4-merge batch, fresh re-triage. No production changes.

* **Status: read-only. No admin endpoint was called, no production data was changed, no merge/retire performed, no phone corrected, no code changed, no manifest change, no deployment. `main` untouched.**
* **Step 1 — independent recalculation from fresh live data** (`GET /api/venues?limit=2000`, pulled just now, not reused from any prior file):
  * **Active venue count: 1,051**
  * **Complete-location count: 1,006**
  * **Missing-location count: 45**
  * **Redirect count: 30** — confirmed via a full ID-range gap-set sweep (not assumed from the prior delta): 32 gaps in the 1–1083 ID range, of which 2 are confirmed-nonexistent IDs (1070, 1073, both previously verified 404) and 30 are genuine redirects.
* **Step 2 — reconciliation against the prior 52-venue classification:** the current 45 missing IDs are **exactly** the prior 52 minus the 3 written in the last enrichment batch (896, 39, 41) minus the 4 that left the active set entirely in the merge batch (252, 965, 972, 537) = 52 − 3 − 4 = 45, confirmed by exact set match. **No new venue appeared in the missing list, no previously-classified venue is unaccounted for.** #1026 (the fifth known duplicate, of already-complete #213) remains in the missing list — it was never part of the 4 approved pairs this round and still needs its own separate merge approval.

---

### Fresh re-triage of all 45

**HIGH confidence — safe for the next enrichment batch (4):**

The four just-unblocked canonicals from this session's merge batch. All four were independently verified earlier this same session (not old/stale research) via phone-number cross-checks against external directories and two-independent-coordinate-source agreement — re-confirmed against live data just now (post-merge state: all four have `redirect_to: null`, confirming they're no longer shielded by an un-merged duplicate; phones and identity fields unchanged from verification time).

| ID | Name | Region | Type | Stored Phone | Verified Address | Coordinate Source(s) | Confidence | Evidence | Ambiguity |
|---|---|---|---|---|---|---|---|---|---|
| 1019 | Greenside Bar & Grill | osoyoos | restaurant | +1 250-495-7003 | 12300 Golf Course Dr, Osoyoos, BC V0H 1V0 | geocoder.ca + restaurantguru.com, **36.6m agreement** | HIGH | Exact phone match to the single restaurant at Osoyoos Golf Club, confirmed across Yelp, Destination Osoyoos, Facebook, and the golf club's own site (golfosoyoos.com) — one unambiguous location, no other business shares this phone | None found |
| 535 | RANGE restaurant, bar + patio | vernon | restaurant | +1 250-503-3556 | 301 Village Centre Place, Vernon, BC V1H 1T2 | geocoder.ca + restaurantguru.com, **5.4m agreement** | HIGH | Exact phone match to Predator Ridge Resort's own restaurant, confirmed via Predator Ridge's own site (predatorridge.com/dining/range-restaurant) plus independent directories — one unambiguous location | None found |
| 581 | Shahi Pakwan | vernon | restaurant | +1 236-426-2627 | 2810 43rd Ave, Vernon, BC V1T 3L3 | geocoder.ca + restaurantguru.com, **5.3m agreement** | HIGH | Exact phone match confirmed across multiple independent directories to one single family-run restaurant — no other business shares this phone | Name-spelling variance exists in the wild ("Shahi Pakwan" vs "Shahi Pakwaan" vs the domain's "shaipakwan") but all variants resolve to the same phone/address, not a different business |
| 536 | Rail Trail Cafe & Market | coldstream | cafe | none stored | 13904 Kalamalka Rd, Coldstream, BC V1B 1Y9 | geocoder.ca + restaurantguru.com, **35.6m agreement** | HIGH | No phone to cross-check, but identity is unambiguous: one single building at the start of the Okanagan Rail Trail, confirmed via Facebook, Tripadvisor, Vernon.com, and the correct restaurantguru.com listing (verified by URL, not guessed) — no competing business of this name exists in the region | Lower identity-confirmation strength than the 3 phone-matched candidates above, since there's no phone to anchor it — flagged explicitly rather than treated as equal-strength evidence |

**No other venue among the 45 meets this same conservative bar right now.** Everything else remains at its prior classification (MEDIUM/MORE RESEARCH NEEDED or LOW/EXCLUDE) — reconciled against live data, no drift found for any of them either:

* **MEDIUM / needs more research (17):** 154, 337, 724, 1051 (each has a real single or partial-agreement coordinate source but doesn't clear the same bar as the 4 above), 95, 225, 311, 379, 459, 511, 592, 650, 702, 766, 806, 1066, 1069 (chain-location ambiguity, unconfirmed identity, weak/inconsistent geocoding, or an unresolved phone conflict — specific blocker already documented per-venue earlier in this file).
* **NEEDS PHONE CORRECTION (3):** 185, 328, 547 — address and coordinates already researched, but the stored phone is confirmed wrong and must be corrected together with enrichment, not enrichment alone.
* **DUPLICATE, not yet merged (1):** 1026 → #213 (already complete) — a fifth known duplicate outside this round's approved 4 pairs, still needs its own separate merge approval.
* **EXCLUDE — mobile/food truck (20):** 94, 130, 131, 156, 158, 196, 208, 260, 304, 405, 450, 453, 507, 531, 569, 642, 644, 652, 691, 809 — unchanged from prior research (3 of these — 94, 131, 453 — were externally re-confirmed mobile earlier this session; the remaining 17 carry the original internal description-text signal, flagged as such rather than overclaiming independent re-verification of all 17 again this round).

**Reconciliation check:** 4 (HIGH) + 17 (MEDIUM) + 3 (phone correction) + 1 (duplicate) + 20 (exclude) = **45** — matches the live missing count exactly, no gaps, no double-counting.

---

### Special-case cautions applied in this pass (per the specific risk categories flagged)

* **Multi-location chains:** #95 (Bright Jenny Coffee), #225 (Freshslice Pizza), #311 (Jugo Juice), #702 (Mission Creamery), #806 (barBURRITO) — all correctly kept out of the HIGH batch; none has a phone-to-single-location match.
* **Mobile/food trucks:** #94, #131, #453 externally confirmed mobile; the broader internal-signal-only 17 (description text) kept excluded rather than assumed safe.
* **Seasonal businesses:** none of the 4 HIGH candidates are seasonal — all four are confirmed year-round or resort-based fixed operations.
* **Conflicting phone numbers:** #511 (Pizza Factory) and #547 (Red Tomato Pies) both showed a phone-belongs-elsewhere pattern — #547 already has its correct number documented (needs the phone-correction endpoint); #511's conflict remains unresolved and it stays in MEDIUM.
* **Shared/multi-tenant addresses:** #328's West Kelowna coordinate (from a shared restaurantguru listing) was already flagged at MODERATE-HIGH, not HIGH, for exactly this reason — correctly excluded from this batch.
* **Rural/small-town street-midpoint risk:** every one of the 4 HIGH candidates has a genuine two-independent-source, sub-40m building-level agreement — none relies on a bare geocoder street-centroid.

---

### Proposed next batch

**#1019, #535, #581, #536** — write `address`/`latitude`/`longitude` only, using the exact values already documented earlier in this file (Category B research and the 8-record upgrade round). No other venue recommended for this round.

* **No production data was changed, no admin endpoint was called, no merge/retire performed, no phone corrected, no application code was changed, no manifest change, no deployment.** This entire pass was live `GET` verification plus reconciliation against research already completed this session.

## Final Verification Pass — #180, #360, #426, #934, #987 (2026-09-15) — Read-Only Audit of Already-Live Data

### Claude — important correction to the request's premise, then a genuine new finding on #180's phone.

* **Status: read-only. No admin endpoint was called, no production data was changed, no phone corrected, no code changed, no manifest change, no deployment. `main` untouched.**
* **Correction, checked against live production before doing anything else:** all 5 of these venues are **already fully enriched in production**, not pending candidates — #180 and #934 and #987 were written earlier this session (see the "EXECUTED — #180, #934, #987" entry above), and #360 and #426 were written in the batch before that (see "EXECUTED — #426 and #360"). Confirmed via a fresh live pull just now: all 5 have `address`/`latitude`/`longitude` populated exactly matching what was written at the time. This pass is therefore a **post-hoc audit of already-live data against newly-raised concerns**, not pre-write research — reframing the requested "SAFE TO WRITE NOW / DO NOT WRITE YET" lists accordingly below, since nothing here is actually pending a write.
* Despite the premise correction, the specific concerns raised (especially #180's phone) are legitimate questions about already-live data quality, and were investigated properly rather than dismissed on a technicality.

---

### #180 Dolci Thai Bistro — **genuine, unresolved phone conflict found. This is a real finding, not a false alarm.**

* **Address/coordinates: still solid, no new concern.** Every source checked (multiple, past and present) consistently gives 8710 Main St, Osoyoos, BC V0H 1V0 — the already-written address and coordinates (49.032963, -119.467977, from geocoder.ca + restaurantguru.com, ~15m agreement) are not in question.
* **Phone: a real conflict exists, freshly confirmed, not resolved.**
  * **Sirved.com** independently lists **+1 250-495-6807** for Dolci Thai Bistro — this matches the currently-stored (and never-touched-by-me) phone.
  * **Yelp, TableAgent (explicitly for reservations), and general web search aggregation** consistently and repeatedly surface **+1 250-408-8941** instead.
  * This is the **same pattern flagged earlier this session** (back when #180 was first researched) — at that time, one ambiguous search result seemed to confirm 495-6807 and the 408-8941 number was provisionally attributed to "the booking site's own line." **That provisional judgment call does not hold up under this fresh, more thorough check** — 408-8941 now appears across multiple independent, reputable sources (not just one booking aggregator), while 495-6807's only independent confirmation is a single Sirved listing.
  * **I cannot definitively resolve which number is currently correct with the evidence available.** Per your own stated rule ("do NOT write or recommend enrichment unless you can resolve this"), the honest answer is: **it is not resolved.**
* **Important scope note:** the phone field was never modified by any enrichment write I performed — `guardedEnrichUpdate()` only ever touches `address`/`latitude`/`longitude`. This is a **pre-existing data-quality question** about the phone value that was already in the database before this session started, surfaced now rather than introduced by any write here.
* **Recommendation:** flag `#180`'s phone for a future `/admin/correct-phone` investigation (once that endpoint is committed/deployed) — separate from and not requiring any change to the already-correct address/lat/lng.

---

### #360 Lala Ji's pizzeria — reconfirmed clean, no new concerns.

Multiple independent sources (Yellowpages, Facebook, Tripadvisor, Wanderlog, Sirved, the business's own site lalajipizzeria.com, WanderBoat) consistently confirm **625 Main St, Penticton, BC V2A 5C9** and **+1 778-622-2211** together, with no competing number or address found anywhere. The already-written coordinates (49.49398, -119.589999, geocoder.ca + a Photon POI-name-exact match, 0m agreement) remain the strongest evidence in this whole audit set.

---

### #426 Murray's Pizza Kelowna — reconfirmed as specifically the Kelowna location, no confusion with West Kelowna.

Every source checked explicitly and consistently distinguishes this Kelowna location (**107-1924 Summit Drive, Kelowna, BC V1V 3E9**, **+1 778-484-3000**) from the separate West Kelowna Murray's Pizza (103-3640 Gosset Rd, a different address and — per the chain's own site murrays.pizza — a different location page entirely). No ambiguity found. Already-written coordinates (49.901388, -119.45305) remain supported by the two independent sources found earlier this session.

---

### #934 14th Ave Bar & Grill — coordinate conflict remains resolved, no new contradicting evidence found.

The golftraxx-sourced coordinate (50.2518398, -119.2509141) resurfaced again in this pass's search — it's the same single outlier source already identified and explained earlier this session (~359m from the InteGolf/geocoder.ca cluster, and outside OSM's own mapped course-boundary polygon). No new source contradicts the already-established resolution: **InteGolf's independently-geocoded value (50.2517967, -119.2458648) and geocoder.ca (26.5m agreement)** remain the best evidence, and no third source surfaced to challenge that conclusion. The already-written coordinates are the InteGolf/geocoder.ca cluster value, not the golftraxx outlier — confirmed correct.

---

### #987 China Palace — no stronger evidence than what was already used; no new weakness found either.

This pass's search did not surface a third independent coordinate source, and explicitly could not provide exact GPS coordinates itself ("you would need to use a mapping service"). The already-written coordinates (49.476851, -119.583657, from geocoder.ca + restaurantguru.com, 29.6m agreement) remain the best available evidence — this pass found nothing new to either strengthen or weaken that. Address identity (1933 Main Street, Penticton, BC V2A 5H5) is consistently confirmed across every source checked, with no competing location.

---

### Final lists, adapted to reflect that all 5 are already live

**SAFE — confirmed, already correctly enriched, no further action needed (4):**
* #360 Lala Ji's pizzeria
* #426 Murray's Pizza Kelowna
* #934 14th Ave Bar & Grill
* #987 China Palace

**FLAG FOR FUTURE ATTENTION — not an address/coordinate problem, but an unresolved phone conflict on already-live data (1):**
* **#180 Dolci Thai Bistro** — address/coordinates remain correct and require no change; the stored phone (+1 250-495-6807) has genuine, unresolved conflicting evidence against an alternate number (+1 250-408-8941) that appears more frequently across independent sources. Needs a dedicated phone-correction investigation before the phone field can be trusted, separate from the location data which is already sound.

* **No production data was changed, no admin endpoint was called, no phone corrected, no application code was changed, no manifest change, no deployment.** This entire pass was live `GET` verification plus fresh public web research.

## Change Log

* 2026-09-08 — Initial shared AI handoff file created to establish coordination between Claude and ChatGPT.
* 2026-09-08 — Claude confirmed the shared AI handoff workflow is ready.
* 2026-09-08 — Claude reviewed current repository/production state and identified continued location enrichment (152 active venues missing address/lat/lng) as the highest-priority next task; added details and a suggested approach under Open Tasks.
* 2026-09-08 — Claude executed the ready 11-venue enrichment batch (IDs 469, 841, 857, 863, 907, 918, 967, 1000, 1002, 1004, 1041). All 11 succeeded with zero anomalies. Complete-location count: 900 → 911. Missing-location count: 152 → 141. Active/redirect counts and all 17 redirects confirmed unchanged. Manifest intentionally left unchanged (separate task).

## Homepage Implementation Audit (2026-09-15) — Read-Only, Pre-Redesign

### Claude — full read-only audit of `okanagan.html`, `server.js`'s homepage route, `public/scripts/app.js`, and `public/styles/app.css`/`tokens.css`. No redesign proposed. No code, data, or production changes.

* **Status: read-only. No file was modified, no code was changed, no admin endpoint was called, no production data was touched, no deployment happened. `main` untouched.**
* **Scope note:** covers exactly the 14 areas requested. This is a description of current behavior only — no recommendations on what to change, beyond neutrally flagging real bugs/inconsistencies found along the way (labeled as such, not as redesign proposals).
* **Method:** direct source read of `okanagan.html` (717 lines, 1,079,185 bytes — read via a stripped copy with the 10 giant base64 image lines replaced by placeholders, since the raw lines are up to 226,579 characters and blow normal read limits), `server.js`'s `/` route and its 6 homepage-assembly render functions, the live-served `public/scripts/app.js` (2,407 lines) in full, and `public/styles/app.css` (892 lines) + `public/styles/tokens.css` (19 lines).

---

### 1. Current homepage structure, section by section, in order

The served page is not `okanagan.html` verbatim — `server.js`'s `GET /` handler (`server.js:2603`) reads the static file fresh on every request and does literal-string-anchor `.replace()` splicing to inject 4 server-rendered sections plus an SEO footer and 2 inline `<script>` blocks. In final rendered order:

1. `<head>` — meta/SEO/JSON-LD/fonts/GA4/Leaflet CSS (see §9–10).
2. Trip-tray widget (fixed-position, hidden until opened) — floating multi-stop trip planner.
3. Header/nav — logo, nav links, social icons, EN/FR toggle, hamburger (mobile).
4. **3-step Discovery Wizard** filter bar — Step 1: pick region(s); Step 2: pick venue type(s); Step 3: pick amenity/filter chip(s) → reveals results. A separate cuisine/price "refine" panel collapses after first search.
5. Hero section — hardcoded 10-venue image carousel (auto-advancing, inline base64 images), headline, search box.
6. Weather banner (hidden by default, JS-populated) — Open-Meteo current conditions + a "suggest filters" CTA.
7. Weekly spotlight banner (hidden by default, JS-populated) — one algorithmically-rotated high-rated venue.
8. **`renderHappeningSoonHTML()`** (server-injected, `server.js:1363`) — server-rendered "happening soon" module; omits itself if there's nothing to show.
9. **`renderHiddenGemsHomepageHTML()`** (server-injected, `server.js:1408`) — server-rendered "hidden gems" module; same self-omitting pattern.
10. "Featured this month" strip — a second hardcoded 10-venue set, slow auto-scrolling carousel.
11. **`renderExploreByCategoryHTML()`** (server-injected, `server.js:1437`) — category tiles, queries its own data.
12. **`renderExploreRegionsHTML()`** (server-injected, `server.js:1483`) — hardcoded region tiles.
13. Results/directory section — map-toggle button, Leaflet map panel (collapsed by default), sort-select, data-sourcing disclaimer paragraph, empty `#venueGrid` div (populated entirely client-side, see §4–5).
14. "List Your Venue" lead-gen form.
15. "App coming soon" teaser section.
16. **SEO guide-links footer** (server-injected, `renderGuideFooterHTML()`, `server.js:1604`).
17. Footer (brand, nav columns, social, copyright).
18. Closing scripts: Leaflet JS, `/scripts/app.js`, plus 2 server-injected inline scripts (`renderOpenNowScript()`, `renderHiddenElementsScript()`).

**Architectural note (not a redesign recommendation, a constraint to know):** this splice-on-every-request approach means the homepage is not cached, not templated by a real engine, and silently breaks if the literal anchor text in `okanagan.html` ever changes — a redesign that touches those anchor strings must update `server.js` in lockstep.

---

### 2. What each section currently does

Covered inline in §1; the two things worth calling out separately:
* The 4 "discovery module" server-injected sections (`Happening Soon`, `Hidden Gems`, `Explore by Category`, `Explore Regions`) each independently query (or, for regions, hardcode) their own data at request time and gracefully render nothing if empty — no shared data-fetch, no caching between them.
* The venue directory grid (`#venueGrid`) starts **completely empty** in the HTML that's served. It's filled in entirely client-side after page load (see §4–5) — there is no server-rendered venue content in the grid at all, only the hardcoded hero/featured carousels have real venue markup server-side.

---

### 3. Current navigation/header behavior

* Logo, nav links, social icons, EN/FR language toggle, hamburger — all in `server.js`'s injected header markup within the static file (confirmed structurally in §1).
* `initBlock3()` (`app.js:993`) wires the hamburger: toggles a `.open` class on `.nav-links`.
* Below 940px (`app.css:857`), `.nav-links` becomes an absolutely-positioned dropdown (`display:none` until `.open`), the hamburger becomes visible, and the "app" CTA button (`.app-btn`) is hidden entirely.
* Language toggle (`setLanguage()`, `app.js:385`) rewrites all `data-i18n`/`data-i18n-placeholder` text in place and persists the choice to `localStorage` — no page reload, no URL change.
* Internal hash-links (e.g. `#directory`, `#list-venue`, `#app`) are intercepted globally (`app.js:2342`) and deliberately deferred/offset-corrected for the header height, specifically to work around the venue grid's async load changing page height mid-scroll (see §13).

---

### 4. Current hero/search/discovery experience

* **Hero carousel:** 10 hardcoded venues with inline base64-encoded JPEG images (not real `<img src>` files — see §7/§14), auto-advancing via `requestAnimationFrame`-driven logic (`initBlock12`'s neighboring IIFE structure at `app.js:1536` handles the featured strip; the hero carousel's own auto-advance/tooltip/scroll logic spans roughly `app.js:1600-1810`), pausing on user interaction (wheel/touch/mouse) for a few seconds before resuming, and fully disabled under `prefers-reduced-motion`.
* **Search box:** a single text input + button. `runSearch()` (`app.js:831`) lowercases/trims the term and matches against venue name, region, cuisine, and description text via simple `.includes()` — no fuzzy matching, no ranking, no debounce (filters re-run synchronously on every applicable event).
* **Discovery Wizard (`initBlock8`, `app.js:1162`):** a distinct, separate UX from the search box — 3 sequential steps (Region → Type → Amenities) with a progress-dot indicator, each "Continue" button showing a live "(N selected)" count, ending in a "results" state that hides the wizard and reveals the filtered grid. Reset dispatches a custom `wizard:reset` DOM event that several other modules (search, cuisine/price refine panel) also listen for.
* **Weather-driven discovery:** the weather banner (`app.js:2159`) fetches Open-Meteo for either the user's last-granted geolocation or a Kelowna fallback (never prompts fresh for permission on load — explicit UX decision per an in-code comment), and its CTA button pre-applies a small set of suggested filter chips (e.g. patio+view on a warm day) before jumping to results.
* **Weekly spotlight:** deterministic weekly rotation (`Math.floor(Date.now() / 1 week) % pool.length`) over venues meeting a quality bar (rating ≥ 4.5, ≥ 100 reviews, has a description) — no manual curation, changes automatically every 7 days, same pick for all visitors within a week.
* **All client-side filtering (search box, wizard, chips, cuisine/price, favorites-only) operates on the same in-memory venue-card set** built once by `renderVenueCards()` after the `/api/venues?limit=5000` fetch resolves (see §5) — filtering itself is instant/synchronous DOM show/hide, not further API calls.

---

### 5. Current venue/category/region discovery components

* **Venue grid is 100% client-rendered.** `loadVenuesAndInit()` (`app.js:690`) fetches `GET /api/venues?limit=5000` on page load, and `renderVenueCards()` replaces `#venueGrid`'s `innerHTML` with cards built from `venueCardHtml()` (`app.js:593`) — a template-string function, not React (no React/JSX/Virtual DOM anywhere in the codebase; confirmed by grep — a comment inside `renderOpenNowScript()` in `server.js` claims the grid "re-renders... via React," which is **incorrect** given the actual client code; flagged as a stale/wrong comment, not a real React dependency).
* If the `/api/venues` fetch fails, the grid shows a plain error message and never populates — but all the filter controls (wizard, search, chips) still initialize and remain interactive (explicit design choice per an in-code comment), they just have nothing to filter.
* **Category discovery:** `renderExploreByCategoryHTML()` — a separate, independently-queried server-rendered module (not connected to the client-side grid's filtering state).
* **Region discovery:** `renderExploreRegionsHTML()` — hardcoded region tiles, also disconnected from the live client-side filter state; clicking presumably deep-links back into the wizard/filter UI (not independently traced further, out of scope for this pass).
* **Map view:** `initBlock2()` (`app.js:877`) lazy-initializes a Leaflet map only when the map-toggle button is first clicked, with one marker per region (not per venue) whose popup lists up to 12 currently-filter-matching venues in that region; markers dim to 40% opacity when nothing matches. **Note:** `renderHiddenElementsScript()` in `server.js` currently force-hides the map-toggle button (`.map-toggle-row`) on every page load via a 300ms polling loop (see §6/§13) — so this entire map feature, while fully implemented and wired up, is **not currently reachable by visitors** on the live homepage.
* **Trip planner:** an independent IIFE (`app.js:1794`) maintaining up to 10 stops in `localStorage`, building a Google Maps multi-stop directions URL on demand — entirely separate from the wizard/filter state.
* **"Near me":** `app.js:1967` — geolocation-based nearest-region lookup exposed as `window.__findNearestRegion`, consumed by the weather banner; a haversine calculation against a hardcoded region-centroid table (duplicated almost verbatim in both `initBlock2` and this module, both listing ~19-20 region coordinate pairs independently — a real duplication, not shared from one source).

---

### 6. Current mobile behavior and any obvious responsive problems

* Only 8 `@media` blocks total across 892 lines of the live stylesheet (`app.css:93, 228, 393, 407, 558, 857, 876, 888`). The two substantive breakpoints are 940px (hero stacks to 1 column, venue grid drops from presumably-wider to 2 columns, nav collapses to hamburger, app CTA hides, filter-bar label width adjusts) and 560px (venue grid drops to 1 column, search box stacks vertically, wizard dots shrink, nav social icons hidden).
* A `prefers-reduced-motion` block globally disables transitions/animations/smooth-scroll.
* **Not independently verified in a live/rendered browser this pass** (this was a static code read, not a browser test) — so the following are flagged as **things to check, not confirmed problems**: whether the map panel, trip-tray panel, and wizard step panels have their own adequate small-screen sizing (no dedicated media query block was found targeting `.map-panel`, `.trip-tray-panel`, or `.wizard-step-panel` specifically — they may simply not need one if built flexibly, but this wasn't confirmed either way without rendering the page).
* **Known, code-confirmed issue relevant to mobile equally as desktop:** the sticky filter-bar's un-sticking-on-scroll behavior required a documented JS workaround (see §13) because the CSS-only approach didn't work — this affects all viewport sizes, not mobile specifically.

---

### 7. Current image/visual treatment

* **The hero carousel's 10 images are inline base64-encoded JPEGs embedded directly in the HTML**, not `<img src="...">` references to real files. Quantified this pass: these 10 embedded images account for **1,021,852 of the file's 1,079,185 bytes — about 95% of the entire homepage HTML payload.** (See §14 for the performance implications.)
* The "Featured this month" strip's images were not separately traced this pass (out of the base64-count grep scope) — worth checking in a follow-up pass before redesign, since if they're also inline-base64 the true image weight could be even higher than the hero-only figure above.
* Design tokens (`public/styles/tokens.css`) define the canonical brand palette (`--sand`, `--plum`, `--teal`, `--amber`, `--cocktail`, `--cafe`, `--pub`, `--ink`, `--paper`, plus `-deep`/`-dark` variants) — explicitly documented in the file's own header comment as "the single source of truth... used by both the SPA and the server-rendered SEO pages."
* **Inconsistency found:** both `renderGuideFooterHTML()` and `renderOpenNowScript()` (the server-injected homepage sections) use their own hardcoded inline colors (e.g. `#0b6e4f`) instead of the documented token variables — a real, verifiable deviation from the site's own stated single-source-of-truth palette, not a matter of opinion.
* Fonts: Fraunces (headings) + Nunito (body), loaded from Google Fonts via `<link rel="preconnect">` + a single stylesheet request listing specific weights/italics.

---

### 8. Current calls-to-action

* Primary: the search box + 3-step wizard (get-to-results is the dominant homepage CTA).
* Weather banner CTA — "see suggestions" style button that pre-filters and jumps to results.
* Weekly spotlight CTA — jumps to results and scrolls directly to that one venue's card.
* Per-card CTAs: "Add to trip" / directions link / phone link / menu link / booking link (where data exists) — built inside `venueCardHtml()`.
* "List Your Venue" lead-gen form — posts to `formsubmit.co` (a third-party form-relay service, not the site's own backend) directly to `okanaganroam@gmail.com`, client-side only, no server-side validation or storage of submissions.
* "App coming soon" teaser section — no functional CTA traced this pass beyond its presence (not required by the checklist to trace further).
* Footer nav links and social icons.

---

### 9. SEO elements currently present on the homepage

* `<title>`, meta `description`, `rel="canonical"` (self-referencing, `https://okanaganroam.com/`).
* Full Open Graph set: `og:site_name`, `og:title`, `og:description`, `og:type=website`, `og:url`, `og:image` (+ width/height), `og:locale` (`en_CA`) + `og:locale:alternate` (`fr_CA`).
* Twitter Card set: `summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
* Server-injected **SEO guide-links footer** (`renderGuideFooterHTML()`) — real, crawlable internal links to guide pages, injected specifically (per an in-code comment) so search engines have a path to discover them from the homepage.
* GA4 tracking via `gtag.js` (`G-J312FGJPSC`), loaded `async`, with a defensive `trackEvent()` wrapper that no-ops silently if `gtag` hasn't loaded yet (ad blockers/slow network) — used throughout `app.js` for wizard/search/filter/map/trip/spotlight interaction events.
* **Caveat directly relevant to SEO, not previously flagged this session:** since the entire venue grid is client-rendered from a `fetch()` call (§5), any crawler that doesn't execute JavaScript (or executes it but doesn't wait for the async fetch) sees an **empty venue grid** in the raw HTML — the only venue-level content that's actually present in server-delivered markup is the 10 hardcoded hero venues and the 10 hardcoded featured-strip venues, plus whatever the 4 server-rendered discovery modules include. This is a real, structural SEO constraint to know before a redesign, not a redesign recommendation.

---

### 10. JSON-LD/schema currently present on the homepage

Exactly 2 `<script type="application/ld+json">` blocks in the `<head>`:
1. `@type: "WebSite"` (with the site's search/URL info).
2. `@type: "Organization"`, containing a nested `@type: "Place"` (the business's own location/area-served info).

No `ItemList`, `LocalBusiness`, or per-venue structured data on the homepage itself — consistent with the venue grid being client-rendered and not present in server-delivered HTML at all. (Whether individual venue detail pages or guide pages carry their own schema was not checked this pass — out of scope, homepage-only audit.)

---

### 11. Which existing components can be reused for a redesign

Purely descriptive inventory of what's currently modular/self-contained enough to plausibly carry forward as-is or with light changes — not a recommendation to keep or discard anything:
* The 4 server-rendered discovery modules (`Happening Soon`, `Hidden Gems`, `Explore by Category`, `Explore Regions`) are each self-contained functions with their own data queries and graceful self-omission — reusable as functions regardless of surrounding markup changes.
* `venueCardHtml()` and `renderVenueCards()` — the client-side card templating is centralized in one function, not scattered.
* The wizard's step-state machine (`showStep()`), the filter/search logic (`applyFilters()`), the trip planner, the favorites system, the weather banner, and the weekly spotlight are each self-contained modules (mostly IIFEs) with clear boundaries and `window.__*` exposure points for cross-module coordination — individually reusable/portable.
* `public/styles/tokens.css` is a real, clean, documented single source of truth for the brand palette already — reusable directly.
* The i18n system (`data-i18n` attributes + `applyTranslations()`/`setLanguage()`) is generic and markup-driven, not tied to specific homepage sections — reusable as-is for new markup as long as new sections use the same attribute convention.
* GA4 event tracking (`window.trackEvent` wrapper) is generic and already used broadly — reusable.

---

### 12. Which parts would require new frontend work

Also purely descriptive, not a proposal:
* The hero carousel's image delivery mechanism (inline base64) would need to change to real image files/URLs for any redesign that cares about page weight or wants standard lazy-loading/responsive `srcset` behavior — current markup doesn't support that pattern at all.
* The region-coordinate table is duplicated (near-identically) in two separate places in `app.js` (`initBlock2`'s `REGION_COORDS` and the "Near me" module's own `REGION_COORDS`) — a redesign touching either would need to either keep both in sync manually or consolidate them, since there's currently no shared source.
* The orphaned `initBlock12` "Live search the whole Okanagan Valley (beta)" Google-Places-API code path (see §13) — its target DOM elements (`#liveSearchToggle`, `#liveSearchBody`, etc.) don't exist anywhere in the current HTML (confirmed via repo-wide grep), so this function throws on every single page load. A redesign would need to either properly reintroduce the matching markup or remove the dead function — right now it's neither.
* The venue-grid's client-only rendering (§5/§9) would need real work (server-side rendering, a static-generation step, or equivalent) if a redesign goal includes crawlable/indexable per-venue content on the homepage itself.
* The sticky-filter-bar CSS bug currently patched via injected JS (§13) would need an actual CSS fix if that injected-script approach is retired in a redesign.

---

### 13. Technical constraints to know before redesigning

* **The splice-based assembly pattern (§1):** `server.js`'s `/` handler locates exact literal strings in `okanagan.html` and splices content around them. There is no templating engine, no build step, and no caching — the file is read from disk and re-spliced on every single request. A redesign that changes the anchor text this logic depends on will silently break the 4 discovery modules, the SEO footer, and both injected scripts unless `server.js` is updated in the same change.
* **Two independent, redundant `/api/venues?limit=5000` fetches happen on every homepage load** — one from `loadVenuesAndInit()` (for the grid) and a separate one from the weekly-spotlight IIFE — each pulling the full venue dataset independently rather than sharing one fetch/cache.
* **A documented, unresolved CSS bug:** the sticky filter-bar doesn't reliably un-stick on scroll via CSS alone — `renderOpenNowScript()` in `server.js` patches this with injected JS rather than a CSS fix, per an explicit in-code comment describing the CSS-only attempt as having failed.
* **An aggressive re-render pattern on the venue grid that isn't fully understood/documented:** `renderHiddenElementsScript()`'s own comment history states a plain `<style>` tag *and* a `MutationObserver` were both tried to keep certain elements (the map-toggle row, the results-count text, a disclaimer paragraph) hidden/adjusted, and **both failed** — only interval-based polling (every 300ms, indefinitely, for the lifetime of the page) reliably works. This strongly implies something in the client rendering pipeline periodically rewrites or replaces these DOM nodes in a way that isn't a simple one-time `innerHTML` set — the exact mechanism was not identified this pass (would need deeper tracing of `applyOpenStatusToHeroAndFeatured()` and related re-apply logic) but is flagged as a real, non-trivial thing to understand before relying on similar hide/patch tricks in a redesign.
* **Dead/orphaned code:** the `initBlock12` Google-Places "Live search" function (§12) throws a `TypeError` on `null.addEventListener` on every single page load, per a real code-level contradiction — a `server.js` comment claims this feature "was removed entirely from the codebase in the Google Places cleanup," but the function and its call-site (`app.js:722`) are still very much present and still execute unconditionally on every homepage load.
* **Two root-level files, `app.css` and `app.js` (in the repo root, not under `public/`), are confirmed genuinely unused** — not referenced by `okanagan.html`, any other HTML file, or `server.js` (only a single code comment mentions them in passing). Safe to treat as legacy/dead for redesign purposes, though not deleted as part of this read-only pass.
* **The map feature is fully built but currently unreachable** — its toggle button is force-hidden by `renderHiddenElementsScript()`'s polling loop (§5), so any redesign decision about the map should account for the fact it's "off," not "missing."
* **The region-coordinate table is duplicated** in two places in `app.js` (§12) — a real single-source-of-truth gap for anyone building on top of region geography.
* **The lead-gen "List Your Venue" form has no backend integration** — it posts directly to a third-party relay (`formsubmit.co`) from the client, with no server-side record of submissions in this codebase.

---

### 14. Homepage performance concerns

* **`okanagan.html` is 1,079,185 bytes, of which 1,021,852 bytes (~95%) is inline base64 image data** for the 10-venue hero carousel — measured directly this pass via `awk`/byte counts, not estimated. Base64 encoding itself adds ~33% overhead versus the equivalent binary image files, and because the images are embedded in the HTML document itself (which is generated fresh, uncached, on every request per §13), they get none of the normal benefits of separate image files: no independent browser image cache, no CDN-ability, no lazy-loading, no responsive `srcset`, and they can't be served with long-lived cache headers independently of the HTML they're embedded in.
* **Two full, redundant `/api/venues?limit=5000` fetches per page load** (§13) — doubles the venue-data payload transferred and doubles the backend query work for something that could be a single shared fetch.
* **`renderHiddenElementsScript()`'s `setInterval(apply, 300)` polls and re-scans the DOM (including a `querySelectorAll('p')` full-page paragraph scan and a `querySelectorAll('.venue-desc:not([data-desc-init])')` scan) every 300ms, indefinitely, for the entire time the tab is open** — a real, continuous background cost (CPU/battery), not a one-time page-load cost, and it exists specifically because more targeted approaches (a `<style>` tag, a `MutationObserver`) didn't reliably work against whatever re-renders these elements (§13) — the underlying cause of that re-render behavior is unquantified and unexplained by this pass.
* **The venue grid renders nothing until a network round-trip completes** (§5/§9) — meaning the homepage's main content (the directory) is not visible at all until `/api/venues` responds, on top of whatever time the ~1MB HTML document itself takes to download and parse.
* The featured-strip auto-scroll and hero carousel auto-advance both use `requestAnimationFrame`/timers responsibly (both respect `prefers-reduced-motion`, and both pause during user interaction) — not flagged as a concern.
* GA4's `gtag.js` loads `async` and is defensively wrapped so it never blocks other homepage functionality — not flagged as a concern.

---

**No file was modified, no code was changed, no production data was touched, no admin endpoint was called, no deployment happened.** This entire pass was a static, read-only source audit of `okanagan.html`, `server.js`'s homepage-related code, `public/scripts/app.js`, and `public/styles/app.css`/`tokens.css` — no redesign proposal is included, per the explicit scope of the request.

## Homepage Hero Redesign — Implementation (2026-09-15)

### Claude — implemented the approved hero concept. Code change, on this review branch only. Not deployed, not merged to main, no production data touched.

* **Status: implemented and verified locally. Committed to `ai-handoff/2026-09-15` only. `main` was never touched — this work was briefly started on a dirty `main` checkout by mistake, caught before any commit, and moved onto this branch via `git stash` before anything was ever committed. `main`'s SHA is unchanged (`9373c28`, verified both locally and against `origin/main` before and after this session).**
* **Scope respected:** only `<section class="hero">` (and the small amount of markup/JS/CSS that exclusively served the old hero) was changed. No other homepage section's markup, behavior, or visual design was touched. No route was added or changed except one new static-asset GET route for the hero photo itself. No venue data, database schema, or production database was touched.

---

### What changed, and why

**The old hero** was a two-column layout: a 10-image auto-advancing carousel (each image individually base64-embedded directly in `okanagan.html`) on the left, a plain heading/lead/eyebrow on the right — no search field and no quick actions inside the hero at all (the site's one search box lived at the *top of the wizard/filter-bar section*, not in the hero).

**The new hero** is a single full-bleed photograph with a centered headline, supporting copy, the site's existing search field (relocated into the hero), and four quick-action buttons (Eat / Drink / Explore / Hidden Gems) — matching the approved concept exactly: "Explore the Okanagan. Find your next favourite place." / "Discover restaurants, wineries, cafés, breweries, pubs, cocktails and things worth doing across the Okanagan." / "What are you looking for?"

---

### Files changed

* **`okanagan.html`** — replaced the entire old `<section class="hero">...</section>` block (10 base64 `<img>` carousel scenes, prev/next arrows, captions, badges, the separate `hero-left`/`hero-right` two-column structure) with the new single-image hero markup. Also **moved** (not duplicated) the pre-existing `#searchInput`/`#searchBtn` search-box `<div>` out of the top of the `<section class="filter-bar" id="directory">` wizard section and into the new hero, since the approved concept explicitly places "a large search field" inside the hero and this *is* the site's one real search implementation — same element IDs, same markup shape, so `initBlock1()`'s existing search wiring in `app.js` needed zero changes. The wizard/filter-bar section itself (region/type/amenity steps) was left completely untouched, just minus that one relocated div. File dropped from **1,079,185 bytes to 50,465 bytes** (a 95.3% reduction) purely from removing the 10 embedded images; nothing else in the file was touched.
* **`public/images/hero.jpg`** (new file, 87.4 KB) — the new hero photograph. See "Design decisions" below for where this image came from.
* **`server.js`** — added one new static-file GET route, `/images/hero.jpg`, following the exact existing pattern already used for `/og-image.png` (`fs.readFileSync` + `Content-Type: image/jpeg` + `Cache-Control: public, max-age=86400`). No other route, endpoint, or database logic was touched.
* **`public/scripts/app.js`** —
  * Removed two now-dead IIFEs that existed solely to drive the old hero carousel (`Hero slideshow: auto-advance plus manual prev/next arrows`, and `Hero scenes: click to jump to that venue's card`) — both already self-guarded (`if (!scenes.length) return;` / `if (!heroArt) return;`) so removing them changes no runtime behavior, it just deletes code that could no longer ever run.
  * Added one new small IIFE (`Hero quick actions`) that wires the four new buttons: **Eat** presses the existing `restaurant`+`cafe` type-chip filters, **Drink** presses `winery`+`brewery`+`cocktail`+`pub`, both then reveal results using the exact same `wizard:showResults` + `__hideFilterBarNow()` pattern the pre-existing weather-banner CTA already uses (same code path, not a new mechanism). **Explore** reveals the full, unfiltered results the same way. **Hidden Gems** is a plain `<a href="#hiddenGems">` — no new JS at all, it's handled entirely by the site's existing global hash-link scroll interceptor, and `#hiddenGems` is the real, already-existing `renderHiddenGemsHomepageHTML()` section id.
  * Updated the `TRANSLATIONS` dictionary (both `en` and `fr`) with the new headline/lead/search-placeholder/quick-action copy, and removed the now-unused `hero.eyebrow`/old `hero.headline` keys. The old French copy was replaced with new French translations of the approved English copy (not left English-only), so the EN/FR language toggle continues to work correctly on the redesigned hero.
  * `applyOpenStatusToHeroAndFeatured()` (used by both the old hero *and* the still-untouched "Featured this month" strip) was deliberately **left unchanged** — its `.hero-scene[data-venue-name]` query now just matches nothing (an empty `NodeList.forEach`, a no-op), and its `.featured-card` half keeps working exactly as before. Editing this shared function wasn't necessary and would have meant touching code that also serves an unrelated section.
* **`public/styles/app.css`** — replaced the old hero-specific rules (`.hero-art`, `.hero-scene*`, `.hero-nav-arrow*`, `.hero-caption*`, `.hero-badge`, the old `.hero .wrap` two-column grid, `.hero-heading`) with new rules for the full-bleed photo + scrim + centered content layout, plus a `max-width:640px` mobile breakpoint. The shared `.eyebrow`, `.search-box`/`.wizard-search-box`, and `.venue-card-highlight`/`@keyframes` rules (all still used elsewhere or by the relocated search box) were preserved verbatim, not touched. Also removed one now-dead `.hero .wrap{ grid-template-columns:1fr; }` line from the existing 940px responsive media query block, since `.hero-inner` is no longer a grid.

---

### Design decisions

* **The hero photograph is a real file, not new photography.** This repo has no image-asset library and no image-fetching capability was available or appropriate to use for sourcing new licensed photography mid-task. Rather than invent an image or leave the hero broken, I extracted the best-suited existing photo from the *site's own already-live* 10-image hero carousel (Elephant Island Winery — vineyard, blossoms, mountains, golden-hour light; the most "outdoors-oriented, distinctly Okanagan" of the ten, and the only one without a competing business's own sign/branding prominently in frame or recognizable people at a table, both of which the other strong candidates had). This is the same image already displayed at the same or greater visual prominence on the live site today — extracting it into a real file changes nothing about its usage rights, only how it's delivered. **Known limitation, flagged honestly:** the source image is only 679×452px (it was already a small carousel thumbnail, not full-resolution photography), so it will look acceptably good but not perfectly crisp when stretched across a large desktop viewport. Recommend sourcing a proper high-resolution licensed Okanagan landscape/vineyard photo as a follow-up before this ships to production — this pass prioritized fixing the base64-payload architecture problem with an available, zero-risk asset over sourcing new photography, which was out of scope for this task.
* **The search field was moved, not duplicated.** The approved concept's layout hierarchy explicitly places "a large search field" inside the hero. The site already has exactly one real search implementation (`#searchInput`/`#searchBtn`), previously sitting at the top of the separate wizard section. Duplicating it would have meant two elements sharing the same `id`, which breaks `getElementById`-based wiring. Relocating the single existing element into the hero was the only option that satisfies "preserve existing search functionality" and "large search field in the hero" simultaneously.
* **Quick actions reuse existing filter/reveal mechanics, not a new backend.** Eat/Drink map to existing `.type-chip[data-type]` values already used by the wizard; Explore reveals the existing unfiltered grid; Hidden Gems links to the existing `#hiddenGems` section. No new API, no new filter dimension, no new route.
* **No eyebrow tagline.** The approved concept's copy doesn't include one, and the design principles explicitly ask to avoid excess text/clutter, so the old "Enderby to Osoyoos" eyebrow was dropped rather than repurposed.
* **Headline line break implemented as two separate `data-i18n` spans, not a literal `<br>`.** `applyTranslations()` sets `textContent` (not `innerHTML`) on every `data-i18n` element, so any HTML tag placed inside one gets wiped out (and would show as literal text) the instant the page's i18n init runs on load, in *any* language, every time. Splitting the headline into two independently-translated `<span data-i18n="hero.headlineLine1">`/`...Line2` elements, styled `display:block`, avoids that failure mode entirely and keeps both lines correctly translatable.
* **A real flexbox bug was found and fixed during verification, not left in:** `.hero-inner` was originally a flex column with `align-items:center` and no `min-width:0`. Flex items default to `min-width:auto`, which means a text-heavy child can refuse to shrink below its unwrapped content width and overflow its container — a real, verifiable bug (confirmed via headless-browser screenshot before the fix, and confirmed fixed after — see Verification). Fixed by adding `width:100%; min-width:0; box-sizing:border-box` plus explicit side padding to `.hero-inner`.

---

### A pre-existing site-structure discrepancy, surfaced but deliberately NOT changed

While verifying the rendered page, I found that the hero is **not literally the second thing on the page** today. The actual section order, driven by `server.js`'s existing literal-string-anchor splice logic (documented in the prior homepage audit), is:

`header → filter-bar/wizard (search box now moved out of it, into the hero) → Happening Soon → Hidden Gems → hero → Explore by Category → Explore Regions → weather banner (hidden) → spotlight banner (hidden) → featured venues → results/grid → ...`

This ordering is **pre-existing site architecture** — the wizard/filter-bar section already sat before the hero, and `server.js`'s `wizardToHeroAnchor` already injected the "Happening Soon"/"Hidden Gems" modules immediately before the hero section, before this task began. Nothing in this task changed that ordering; I only changed what's *inside* `<section class="hero">` itself.

I chose **not** to reorder the wizard or the discovery modules relative to the hero, because doing so would mean editing `server.js`'s anchor-matching logic and/or moving other sections' physical position in `okanagan.html` — squarely "modify[ing] any other homepage section," which the task explicitly prohibited four separate times. I also didn't want to risk silently breaking the Happening Soon/Hidden Gems injection (those anchors are exact-literal-string matches; get them wrong and the modules just silently stop rendering with no error, exactly the fragility the earlier audit flagged).

**Flagging this explicitly as a follow-up decision, not resolving it here:** the approved concept's layout hierarchy ("1. Header/navigation 2. Large full-width hero image...") reads most naturally as the hero being the very first thing under the header. Today it's the fourth section down. If the intent is for the hero to be the literal first thing visitors see, a follow-up task should either move the wizard/discovery-modules to after the hero, or move the hero before the wizard (both require deliberately touching `server.js`'s anchor strings, which I did not want to do inside a "hero-only" task without explicit approval).

---

### Verification performed

* **Test suite:** `npm test` — **58/58 passing**, both before and after moving the work onto this branch, no regressions.
* **`node --check`** on both `server.js` and `public/scripts/app.js` — clean, no syntax errors.
* **Payload size, measured directly:** `okanagan.html` dropped from 1,079,185 bytes to 50,465 bytes (raw file). The live-served homepage (through `server.js`'s injection pipeline, against the small local dev dataset) dropped to 70,058 bytes with **zero** `base64,` occurrences (confirmed via `grep -c` on the actual HTTP response body, not just the static file).
* **Hero image route:** `GET /images/hero.jpg` verified locally returning `200`, `Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400`, 87,400 bytes.
* **Desktop rendering:** verified with real, rendered headless-Chrome screenshots (not just code review) at 1440px width, both in isolation and in full page context — full-bleed photo, centered headline/copy/search/quick-actions, correct brand colors and fonts, no clipping, all four quick-action buttons in one row.
* **Mobile rendering:** headless Chrome's `--screenshot` flag turned out to enforce an **undocumented ~500px minimum viewport width** regardless of the `--window-size` requested (verified directly by rendering a `window.innerWidth`-reporting test page — asked for 390px, got 500px back) — so a true 375–390px screenshot wasn't obtainable with the tooling available in this environment. Verified instead at the smallest width the tool would actually honor (500px, still within the hero's `max-width:640px` mobile breakpoint): headline wraps cleanly to 3 lines, supporting copy wraps to 2 lines, search field and all four quick-action buttons (2-up wrapping) fit with no overflow, in both isolation and full real-page context. The CSS uses only relative/percentage sizing with no fixed-width elements below that breakpoint, so I'm reasonably but not 100%-visually confident it holds at true 375–390px phone widths too — **flagging this as a real tooling gap, not claiming a true narrow-phone screenshot that wasn't actually taken.**
* **A real bug was caught and fixed during this verification**, not glossed over: the first mobile-width screenshots showed the headline and quick-action buttons clipped past the right edge. Root-caused to a flexbox `min-width:auto` overflow (see Design decisions), fixed, and re-verified clean with a repeat screenshot before moving on.
* **Search field:** confirmed the exact same `#searchInput`/`#searchBtn` element IDs and `initBlock1()` wiring are used, unchanged; confirmed via the rendered DOM dump that `#searchInput` appears exactly once on the page (no duplicate-ID conflict from the relocation).
* **Quick actions:** confirmed via a rendered DOM dump that all of `.type-chip[data-type="restaurant"|"cafe"|"winery"|"brewery"|"cocktail"|"pub"]`, `#hiddenGems`, and the four `.hero-quick-btn` elements exist exactly where the new click-delegation logic expects them.
* **Console/runtime errors:** captured actual browser console output via headless Chrome (`--enable-logging=stderr`) while loading the real local homepage. Found exactly **one** error — `Uncaught (in promise) TypeError: Cannot read properties of null (reading 'addEventListener')` at `app.js:1457` — and confirmed by reading that exact line that it is the **pre-existing, already-documented** orphaned Google-Places "live search" bug from the prior homepage audit (`initBlock12`, never touched by this task). No new console errors were introduced by this change.
* **Navigation regression check:** screenshotted the header/nav at both desktop and mobile widths — logo, nav links, EN/FR toggle, and hamburger menu all render and behave identically to before; nothing in the header/nav markup or CSS was touched by this task.
* **Unrelated-section check:** `git diff --stat` shows changes confined to `server.js` (+16 lines, new route only), `okanagan.html` (hero block + one relocated div only), `public/scripts/app.js`, and `public/styles/app.css` (hero-specific rules only, verified line-by-line that `.eyebrow`, `.search-box`, `.venue-card-highlight`/`@keyframes`, and every other section's CSS block are byte-for-byte unchanged). No other homepage section's markup was touched.

---

### Issues / follow-up items for a future pass

1. **Hero image resolution** — the current photo is a reused 679×452 thumbnail; source and swap in a proper high-resolution licensed photo before this goes to production.
2. **Hero's position relative to the wizard and the Happening Soon/Hidden Gems modules** — see the dedicated section above. A deliberate, undone-on-purpose decision, not an oversight; needs an explicit call on whether to reorder sections.
3. **True narrow-phone (≤400px) visual verification** wasn't directly screenshot-able with the headless tooling available in this environment (500px was the smallest true viewport obtainable) — recommend a real-device or properly-configured-emulator check before shipping.
4. **Pre-existing, unrelated bug reconfirmed, not fixed:** the orphaned `initBlock12` Google-Places "live search" `TypeError` (documented in the original homepage audit) still fires on every page load. Out of scope for a hero-only task; still on the books for a future cleanup pass.

---

**No production data was touched, no admin endpoint was called, no deployment happened, nothing was merged or committed to `main`.** All changes described above are implemented and committed on `ai-handoff/2026-09-15` only.

## Homepage Hero — Visual QA Pass (2026-09-15)

### Claude — visual QA only. No design changes made, no other sections touched, no production changes.

* **Status: QA/documentation only. No CSS/HTML/JS was modified. No other homepage section was touched. No venue data or database was touched. No deploy. Nothing merged to `main`.**
* **Verdict: NEEDS REVISION** — one genuine, reproducible visual defect found at every tested width (headline wraps to 4 lines instead of the intended 2), plus a related vertical-balance issue and one pre-existing, out-of-scope header issue at 375px. Full detail below.

---

### Method

Screenshotted the real local homepage (`http://localhost:3099/`, this branch's code, small local dev dataset) using a purpose-built CDP-driven screenshot tool, not the Chrome CLI `--screenshot` flag. **Why:** the CLI flag was already found, empirically, in the previous session to silently enforce an undocumented ~500px minimum layout viewport regardless of the requested `--window-size` (confirmed by rendering a page that reports `window.innerWidth` back — asking for 390px returned 500px), which would have made the 390px/375px mobile checks this task explicitly asks for inaccurate. Built a small script (`cdp_screenshot.js`, local scratchpad only, not part of the repo) using Node's built-in `WebSocket` client to talk directly to Chrome DevTools Protocol: `Emulation.setDeviceMetricsOverride` for a true viewport width, `Page.captureScreenshot` for the image, and `Log`/`Runtime` events for real console-error capture. Verified this approach gets a genuine 390px viewport (same `innerWidth`-reporting test page, this time correctly returned 390) before trusting it for the actual QA screenshots.

Also discovered and corrected for a real quirk in the page itself: the wizard's own init code (`showStep(1)`, pre-existing, untouched by the hero task) calls `scrollIntoView()` on the filter-bar section on every page load, so a screenshot taken right after load without forcing scroll position lands somewhere other than the true top of the page. Forced an explicit scroll position before every capture (either `scrollTo(0,0)` for header checks, or `scrollIntoView()` on `.hero` for hero checks) so results are deterministic rather than dependent on load-timing luck.

---

### 1–4. Screenshots captured at all four requested widths

All four widths were captured both (a) at the true top of the page (header/logo check) and (b) scrolled precisely to the hero section (hero content check):

| # | Width | Header check | Hero check |
|---|---|---|---|
| 1 | Desktop, 1440px | clean | 4-line headline wrap (see Issue 1) |
| 2 | Laptop, 1280px | clean | 4-line headline wrap (see Issue 1) |
| 3 | Mobile, 390px | clean | 4-line headline wrap, no horizontal overflow |
| 4 | Mobile, 375px | **logo/EN-FR-toggle wrap** (see Issue 3) | 4-line headline wrap, no horizontal overflow |

---

### Findings

**Issue 1 — Headline wraps to 4 lines instead of 2, at every width tested (genuine defect).**
The approved copy and the implementation's own design intent (documented in the previous AI_HANDOFF entry) was a clean two-line headline: "Explore the Okanagan." on its own line, "Find your next favourite place." on its own line, via two separate `display:block` spans. In practice, at **all four widths (1440/1280/390/375)**, each sentence *itself* wraps onto a second line inside its own span — "Explore the" / "Okanagan." / "Find your next" / "favourite place." — producing a 4-line headline block, not 2. Root cause (diagnosis only, not fixed): `.hero-inner`'s `max-width: 640px` is narrower than either full sentence needs at the current `font-size: clamp(2.1rem, 5vw, 3.4rem)`. This is reproducible at every width, not a one-off. It works against the "confident, editorial, calm" brief — a 4-line, visually "busy" headline reads differently than the clean 2-line mark that was intended.

**Issue 2 — Vertical balance: noticeably more empty hero-photo space below the quick-action buttons than above the headline**, most visible on desktop/laptop (1440/1280). Not broken, but doesn't read as tightly composed as the brief's "visually calm" / "confident" goals ask for. Likely compounded by Issue 1 — a taller, 4-line headline shifts the whole content block's effective vertical footprint, which may be interacting with `.hero`'s `align-items:center` vertical centering in a way that doesn't distribute evenly. Flagging as an observation to revisit together with Issue 1, not a separately-diagnosed root cause.

**Issue 3 — Pre-existing header issue, NOT caused by the hero redesign, but genuinely observed at 375px:** the header's logo wordmark ("Okanagan Roam") wraps to two lines, and the EN/FR language toggle wraps to two lines ("EN /" / "FR"), specifically at 375px (not at 390px, where both fit on one line). This is entirely inside the header/nav markup and CSS, which the hero task never touched. Documenting it because the QA checklist explicitly asked for a 375px header/logo check and this is what's actually there — flagging for whoever owns header work next, not something addressed here.

**Console/runtime errors — clean, no new errors at any width.** Checked all four widths via real `Runtime.exceptionThrown`/`Log.entryAdded` CDP events (not just eyeballing screenshots). Found exactly the same single **pre-existing** error at every width — `Uncaught TypeError: Cannot read properties of null (reading 'addEventListener') at initBlock12 (app.js:1457)` — which is the already-documented orphaned Google-Places "live search" dead code identified in the original homepage audit and reconfirmed (not introduced) during the hero implementation's own verification pass last turn. No second or new error appeared at any of the four widths.

**Things that check out cleanly, no issues found:**
* **No horizontal overflow at 390px or 375px** — confirmed at the *true* viewport width via CDP (not the CLI tool's inflated ~500px floor). The `min-width:0` flexbox fix from the implementation pass holds correctly at real narrow-phone widths, not just the ~500px width that was the smallest the previous verification pass could actually screenshot.
* **Search field** — good size, contrast (dark placeholder text on off-white input, clear teal button), and placement at all four widths. On mobile it correctly stacks to a full-width input above a full-width button (pre-existing `.search-box` responsive rule, working correctly in its new hero context).
* **Quick-action buttons (Eat/Drink/Explore/Hidden Gems)** — all four fit comfortably in one row at 1440px and 1280px; wrap to a 2-up + 2-full-width layout at 390px/375px exactly as the brief allowed ("may wrap/reflow naturally"). Good contrast (semi-transparent glass-style buttons read clearly over the photo at every width tested), no crowding, no text clipping inside any button at any width.
* **Image composition/focal point** — consistent across all four widths (`object-fit:cover` recentring correctly, no stretching or broken crop). The building/barrels sit left-of-center at narrower widths with more open sky visible on the right — a legitimate stylistic observation, not a defect; worth a look if a tighter/more centered focal point is wanted, but nothing is broken.
* **Header/logo positioning at 1440/1280/390** — clean, correctly aligned, unaffected by the hero changes (expected, since the header itself was never touched).

---

### Screenshot files

All captured this pass, stored in this session's local scratchpad only (not committed to the repo — no existing convention in this project for storing QA screenshots in git, and committing binary QA artifacts wasn't part of the request):
`v3_desktop_1440_top.png`, `v3_desktop_1440_hero.png`, `v3_laptop_1280_top.png`, `v3_laptop_1280_hero.png`, `v3_mobile_390_top.png`, `v3_mobile_390_hero.png`, `v3_mobile_375_top.png`, `v3_mobile_375_hero.png`.

---

**No design change was made. No other homepage section was modified. No venue data or database was touched. No deploy. Nothing merged to `main`.** This entire pass was screenshot capture, console-log capture, and visual inspection only.

## Homepage Hero — Headline 4-Line Wrap Fix (2026-09-15)

### Claude — fixed the single defect identified in the hero QA pass. Nothing else changed.

* **Status: fix implemented and verified. Committed to `ai-handoff/2026-09-15` only. No other homepage section touched. No venue data or database touched. No deploy. `main` untouched.**

---

### Exactly what was changed

One file, one property value, in `public/styles/app.css`:

```diff
   .hero-inner{
     position:relative; z-index:1;
     display:flex; flex-direction:column; align-items:center; text-align:center;
-    width:100%; min-width:0; max-width:640px; margin:0 auto;
+    width:100%; min-width:0; max-width:920px; margin:0 auto;
     box-sizing:border-box; padding-left:24px; padding-right:24px;
   }
```

**Root cause (confirmed, not just theorized):** `.hero-inner`'s `max-width:640px` was narrower than either headline sentence needs at the hero's `font-size: clamp(2.1rem, 5vw, 3.4rem)` on desktop/laptop, so each sentence wrapped a second time inside its own `display:block` span, producing 4 lines instead of the intended 2.

**Why widening `.hero-inner` alone was sufficient, with no other rule touched:** `.hero-title` has no `max-width` of its own, so it was simply inheriting whatever room its parent (`.hero-inner`) gave it — widening the parent gives the headline room to lay out as one line per sentence. `.hero-lead` (`max-width:46ch`) and `.hero .search-box` (`max-width:520px`) both already had their own, smaller, independent `max-width` values further down in the same file, unchanged — so they stay exactly the width they were, correctly centered under the now-wider headline, which is a normal and common hero pattern (bold headline wider than the supporting copy beneath it). Nothing else in the hero — image, scrim, search field, quick-action buttons, their CSS, or their markup — was touched.

At mobile widths (≤640px), `.hero-inner` is still `width:100%`, so this change has **zero effect there** — the `max-width:920px` ceiling was already far above what a 390px or 375px viewport could ever reach, confirmed by direct measurement (see Verification).

---

### Test result

`npm test` — **58/58 passing**, no regressions.

---

### Visual QA result at all four widths

Re-screenshotted the real homepage (same local dev setup and CDP-driven screenshot method used in the QA pass, which correctly reaches true narrow viewports rather than the Chrome CLI tool's inflated ~500px floor) at all four required widths, scrolled precisely to the hero section:

* **1440px (desktop):** Headline now renders as a clean, intentional **2 lines** — "Explore the Okanagan." / "Find your next favourite place." — exactly as intended. Search field and all four quick-action buttons unaffected, still well-proportioned and centered.
* **1280px (laptop):** Same clean **2-line** headline. The longer second line now spans close to the photo's visible edges but doesn't touch or clip against the frame — reads as confidently large, not cramped.
* **390px (mobile):** Headline is **unaffected by this change** (as expected, since `.hero-inner` was already `width:100%` here) — still wraps across 4 lines at the existing mobile font-size, exactly as it did before this fix. Confirmed this remains "balanced and readable" per the fix request's own mobile bar: natural word-boundary line breaks (no mid-word breaks), legible font size, centered, no crowding against the search field or buttons below it, no horizontal overflow.
* **375px (mobile):** Same as 390px — unaffected, still balanced and readable, no overflow.

**Why mobile wasn't also forced to 2 lines:** the fix request explicitly scoped the "2-line" requirement to desktop/laptop, asking only for "balanced and readable" on mobile. A rough check confirms why: fitting the full second sentence ("Find your next favourite place.", 32 characters) on one line within a 390px-wide phone's ~342px available content width would require shrinking the headline font to roughly a third of its current mobile size — well past legible/premium territory. Mobile's existing 4-line wrap, at its current legible size with clean word-boundary breaks and no overflow, already meets the "balanced and readable" bar the fix request set for mobile, so it was deliberately left alone rather than force-fit into 2 lines at the cost of legibility.

**Horizontal overflow — directly measured, not just eyeballed:** at both 375px and 390px, `document.documentElement.scrollWidth` exactly equals `window.innerWidth` (375=375, 390=390) — confirmed zero horizontal overflow via CDP `Runtime.evaluate`, not just visual inspection.

**Console/runtime errors:** checked at all four widths via real CDP `Runtime.exceptionThrown`/`Log.entryAdded` events. Only the same single, pre-existing, already-documented `initBlock12` error (`app.js:1457`, orphaned Google-Places dead code, unrelated to the hero work) appears at every width — no new error introduced by this change.

---

### Any issue remaining?

None from the original QA defect — the 2-line desktop/laptop presentation now matches the design intent exactly, and mobile remains correct/unaffected. The two other items noted in the QA pass (a header logo/EN-FR-toggle wrap at exactly 375px, and the pre-existing `initBlock12` console error) are both **pre-existing, out-of-scope issues unrelated to the hero headline** and were explicitly not touched here, per the fix request's "keep the change limited to the hero headline/layout issue" instruction.

---

**No other homepage section was modified. No venue data or database was touched. No deploy happened. `main` was never touched — verified unchanged (SHA `9373c28`, same as before this session) both before starting this fix and after committing it.**

## Homepage Section 2 — "Start Exploring" Implementation (2026-09-15)

### Claude — implemented the approved "Start Exploring" section only. Hero and all other sections untouched.

* **Status: implemented and verified. Committed to `ai-handoff/2026-09-15` only. No other homepage section touched. Hero markup/CSS confirmed byte-for-byte unchanged. No venue data written (one new read-only query only). No deploy. `main` untouched.**
* **Commit SHA: `eca7ab0517b4acd50ae7131a2cdefd4b6ea882f2`**

---

### Exact files changed

* **`server.js`** — added:
  * `renderStartExploringHTML()` (new function, ~55 lines) — builds the section's markup. Contains exactly one new database call, a read-only `SELECT` aggregating golf venues by region to find the best-supported region for a real `/<region>/golf` link (same pattern `renderExploreByCategoryHTML` already uses elsewhere, not shared/refactored into a helper — kept fully self-contained so nothing about that existing, untouched function needed to change).
  * A new CSS block appended to the existing `renderHomepageDiscoveryStyles()` function (the established shared stylesheet for all homepage discovery modules) — `.discover-lead`, `.explore-grid`, `.explore-card*` rules, plus a mobile reflow block inside the existing `@media (max-width: 640px)` query. No new `<style>` block, no new file — reuses the exact mechanism the site's other discovery modules already use.
  * One new static-image route, `/images/explore/<file>.jpg`, gated by an explicit 5-filename whitelist, mirroring the exact pattern already used for `/images/hero.jpg` and `/og-image.png`.
  * One new line wiring `renderStartExploringHTML()` into the existing `heroToWeatherAnchor` homepage-assembly replace, inserted immediately after the hero and before the existing "Browse by category"/"Explore the Okanagan" modules (which keep their own unchanged position right after it).
* **`public/scripts/app.js`** — added one new, fully self-contained IIFE (~30 lines) directly after the hero's own quick-actions IIFE, which it does **not** modify. Handles clicks on the 3 interactive cards (Eat/Drink/Explore) using the identical type-chip-press + `wizard:showResults` reveal mechanism the hero's quick actions already use — copied, not shared via refactor, so the hero's existing code stays completely untouched.
* **`public/images/explore/`** (new directory, 5 new files) — `eat.jpg`, `drink.jpg`, `hidden-gems.jpg`, `whats-on.jpg`, `explore.jpg`.
* **Not touched:** `okanagan.html`, `public/styles/app.css` (confirmed via `git diff --stat` showing zero changes to either file), any other render function, any route besides the one new image route, the database schema, or any venue row.

---

### Design implemented

* Section label "START EXPLORING", headline "Find something worth going out for.", and the exact approved supporting copy — all present verbatim.
* **Desktop/laptop (≥641px):** a 12-column CSS Grid, asymmetric per the approved concept — Eat (span 5), Drink (span 4), and Hidden Gems (span 3) form a tall top row (primary, ~2x the height of the row below); Golf (span 3), What's On (span 6, "wider"), and Explore (span 3) form a shorter second row (secondary). Matches the brief's suggested arrangement directly — no deviation was needed.
* **Mobile (≤640px):** reflows to a 2-column grid, not a shrunk copy of the desktop grid — Eat, Drink, and Hidden Gems each go full-width and stay visually prominent (as required); Golf and Explore pair up side-by-side; What's On becomes a full-width strip. Visual order is remapped for this layout via CSS `order` (not a DOM change), so keyboard/screen-reader order still follows the logical Eat→Drink→HiddenGems→Golf→WhatsOn→Explore sequence.
* Each photo card: full-bleed image, bottom gradient scrim for text contrast, a single title in the site's existing Fraunces serif, restrained hover (`translateY(-3px)` lift + a 1.04x image scale — the same lift/shadow language `.discover-card`/`.hidden-gem-card` already use elsewhere on this homepage, not a new hover language). Rounded corners at 16px, consistent with the existing 12–16px range already used across `.discover-card`/`.hidden-gem-card`/`.category-tile`.
* No icon-only tiles anywhere — every card is either a real photograph or (Golf only) a deliberate gradient treatment with real title + tagline text, never a bare icon.

### A real bug found and fixed during implementation, not shipped broken

The first version had the Golf card's title and tagline (its two text lines, since it has no photo) laid out as side-by-side flex siblings instead of a stacked column, because the card container's `display:flex` with no `flex-direction:column` was inherited by both text spans directly. Screenshotted it, saw the tagline floating oddly instead of stacking under the title, diagnosed it (a single-item vs. two-item flex-row layout quirk that only showed up on the one card with two text lines), fixed it by wrapping every card's text content in a shared `.explore-card-body` (flex-column) container, and re-screenshotted to confirm the fix before moving on.

---

### Imagery/assets added — where they came from and why

No image generation or web-fetch tool was available or appropriate to use mid-task for new licensed photography. Rather than invent images or leave cards without real photography, 5 of the 6 cards reuse real Okanagan venue photography that was **already live on this site's own homepage before the hero redesign** — recovered from this repository's own git history (the commit immediately before the hero redesign, `a29c96a^:okanagan.html`, which still had the original 10-image hero carousel), the same legitimate technique used to source the hero's own photo last session. This is not new sourcing, just reuse of imagery the site itself was already displaying at equal or greater prominence.

Each was screened before use: photos with visible business branding/signage (e.g. a "FRIND" sign, "ROLLINGDALE WINERY" signage) or clearly identifiable people (a bowling-alley photo with several recognizable faces) were rejected, same standard applied to the hero photo choice last session. Final picks, all generic/non-venue-specific in how they're captioned (just "Eat"/"Drink"/etc., no venue name attached):

* **Eat** — a plated lamb/mezze dish (no people, no signage).
* **Drink** — a moody cocktail-bar interior (no people, no signage).
* **Hidden Gems** — a bakery pastry spread (a small "buss" logo is visible on a coffee cup — incidental, not a storefront sign, judged acceptable at the same level as background details already accepted for the hero photo).
* **What's On** — a moody evening restaurant interior, chosen for its "something's happening this evening" ambiance rather than because it depicts a specific event (there is no real per-event static image to draw from for this card — see Known Limitations).
* **Explore** — a vibrant top-down spread of dishes, chosen for its "variety/abundance" read as a generic "explore" image.

All 5 were re-encoded (JPEG quality ~72, and the two largest resized down from 900px to 700px wide) and saved as real files under `public/images/explore/`, served via the new whitelisted route with `Cache-Control: public, max-age=86400` — same caching approach as the hero image, same reasoning: independently cacheable, not embedded in the HTML document. **Total added payload: 472KB across 5 files** — no base64, no inline images, nothing embedded in `okanagan.html` (which this task never touched anyway).

**Golf has no photo** — see Known Limitations below for why, and what it uses instead.

---

### Interaction — what's real vs. what's a graceful fallback

* **Eat** → presses the existing `restaurant` + `cafe` type-chip filters and reveals results, via the identical mechanism the hero's own Eat button already uses.
* **Drink** → presses `winery` + `brewery` + `cocktail` + `pub`, same mechanism.
* **Explore** → reveals the full, unfiltered results grid, same mechanism.
* **Hidden Gems** → a plain `<a href="#hiddenGems">`, the same existing homepage section used by the hero's own Hidden Gems button.
* **Golf** → turned out to have a genuine, already-existing, fully working destination: a real golf category page (confirmed locally at `/kelowna/golf`, HTTP 200), built and tested in an earlier phase of this project (the existing `golf` entries in `CATEGORY_SLUGS`/`CATEGORY_LABELS`/`CATEGORY_TAGLINES`, and a passing test suite already covering golf category pages). Linked directly — nothing was invented. If a live database genuinely had zero golf venues at request time, the card falls back to `#directory` (the wizard) rather than link to a page that would 404, the same graceful-empty-state pattern `renderExploreByCategoryHTML` already uses.
* **What's On** → also turned out to have a genuine, already-existing destination: the homepage's existing `#happeningSoon` section (built from the real `events` table, already rendering 3 upcoming test events locally). Linked directly for the same reason as Golf — a real destination already existed, so nothing needed to be invented.

Both Golf and What's On were flagged in the brief as possibly needing placeholder treatment "if there is no existing underlying destination" — in practice, both already had one, so both got real, working links instead.

---

### Tests and results

`npm test` — **58/58 passing**, both immediately after implementation and again after the Golf-card layout fix. No regressions.

### Visual QA results at all four widths

Screenshotted via the same CDP-driven tool built for the hero QA pass (true viewport widths, not the Chrome CLI's inflated ~500px floor).

* **1440px / 1280px:** Eat/Drink/Hidden Gems clearly read as the strongest destinations (larger, taller, top row); Golf/What's On/Explore clearly secondary. Generous whitespace around and within the grid, consistent card corner radius, restrained hover states, no clutter. "Browse by category" and "Explore the Okanagan" (the pre-existing, untouched modules) render immediately below, unaffected.
* **390px / 375px:** Reflows to 2 columns as designed — Eat/Drink/Hidden Gems each full-width and prominent, Golf+Explore paired, What's On full-width below. Titles fully readable at every card size, no text clipping, comfortable touch-target sizing (even the smallest paired cards are well over 150px wide). Golf's 3-line tagline wraps cleanly.
* **Horizontal overflow — directly measured, not eyeballed:** `document.documentElement.scrollWidth === window.innerWidth` exactly at all four widths (1440/1280/390/375), confirmed via CDP `Runtime.evaluate`, not just visual inspection.
* **Image crops:** all 5 photos crop sensibly at their card's aspect ratio via `object-fit:cover`; no obviously broken or awkward crop at any of the four widths.
* **Console/runtime errors:** checked at all four widths via real CDP `Runtime.exceptionThrown`/`Log.entryAdded` events. Only the same single, pre-existing, already-documented `initBlock12` error appears at every width — no new error introduced by this section.
* **One false alarm caught and ruled out during QA, not reported as a defect:** an early screenshot (scrolled programmatically straight to `#startExploring`) appeared to show a stray "Hidden Gems" pill overlapping the header. Investigated with a full top-to-bottom capture instead of trusting the single scrolled screenshot — confirmed this was purely an artifact of the synthetic scroll-then-capture timing in the test tool (the hero's own, unrelated Hidden Gems quick-action button, briefly caught mid-frame), not a real rendering or z-index bug. No overlap exists in an actual top-to-bottom page render.

### Hero and other sections — confirmed unchanged

* `okanagan.html` and `public/styles/app.css` — zero lines changed (`git diff --stat` shows both absent from the diff entirely).
* Hero headline, image, search field, and quick-action buttons all visually re-verified identical to the previous QA-approved state in every screenshot taken this pass.
* "Happening Soon," "Hidden Gems" (the pre-existing section), "Browse by category," and "Explore the Okanagan" all confirmed rendering exactly as before, in their same positions, via direct screenshot comparison.
* No venue data modified — the only new database call is a read-only `SELECT` for golf-region lookup.

---

### Known limitations

1. **Golf has no dedicated photograph.** None of the recoverable real venue photos (from the pre-hero-redesign carousel) depict a golf course — using a mismatched restaurant/bar photo would have been actively misleading. Used a deliberate, premium-feeling gradient treatment instead (the site's own existing golf brand color pair, `#4E7A5E`/`#345942`, already defined in `TYPE_ACCENT_GRADIENTS` for this exact purpose elsewhere), with the existing, already-approved `CATEGORY_TAGLINES.golf` copy for richness. If real golf photography becomes available, swapping it in is a one-line change (add the `<img>`/`.explore-card-scrim` markup matching the other 5 cards).
2. **"What's On" imagery is a mood photo, not an event photo.** There's no static, non-per-event image representing "things happening" in general — the moody evening-restaurant photo used is a reasonable, honest stand-in, not a claim about any specific event.
3. **Total new photo payload is 472KB across 5 files** — lightweight and independently cacheable, but worth knowing if a future pass wants to further compress or convert to a modern format (WebP/AVIF) — not done here to keep the change minimal and because the existing hero.jpg/og-image.png precedent in this codebase is also plain JPEG.

---

**No production data was touched, no admin endpoint was called, no deployment happened, nothing was merged or committed to `main`.** All changes described above are implemented and committed on `ai-handoff/2026-09-15` only.

### Section 3 — Worth the Roam Candidate Research (2026-09-15)

#### Claude — read-only research only. No code, data, or admin endpoints touched.

* **Status: read-only research only. No application code, venue data, database records, or production data was modified. No admin endpoint was called. No production write occurred — every venue lookup below was a plain `GET` against the site's own public, unauthenticated `/api/venues` endpoint (`https://okanaganroam.com/api/venues?limit=2000`, returned all 1,051 active venues in one request). `main` was never touched.**

---

## The single most important finding first

**Zero of the 1,051 active production venues have any `image_url` value.** Confirmed directly from the live API response, not inferred: `image_url` is present as a schema field on every venue record, and it is `null` on all 1,051 of them. (For context: only 1 of 1,051 even has a non-null `website`.) This means **no venue in the actual data model currently has "existing photo availability"** in the sense the research brief's favor-criterion #1 is asking about — that signal simply doesn't exist anywhere in the live dataset today.

The **only** real, venue-linked photography anywhere in this codebase is the set of 10 photos recovered from this repo's own git history last session (the pre-hero-redesign `okanagan.html`, commit `a29c96a^`) — each one tied to a *specific named venue* by that old carousel's own caption text, not by any database field. Those 10 names were cross-referenced against live production data (table below). **6 of the 10 are already used as photography in Section 1 (hero) or Section 2 (Start Exploring)** — reusing any of them again in Section 3, which sits on the same page, would be visibly repetitive. **3 of the 10 were already ruled out** in earlier sessions for visible business signage and/or clearly identifiable people in the shot. That leaves **exactly one** venue, Turtle Jack's West Kelowna, with real, unused, clean, recoverable photography ready to go.

| Original photo | Matched venue (live) | ID | Status for Section 3 |
|---|---|---|---|
| Elephant Island Winery | Elephant Island Winery | 198 | Used — hero background (Section 1) |
| Theo's Restaurant | Theo's Restaurant | 719 | Used — "Eat" card (Section 2) |
| Perch Sky Lounge | Perch Sky Lounge | 496 | Used — "Drink" card (Section 2) |
| Bliss Bakery and Bistro | Bliss Bakery and Bistro | 82 | Used — "Hidden Gems" card (Section 2) |
| JOEY Kelowna | JOEY Kelowna | 298 | Used — "What's On" card (Section 2) |
| Dawett Fine Indian Cuisine | Dawett Fine Indian Cuisine | 170 | Used — "Explore" card (Section 2) |
| BNA Brewing Kelowna | BNA Brewing Kelowna | 39 | Excluded — photo shows several identifiable people bowling |
| Frind Estate Winery | Frind Estate Winery | 228 | Excluded — prominent "FRIND" signage + identifiable people at tables |
| Rollingdale Winery | Rollingdale Winery | 554 | Excluded — prominent "ROLLINGDALE WINERY" building signage |
| Turtle Jack's West Kelowna | Turtle Jack's West Kelowna | 740 | **Available — unused, no people, no signage** |

**Practical consequence for the design:** if Section 3 is meant to be photo-forward like Sections 1–2, only one of the 12 candidates below can actually ship with real photography today; the rest would need new photo sourcing (out of scope for this research task) before appearing as photo cards. The existing no-photo-needed alternative — the `.hidden-gem-card` "compact band" treatment already used by the current Hidden Gems homepage module (a solid color gradient keyed by venue type + a text label, no image required) — is a real, already-built, ready-today option worth considering for some or all of Section 3's cards. See Implementation Feasibility below.

---

## The 12 candidates

All pulled fresh from the live production API this pass. All are active (`redirect_to: null`), all have complete addresses and coordinates, all confirmed not to be duplicates (checked for exact-name collisions and for any other venue redirecting into them — none found), and none match text patterns suggesting mobile/food-truck/seasonal/closed status (screened description text for "food truck," "mobile," "pop-up," "seasonal," "closed," "cart," "trailer" — none matched). None are chain restaurants (Cactus Club, Earls, Browns Socialhouse, etc. were deliberately excluded from consideration — recognizable nationally, not "distinctly Okanagan," works against the brief's "local character" and "distinctiveness" asks). None overlap with the 6 venues already used in Sections 1–2, or with the existing separate Hidden Gems homepage collection (venue IDs 128, 100, 685, 47, 816, 1038 — checked, zero overlap).

**1. Turtle Jack's West Kelowna** — ID 740
Region/town: West Kelowna. Type: pub. Address: 2569 Dobbin Rd, West Kelowna, BC V4T 2J6 (complete). Phone: none on file. Website: none. Image: **real, unused, recoverable photo available** (see above) — a clean, appetizing ribs/fries plate shot, no people, no signage. Rating: 4.5, 527 reviews. Slug: `turtle-jack-s-west-kelowna`.
Why promising: the only candidate with ready-to-use real photography; solid rating/review signal; family-friendly pub category not otherwise represented.
Data-quality concern: no phone on file.
**Recommendation: YES.**

**2. Miradoro Restaurant** — ID 1029
Oliver. Restaurant (the on-site fine-dining restaurant at Tinhorn Creek Vineyards). Address: 537 Tinhorn Creek Rd, Oliver, BC V0H 1T0 (complete). Phone: +1 250-498-3742. Website: none on file. Image: none. Rating: 4.5, 932 reviews. Slug: `miradoro-restaurant-1029`.
Why promising: genuinely distinctive — a destination restaurant with vineyard views, the strongest "worth driving out for" story in the whole pool; high review count for a South Okanagan pick.
Data-quality concern: none beyond the site-wide absence of image/website data.
**Recommendation: YES.**

**3. Checkmate Artisanal Winery** — ID 824
Oliver. Winery. Address: 4799 Wild Rose St, Oliver, BC V0H 1T1 (complete). Phone: +1 250-707-2299. Website: none. Image: none. Rating: 4.8 (highest of the pool), 341 reviews. Slug: `checkmate-artisanal-winery`.
Why promising: appointment-only, upscale single-varietal focus — exactly the kind of distinctive, less-obvious-to-a-first-timer discovery the brief wants, with the strongest rating in this shortlist.
Data-quality concern: none.
**Recommendation: YES.**

**4. Linden Gardens** — ID 368
Kaleden. Cafe (a working botanical garden with a cafe — goats, bunnies, and chickens on-site per its own description). Address: 351 Linden Ave, Kaleden, BC V0H 1K0 (complete). Phone: +1 250-497-6600. Website: none. Image: none. Rating: 4.7, 257 reviews. Slug: `linden-gardens`.
Why promising: the single most distinctive, personality-rich candidate in the pool — genuinely unlike anything else on this list, and Kaleden is a region with very little other homepage representation (5 active venues total).
Data-quality concern: none.
**Recommendation: YES.**

**5. Intermezzo Restaurant and Wine Cellar** — ID 289
Vernon. Restaurant (fine-dining Italian). Address: 3206 34th Ave, Vernon, BC V1T 7E2 (complete). Phone: +1 250-542-3853. Website: none. Image: none. Rating: 4.8, 1,187 reviews. Slug: `intermezzo-restaurant-and-wine-cellar`.
Why promising: brings the North Okanagan into the mix (nothing else in this shortlist is north of Kelowna); strong review volume backs up the high rating; live Spanish guitar nights and serious gluten-free accommodation give it real character beyond the rating alone.
Data-quality concern: none.
**Recommendation: YES.**

**6. Red Rooster Winery** — ID 863
Naramata. Winery. Address: 891 Naramata Rd, Penticton, BC V2A 8T5 (complete — physically in Naramata, addressed via Penticton). Phone: +1 236-500-0441. Website: none. Image: none. Rating: 4.7, 334 reviews. Slug: `red-rooster-winery`.
Why promising: the Naramata Bench is arguably the single most iconic Okanagan wine-touring stretch, and isn't otherwise represented in this shortlist (Elephant Island, also Naramata, is already used in the hero); well-known, view-driven winery with a genuine "worth the drive" story.
Data-quality concern: none.
**Recommendation: YES.**

**7. Bench Market** — ID 984
Penticton. Cafe (breakfast/brunch/market). Address: 368 Vancouver Ave, Penticton, BC V2A 1A5 (complete). Phone: +1 250-492-2222. Website: none. Image: none. Rating: 4.5, 1,001 reviews. Slug: `bench-market`.
Why promising: very strong review volume for a cafe; dog-friendly terrace and "pitstop for the Naramata bench" framing (per its own description) give it a genuine local-detour story.
Data-quality concern: none.
**Recommendation: MAYBE** — strong data, but reads a little less distinctive than the top 6 above.

**8. Central Kitchen + Bar** — ID 126
Kelowna. Restaurant (gastropub). Address: 1155 Ellis St, Kelowna, BC V1Y 1Z5 (complete). Phone: +1 250-862-8820. Website: none. Image: none. Rating: 4.6, 2,143 reviews. Slug: `central-kitchen-bar`.
Why promising: strongest review count in this shortlist; a genuine "recognizable local favourite" if the final mix wants one confident Kelowna anchor.
Data-quality concern: none.
**Recommendation: MAYBE** — good candidate if the mix needs a Kelowna pick, but Kelowna is already well represented elsewhere on the homepage (Section 2's Eat/Drink/What's On/Explore cards are all Kelowna-based venues).

**9. Granny's Fruit Stand, Bakery, Cafe** — ID 246
Summerland. Cafe. Address: 13810 BC-97, Summerland, BC V0H 1Z1 (complete). Phone: +1 250-494-7374. Website: none. Image: none. Rating: 4.6, 570 reviews. Slug: `granny-s-fruit-stand-bakery-cafe`.
Why promising: genuine roadside-stand local character, "natural stop for anyone touring the wine trail" per its own description — good geographic filler for Summerland, otherwise unrepresented.
Data-quality concern: none.
**Recommendation: MAYBE.**

**10. Ok Falls Hotel Bar & Grill** — ID 455
Okanagan Falls. Pub. Address: 1045 Main St, Okanagan Falls, BC V0H 1R2 (complete). Phone: +1 778-515-0500. Website: none. Image: none. Rating: 4.5, 286 reviews. Slug: `ok-falls-hotel-bar-grill`.
Why promising: small-town pub right off the KVR rail trail; good geographic filler for Okanagan Falls, otherwise unrepresented; lowest review count in the shortlist but still comfortably above the 200-review filter used to build this pool.
Data-quality concern: review count is the thinnest of the 12, though still solid in absolute terms.
**Recommendation: MAYBE.**

**11. Chutney Cuisine of India** — ID 143
Kelowna. Restaurant. Address: 3011 Pandosy St, Kelowna, BC V1Y 1W3 (complete). Phone: +1 250-762-9300. Website: none. Image: none. Rating: 4.6, 1,965 reviews. Slug: `chutney-cuisine-of-india`.
Why promising: adds cuisine diversity the rest of the shortlist lacks; very strong review volume.
Data-quality concern: a second Kelowna pick alongside Central Kitchen — only include both if the final mix can afford two Kelowna cards.
**Recommendation: MAYBE.**

**12. Wooden Nickel Cafe** — ID 790
Lake Country. Cafe. Address: 10051 BC-97, Lake Country, BC (no postal code on file — a minor completeness gap, everything else present). Phone: +1 250-766-0777. Website: none. Image: none. Rating: 4.5, 469 reviews. Slug: `wooden-nickel-cafe`.
Why promising: brings Lake Country into the mix, otherwise unrepresented; honest, unpretentious "no-frills breakfast stop" character.
Data-quality concern: address is missing a postal code (everything else complete).
**Recommendation: MAYBE.**

---

## Ranked recommendation

If asked to narrow straight to 4–6, in priority order:

1. **Turtle Jack's West Kelowna** — the only one with real, ready photography today; strong practical argument to include regardless of ranking on other merits.
2. **Miradoro Restaurant** (Oliver) — the strongest "worth the drive" story in the pool.
3. **Checkmate Artisanal Winery** (Oliver) — highest rating, genuinely distinctive.
4. **Linden Gardens** (Kaleden) — the most distinctive, personality-driven pick; best answer to "gives the homepage personality."
5. **Intermezzo Restaurant and Wine Cellar** (Vernon) — the only North Okanagan representation, strong data.
6. **Red Rooster Winery** (Naramata) — anchors the Naramata Bench, the Okanagan's most iconic wine-touring stretch.

Bench Market, Central Kitchen + Bar, Granny's Fruit Stand, Ok Falls Hotel Bar & Grill, Chutney Cuisine of India, and Wooden Nickel Cafe (candidates 7–12) are all genuinely solid backups if the above 6 need swapping for photo availability, regional balance, or category balance once the design is finalized.

**Category balance across the 12:** 2 wineries, 4 restaurants, 4 cafes, 2 pubs — no type dominates.
**Geographic spread across the 12:** West Kelowna, Oliver (×2), Naramata, Kaleden, Vernon, Penticton, Kelowna (×2), Summerland, Okanagan Falls, Lake Country — 10 distinct regions, deliberately favoring places *outside* Kelowna, since Kelowna is already heavily represented by Section 2's cards and the "worth the drive" framing implies getting out of the main hub.

---

## Implementation feasibility

Read `server.js`'s current Section 1 (hero) and Section 2 (Start Exploring) implementation and the `db.js` schema to assess this. Nothing below was implemented or changed.

**Where Section 3 should insert:** the same injection point Section 2 already uses. `server.js`'s homepage route currently does `</section>\n${startExploring}\n${exploreByCategory}\n${exploreRegions}\n\n<section class="weather-banner"...` at the existing `heroToWeatherAnchor` replace. Section 3 would slot into that exact same template string, either right after `startExploring` (so the reading order is Hero → Start Exploring → Worth the Roam → Browse by category → Explore the Okanagan) or wherever else this same string is edited to place it — a small, well-understood, already-twice-used pattern, not a new mechanism.

**What can be reused:**
* **Markup/CSS:** two ready-made card patterns already exist and both fit the "editorial/premium" brief:
  * `.explore-card` / `.explore-grid` (built for Section 2) — full-bleed photo, gradient scrim, single title, restrained hover lift. Needs a real photo per card; today only 1 of 12 candidates has one.
  * `.hidden-gem-card` (already live in production, used by the existing Hidden Gems homepage module) — a solid color-gradient "compact band" keyed by venue type plus a title/meta/blurb body, **no photo required**. This is real, in production, and available today for all 12 candidates regardless of photo availability.
* **Data mechanism:** the `collections` / `collection_items` tables (added in `db.js`, "Phase 2 Sprint 3") are a general-purpose editorial-curation mechanism, explicitly designed for exactly this reuse — the schema's own code comment says so verbatim: *"future kinds, e.g. a future Roam Picks collection, can reuse this same table without a schema change."* A "Worth the Roam" collection would be a new `kind` value plus a small idempotent seed list of `{position, venue_id, note}` rows, following the exact pattern the existing `HIDDEN_GEMS_MEMBERS` array + seeding block in `db.js` already establishes — additive, no schema migration, no new table.
* **Image serving:** if any candidate does get a real photo (starting with Turtle Jack's, or new photography later), the existing whitelisted-filename route pattern (`/images/hero.jpg`, `/images/explore/*.jpg`) is directly reusable for a `/images/worth-the-roam/*.jpg` equivalent — same `fs.readFileSync` + `Cache-Control` pattern, no new serving mechanism needed.
* **API completeness:** `/api/venues` already returns every field a card would need — name, region, type, address, phone, rating, reviews, price, slug, coordinates, description — except a short editorial "why this place" blurb, which the existing codebase already solves twice over without new schema: either the `collection_items.note` column (unused for display today, but present) or a `server.js`-side constant dictionary keyed by slug, exactly matching the already-live `HIDDEN_GEM_HOMEPAGE_BLURBS` pattern.

**What would genuinely be new / a real blocker:**
1. **Photography for 11 of the 12 candidates.** This is the one real gap — no amount of code reuse solves it. A decision is needed on whether Section 3 ships photo-forward (blocked on new photo sourcing, which is out of scope here) or uses the no-photo `.hidden-gem-card` treatment (available today).
2. **Editorial copy.** The brief is explicit that descriptions must not be invented from rating alone — a short, honest, human-written blurb per selected venue (matching the existing `HIDDEN_GEM_HOMEPAGE_BLURBS`/`collection_items.note` precedent, one sentence grounded in what's already in that venue's own `description` field, not a new claim) would need to be written once the final 4–6 are chosen. Not something this research pass invents.
3. **A new `collections` row + seed list**, and a new `renderWorthTheRoamHTML()`-style function plus one new line wiring it into the existing anchor replace — small, additive, precedented, but still real implementation work for a later task, not done here.

---

**No application code, venue data, database records, production data, or admin endpoints were touched. No production write occurred at any point — this entire pass was public, unauthenticated `GET` requests against `/api/venues` and local, read-only inspection of `server.js`/`db.js`. `main` was never touched.**

**Commit SHA for this research update: `f066388af5d202eb3dce73b5f16cc4b3066e73c2`** (verified: `main`'s SHA is unchanged at `9373c28121c3bfbfad95d0ada496974392da9610`, both locally and on `origin/main`, before and after this commit).
