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
* Known baseline: 1,069 total venues, 1,052 active, 17 redirects, 900 complete, 152 missing.

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
### ChatGPT

* Review the latest commits and repository state before proposing or making changes.
* Use this file to leave concise coordination notes when a task crosses between assistants.
* Do not overwrite Claude's work; inspect the current GitHub state first.
* Current GitHub integration status: ChatGPT can inspect the repository but its write attempts currently return HTTP 403 (`Resource not accessible by integration`).

## Open Tasks

* **Task: Continue HIGH-confidence location enrichment for the remaining 152 active venues missing address/latitude/longitude.**

  * **Why highest priority:** Location data completeness is the single largest remaining gap in the dataset — 152 of 1,052 active venues (14%) still lack address/lat/lng, directly limiting map-based discovery, "near me" functionality, and any future geographic features. Every other major workstream this session (duplicate resolution, region/type corrections, AI handoff setup) is now either complete or in a stable holding state; this is the one item with a large, well-defined, and already partially-executed backlog.
  * **Current evidence:** 900 of 1,052 active venues (86%) have complete address+lat+lng. 152 remain missing. A rigorous batch of 12 was just completed with zero anomalies (verified via exact phone-match identity confirmation, individual post-write verification, and full sitemap/collateral reconciliation). A further vetted batch of 11 HIGH-confidence candidates (IDs: 469, 841, 857, 863, 907, 918, 967, 1000, 1002, 1004, 1041) has already been researched and is ready for enrichment pending explicit authorization. Several venues were correctly excluded from the ready pool for specific documented reasons: phone mismatches (328, 360, 511), confirmed mobile/food-truck businesses (453), a confirmed permanently-closed business (987), and one multi-location chain phone/address mismatch requiring a combined correction (ID 185 — Dosa Crepe Cafe, stored phone belongs to the Rutland branch, not the Osoyoos location the record represents).
  * **Suggested next phase:** Execute the ready 11-venue batch using the established process (fresh preflight → phone-verified Google identity match → guarded `/admin/enrich-venue` write, address/lat/lng only → individual readback verification → full collateral/redirect/sitemap reconciliation → manifest update), then continue researching the remaining ~141 unresearched missing-location venues in further small batches of 10-15, applying the same conservative exclusion criteria (no phone match ambiguity, no mobile businesses, no permanently-closed businesses, no unresolved duplicate-risk pairs).


## Change Log

* 2026-09-08 — Initial shared AI handoff file created to establish coordination between Claude and ChatGPT.
* 2026-09-08 — Claude confirmed the shared AI handoff workflow is ready.
* 2026-09-08 — Claude reviewed current repository/production state and identified continued location enrichment (152 active venues missing address/lat/lng) as the highest-priority next task; added details and a suggested approach under Open Tasks.
