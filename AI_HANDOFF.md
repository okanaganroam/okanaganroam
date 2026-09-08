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
* Shared AI handoff file established: September 8, 2026
* Recent work includes venue enrichment, guarded corrections, duplicate/redirect infrastructure, and enrichment audit tables.
* Known baseline: 1,069 total venues, 1,052 active, 17 redirects, 911 complete, 141 missing.

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
### ChatGPT

* Review the latest commits and repository state before proposing or making changes.
* Use this file to leave concise coordination notes when a task crosses between assistants.
* Do not overwrite Claude's work; inspect the current GitHub state first.
* Current GitHub integration status: ChatGPT can inspect the repository but its write attempts currently return HTTP 403 (`Resource not accessible by integration`).

## Open Tasks

* **Task: Continue HIGH-confidence location enrichment for the remaining 141 active venues missing address/latitude/longitude.**

* **Why highest priority:** Location data completeness remains the largest remaining gap in the dataset — 141 of 1,052 active venues (13%) still lack address/lat/lng. The previously-identified ready batch of 11 has now been completed successfully (see Change Log and Claude's note above).
* **Current evidence:** 911 of 1,052 active venues (87%) now have complete address+lat+lng. 141 remain missing. Of the original 41 HIGH-confidence candidates identified in the first research pass, all clean ones have now been enriched (12 in the first batch, 11 in this batch); a further ~18 unresearched HIGH-confidence candidates from that original list remain, plus roughly 102 MEDIUM-confidence and 24 LOW-confidence candidates from the full 152/167-record inventory documented in this session. ID 185 (Dosa Crepe Cafe) remains flagged separately: its stored phone belongs to the Rutland (Kelowna) branch of a multi-location chain, not the Osoyoos location the record represents — it needs a combined phone correction + enrichment, not enrichment alone.
* **Suggested next phase:** Research the remaining unresearched HIGH-confidence candidates from the original 41-item list, then proceed to the MEDIUM-confidence tier (weaker identity anchors — no phone, or a documented phone/identity conflict requiring reconciliation) using the same conservative process: fresh identity verification immediately before every write, exact phone match preferred, exclusion of any mobile/closed/ambiguous business, individual post-write verification, and full collateral/redirect/sitemap reconciliation after each batch. A separate manifest-refresh pass should also be scheduled to bring the manifest's recorded totals back in sync with live production state, since several enrichment batches have now been completed since the manifest was last refreshed.

## Change Log

* 2026-09-08 — Initial shared AI handoff file created to establish coordination between Claude and ChatGPT.
* 2026-09-08 — Claude confirmed the shared AI handoff workflow is ready.
* 2026-09-08 — Claude reviewed current repository/production state and identified continued location enrichment (152 active venues missing address/lat/lng) as the highest-priority next task; added details and a suggested approach under Open Tasks.
* 2026-09-08 — Claude executed the ready 11-venue enrichment batch (IDs 469, 841, 857, 863, 907, 918, 967, 1000, 1002, 1004, 1041). All 11 succeeded with zero anomalies. Complete-location count: 900 → 911. Missing-location count: 152 → 141. Active/redirect counts and all 17 redirects confirmed unchanged. Manifest intentionally left unchanged (separate task).
