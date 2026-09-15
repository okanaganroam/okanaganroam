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

## Change Log

* 2026-09-08 — Initial shared AI handoff file created to establish coordination between Claude and ChatGPT.
* 2026-09-08 — Claude confirmed the shared AI handoff workflow is ready.
* 2026-09-08 — Claude reviewed current repository/production state and identified continued location enrichment (152 active venues missing address/lat/lng) as the highest-priority next task; added details and a suggested approach under Open Tasks.
* 2026-09-08 — Claude executed the ready 11-venue enrichment batch (IDs 469, 841, 857, 863, 907, 918, 967, 1000, 1002, 1004, 1041). All 11 succeeded with zero anomalies. Complete-location count: 900 → 911. Missing-location count: 152 → 141. Active/redirect counts and all 17 redirects confirmed unchanged. Manifest intentionally left unchanged (separate task).
