# Big White Layout Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish the approved compact mobile and desktop Big White layout.
**Architecture:** Add a dedicated, pure Big White renderer called only from renderRegionPage for big-white. Reuse the production shell and date-aware ski data. Isolate all page CSS and translate new copy through the existing French dictionary loader.
**Tech Stack:** Node 24, server-rendered HTML/CSS, native details, existing GET search and planner.
**Spec:** docs/superpowers/specs/2026-11-04-big-white-layout-design.md

## Global Constraints
- Only Big White changes; no database or shared asset modifications.
- Search submits real q and regions=big-white parameters; count comes from current data.
- Status follows skiSeasonState and disappears after endBy.
- Keep canonical metadata, French support, keyboard access and responsive overflow behavior.

## Review Focus
- Empty search still opens Big White results.
- Missing/redirected featured venues do not produce stale cards.
- Long French labels fit mobile.
- Expired season does not retain an opening announcement.
- Other destination pages remain identical.

### Task 1: Render, integrate, validate and publish
**Files:** big-white-page.js; server.js; data/french/big-white-layout-2026-11-04.json; tests/big-white-page.test.js; AI_HANDOFF.md.
- [ ] Write pure-renderer tests for real scoped search, dynamic count/status, missing featured venues, six categories and collapsed planning.
- [ ] Run tests and observe failure before implementing.
- [ ] Implement the approved layout, scoped CSS and French strings; integrate only the big-white branch.
- [ ] Run focused tests, syntax checks and appropriate existing regression tests on an isolated database.
- [ ] Inspect 1440px and 390px local pages, search and accordions; compare another destination with baseline.
- [ ] Review diff, commit and push/merge through GitHub's production workflow, already authorized by the owner.
- [ ] Verify live English and French pages, mobile/desktop rendering and health; record evidence in handoff.
