# Okanagan Roam — Homepage Redesign Implementation Plan

**Status:** Planning document only. No application code, database, schema,
Railway, or production changes are included in this commit.

**Baseline:** `main` @ `9373c28121c3bfbfad95d0ada496974392da9610`

**Prerequisite reading:** `docs/HOMEPAGE_ARCHITECTURE_SPEC.md` (branch
`review/homepage-architecture-spec`, commit `d9f64867bc8683ac84af3b216408237f2a96d6a4`)
contains the full architecture audit this plan implements. This document is
the execution plan for that already-approved spec, with all six open
decisions now resolved as stated in the product direction above.

This document itself proposes no new decisions — it translates the approved
architecture into concrete files, functions, and an implementation
sequence.

---

## 1. Exact files expected to change

| File | Nature of change |
|---|---|
| `okanagan.html` | Hero section markup replaced; new mood-cards, Build-Your-Trip CTA section markup added (as splice targets or static placeholders, matching the existing pattern where some sections are static in the file and some are injected — see §4); Spotlight/Featured Venues `<section>` markup removed; Weather banner markup repositioned/re-styled in place |
| `server.js` | New render functions added; anchor-splice block updated (new anchors, new injection order); new `/images/*` route added alongside `STATIC_ASSETS`; no changes to any `render{Region,Category,Venue,Guide,Event}Page` function |
| `public/scripts/app.js` | `applyOpenStatusToHeroAndFeatured` split/trimmed (Featured-card half removed once Featured Venues retires; hero half updated to match new hero markup, which likely has no per-scene venue binding at all — see §7); no changes to the trip-planner IIFE, map init, or wizard/filter logic |
| `public/styles/app.css` | Weather banner de-emphasis styling; any hero/mood-card/trip-CTA styling not already covered by the server-injected discovery styles (see §6) |
| `public/images/` (new directory) | New static image files — this directory does not exist on `main` today and must be created as part of implementation |
| No changes | `db.js` (no schema/table changes), any `/api/*` route, `renderRegionPage`, `renderCategoryPage`, `renderVenuePage`, `renderGuidePage`, `renderEventPage`, sitemap/robots/IndexNow logic, `public/styles/tokens.css` (reused as-is) |

---

## 2. Exact existing functions/infrastructure to reuse

- `renderHiddenGemsHomepageHTML()` (`server.js`) — query and data source reused unchanged; only the returned HTML's card markup/copy changes (see §3)
- `renderExploreRegionsHTML()` (`server.js`) — `REGION_LABELS`/curated region list reused; card markup upgraded to large photo-led format
- `renderExploreByCategoryHTML()` (`server.js`) — its aggregate query (`bestRegionForType` per category) and `CATEGORY_SLUGS`/`CATEGORY_LABELS`/`CATEGORY_TAGLINES` are reused as the data source for mood-card category links; the function's own tile-grid HTML output is not reused as-is (mood cards replace it visually)
- `renderHappeningSoonHTML()` (`server.js`) — reused unchanged; linked from the "What's On" mood card
- `renderHomepageDiscoveryStyles()` (`server.js`) — extended, not replaced; new mood-card/hero/trip-CTA CSS added to this same function (or a small sibling function following the identical pattern) rather than moved into `app.css`, matching the codebase's existing convention of homepage-specific CSS living server-side
- `STATIC_ASSETS` block (`server.js`) — pattern reused (not the object itself) for the new `/images/*` route
- Leaflet map init (`app.js`, `L.map('okMap')`) — reused unchanged, entered from the new Build-Your-Trip CTA section instead of only the wizard's map toggle
- Trip-planner IIFE (`app.js`, keyed on `#tripTray`/`#tripTrayToggle`/`#tripTrayPanel`) — reused entirely unchanged; it is a self-contained widget independent of homepage section order, so the new CTA section only needs to open/scroll to the existing tray, not reimplement anything
- `REGION_LABELS`, `VALID_REGIONS`, `CATEGORY_SLUGS`, `CATEGORY_LABELS`, `CATEGORY_TAGLINES`, `REGION_TAGLINES`, `TYPE_ACCENT_GRADIENTS` constants — reused as-is, no new taxonomy
- `collections`/`collection_items` tables (kind `hidden_gem`) — reused as-is, no schema change
- `events` table — reused as-is via `renderHappeningSoonHTML()`
- Existing wizard/filter-bar (`#directory`) and results grid — reused entirely unchanged, only repositioned lower in the page

---

## 3. New functions that need to be created

All in `server.js`, following the existing plain-function, template-literal-return convention (no new dependencies, no templating engine):

- `renderHeroHTML()` — large scenic hero markup + search box. **REQUIRED.**
- `renderMoodCardsHTML()` — the 6-card "What are you in the mood for?" grid, two visual tiers. Pulls category best-region/link data via the same query logic already in `renderExploreByCategoryHTML()` (either by calling a small shared helper extracted from it, or by duplicating the single aggregate query — duplicating is acceptable here since the query is cheap and this keeps the two functions independently readable; extracting a shared helper is the cleaner option and is **RECOMMENDED** over duplication). **REQUIRED.**
- `renderHiddenGemsHomepageHTML()` — **modified, not new**: same query, new editorial card markup (short curatorial sentence per venue, de-emphasized metadata). **REQUIRED.**
- `renderExploreRegionsHTML()` — **modified, not new**: same data, larger photo-led card markup, one image per destination. **REQUIRED.**
- `renderBuildTripCTAHTML()` — large immersive CTA section, links/scrolls into the existing trip tray and map toggle. **REQUIRED.**
- A small image-serving handler inline in the routing block (not necessarily a named top-level function, but should be a clearly isolated block adjacent to `STATIC_ASSETS`, e.g. `serveHomepageImage(pathname, res)` or an inline `if` block matching the existing route-handling style). **REQUIRED.**

Not required: no new function is needed for the Weather banner (existing markup/JS stays, only its position and CSS treatment change) or for Spotlight/Featured retirement (pure removal, not a new function).

---

## 4. Exact homepage assembly/reordering strategy

`main`'s current splice logic (in the `/`/`/okanagan.html` GET handler) is:

```js
const wizardToHeroAnchor = '</section>\n\n<section class="hero">';
// injects: discoveryStyles, happeningSoon, hiddenGemsSection  →  before hero

const heroToWeatherAnchor = '</section>\n\n<section class="weather-banner" id="weatherBanner"';
// injects: exploreByCategory, exploreRegions  →  before weather banner
```

**REQUIRED — new strategy**, keeping the same anchor-splice technique (no framework change, per constraints):

1. `okanagan.html` is physically reordered so the **hero markup itself moves to the top** of the main content (immediately after `<header id="top">`), replacing the wizard as the first section a visitor sees. This mirrors the physical-reorder approach already used once before in this codebase's history for a prior hero move — a proven, low-risk technique here.
2. The wizard/filter-bar (`#directory`) section is physically moved later in the static file, to just above the results grid.
3. New anchors:
   - `headerToHeroAnchor` (`</header>\n\n<section class="hero">` or equivalent, verified against the actual file at implementation time) — hero is static in the file at this position, not injected, since it's always present.
   - `heroToDirectoryAnchor` (the new position where the wizard now sits) — inject `discoveryStyles`, `moodCards`, `hiddenGemsSection`, `exploreRegions`, `buildTripCTA` here, in that exact order, before the wizard section.
   - A later anchor (e.g. before `<section class="results">` or wherever the wizard/results boundary is) — Happening Soon (still rendered, just now reached later in the page, per the "existing deeper directory" tier) can be injected near Weather, or immediately before results; exact position decided at implementation time within the "lower in the page" constraint already approved.
4. Weather banner markup stays in `okanagan.html` as static HTML (as it is today) but is **physically moved lower** (past the wizard/results boundary) and gets a new CSS class/modifier for the de-emphasized visual treatment — no JS change needed since its population logic (`weatherBannerBtn`, `#weatherIcon`, etc.) is ID-based, not position-based.
5. Spotlight banner and Featured Venues `<section>` blocks are **deleted** from `okanagan.html` entirely (module retirement — underlying `venues`/`collections` data is untouched; only this static HTML and its two splice-irrelevant sections go).
6. `renderGuideFooterHTML()`, `renderOpenNowScript()`, `renderHiddenElementsScript()` injections at `</body>` are **unchanged**.

This keeps the same request-time, string-anchor-replace architecture — just with different anchor strings and a different static-file section order, exactly as the approved spec calls for retaining (not replacing) this mechanism.

---

## 5. Image asset strategy and approximate image count/types

**REQUIRED** — new `public/images/` directory (does not exist on `main`) with subfolders mirroring the existing convention seen on other branches (`public/images/`, `public/images/explore/` or similar), served via the new `/images/*` route (§ below).

Approximate image count:

| Section | Images | Notes |
|---|---|---|
| Hero | 1 | Large cinematic AI-generated scenic Okanagan image |
| Mood cards — primary (Eat, Drink, Hidden Gems) | 3 | Strongest visual treatment |
| Mood cards — secondary (Golf, What's On, Explore) | 3 (**RECOMMENDED**) or fewer if a lighter/no-photo secondary-row treatment is preferred (**OPTIONAL** variant — flagged for a design call at implementation time, not a re-open of an approved decision, just a styling detail) | Secondary visual weight |
| Explore the Okanagan | One per destination card. The approved curated region list currently has up to 8 entries (`renderExploreRegionsHTML`'s `curated` array); **REQUIRED**: at minimum the number of cards actually shown (design may reduce the curated set for a "major visual section" — count TBD at implementation time, budget for 4–8) | One AI image per destination, destination-inspired, not fake photography of a specific business |
| Build Your Trip CTA | 1 | Large immersive background image |

**Total estimate: roughly 12–16 new image files**, all AI-generated per the approved visual direction, served as real files (not base64), with meaningful `alt` text per the existing accessibility pattern.

**Image route (REQUIRED):**
- New route, e.g. `/images/*`, added in `server.js` immediately alongside the existing `STATIC_ASSETS` block, following that block's pattern (`fs.existsSync` check, `Cache-Control: public, max-age=86400` or longer since these are static/immutable content-addressed-in-spirit assets, correct `Content-Type` per extension).
- **Path-traversal safety (REQUIRED):** resolve the requested path against a fixed base directory (`path.join(__dirname, 'public/images')`), reject any resolved path that does not start with that base directory (guards against `../` traversal), and only serve a small allowlisted set of extensions (`.jpg`, `.jpeg`, `.png`, `.webp`) — mirroring the safety comment pattern already used elsewhere in this codebase for file-path handling (e.g. the existing "no new API routes" and allowlist-style comments seen in `server.js`).

---

## 6. CSS/layout strategy for desktop and mobile

**REQUIRED:**
- Reuse the existing `discover-section`/`wrap`/`discover-heading`/`eyebrow` container pattern for every new section (hero excepted, which needs its own full-bleed treatment) — visual consistency with sections already on `main`.
- Reuse existing breakpoints already present in `app.css`: `@media (min-width: 900px)` and `@media (max-width: 640px)` as the primary desktop/mobile split points, rather than introducing new breakpoint values.
- Mood cards: CSS grid with explicit column/row spans giving Eat/Drink/Hidden Gems roughly double the visual footprint of Golf/What's On/Explore on desktop (≥900px); single-column stack on mobile (≤640px), primary cards still visually first in DOM order for both SEO and natural mobile reading order.
- Explore the Okanagan: large-format card grid, 2-up (desktop) → 1-up (mobile), consistent with `region-tile-grid`'s existing reflow behavior.
- Build Your Trip CTA: full-width single section, image as CSS background or `<img>` with overlay, one prominent button; no grid complexity needed.
- Weather banner: **RECOMMENDED** — shrink its visual footprint (smaller padding/font-size, muted color treatment) via a new modifier class rather than restructuring its markup, since its ID-based JS population must keep working unchanged.

**OPTIONAL/FUTURE:** a shared CSS custom-property scale for section vertical spacing (currently spacing is likely ad hoc per section) — a nice-to-have consistency pass, not required for this redesign to ship.

---

## 7. JavaScript changes required

**REQUIRED:**
- `applyOpenStatusToHeroAndFeatured` (`app.js`) — must be updated because it directly queries `.hero-scene[data-venue-name]` and `.featured-card[data-name]`, both of which are removed/replaced:
  - The `.featured-card` half is deleted entirely once Featured Venues retires.
  - The `.hero-scene` half is deleted or reworked depending on whether the new hero has any per-venue dynamic binding at all (the approved hero is a single scenic image, not a per-venue carousel, so the simplest and **RECOMMENDED** path is to delete the hero-scene half too, and rename the function to reflect its now-narrower scope, e.g. keep it a no-op-safe function or remove the call site in `loadVenuesAndInit()` if nothing remains for it to do).
- Hero carousel navigation JS (`heroPrev`/`heroNext`, `.hero-scene` click handling) — **REQUIRED**: removed, since the new hero is a single static image with no carousel.

**NOT REQUIRED (reused unchanged):**
- Trip-planner IIFE — no changes.
- Leaflet map init/toggle — no changes.
- Wizard/filter logic — no changes.
- Weather banner population logic (`weatherBannerBtn` etc.) — no changes, ID-based and position-independent.

**RECOMMENDED:** add one small, narrowly-scoped click handler for the new Build-Your-Trip CTA button that opens the existing `#tripTrayPanel` (e.g. by dispatching the same click the `#tripTrayToggle` button already handles) and/or scrolls to the map toggle — a few lines, not new planning logic, consistent with the "no new itinerary backend" constraint.

---

## 8. SEO / accessibility / performance considerations

**REQUIRED:**
- Zero changes to `renderRegionPage`, `renderCategoryPage`, `renderVenuePage`, `renderGuidePage`, `renderEventPage`, sitemap generation, robots.txt, or IndexNow logic — these are rendered by functions entirely outside the homepage splice path and must be explicitly verified untouched (diff-check at implementation time) before considering any step complete.
- Every new image gets meaningful `alt` text (not `alt=""`) since these are now content-bearing hero/destination images, not decorative ones — a change from the current hero carousel's `aria-hidden`/decorative pattern, since the new hero image is core content, not chrome.
- Serve new images as real files with `Cache-Control` headers — directly reduces `okanagan.html`'s current ~1.05MB payload (base64-driven) rather than adding to it.
- Preserve the existing `lang`/`data-i18n` attribute system for all new section copy (English/French), consistent with how every other homepage section already works — new render functions should accept/emit the same i18n hook pattern rather than hardcoding English strings if the rest of the homepage is bilingual (verify the current EN/FR scope of homepage discovery sections specifically at implementation time, since some newer discovery sections may only be partially localized already — flagged as a check, not a known gap).

**RECOMMENDED:**
- Add `width`/`height` attributes on all new `<img>` tags (existing convention, e.g. `width="679" height="452"` on the current hero image) to avoid layout shift.
- Use `loading="lazy"` on below-the-fold images (mood cards, Explore cards, trip CTA) and `fetchpriority="high"` only on the hero image, matching the existing pattern already used elsewhere on the page (`explore-card-img ... loading="lazy"`, hero `fetchpriority="high"`).

**OPTIONAL/FUTURE:** responsive `srcset`/multiple image sizes per asset — not required for initial ship, flagged as a future performance enhancement.

---

## 9. Testing strategy

**REQUIRED:**
- Run the existing test suite (`npm test`, currently 58/58 passing on `main`) after every implementation step in §12 — any homepage-rendering change must not regress the existing HTTP-route tests, region/category/venue page tests, or event tests.
- Add new tests for the new render functions following the existing test file's conventions (likely the same file that already tests `renderHiddenGemsHomepageHTML`-style functions): verify `renderHeroHTML()`, `renderMoodCardsHTML()`, `renderBuildTripCTAHTML()` each return non-empty, well-formed HTML; verify the modified `renderHiddenGemsHomepageHTML()`/`renderExploreRegionsHTML()` still gracefully return `''` when their underlying data is empty (preserving the existing graceful-empty-state pattern used throughout this codebase).
- Add a test (or extend the existing HTTP-routes test) asserting the homepage response still contains exactly the expected `<section>` markers in the new order, and does **not** contain `spotlight-banner` or `featured-venues` markup.
- Add a test for the new `/images/*` route: valid file → 200 with correct `Content-Type`/`Cache-Control`; missing file → 404; path-traversal attempt (e.g. `/images/../server.js` or URL-encoded equivalents) → rejected, not served.

**RECOMMENDED:**
- A regression test asserting region/category/venue page output is byte-identical (or at least structurally unchanged in the relevant fields) before/after this work, as an explicit SEO-safety check beyond just "the function wasn't touched."

---

## 10. Visual QA strategy at 1440, 1280, 390, 375 widths

**REQUIRED**, using the same CDP-based headless-screenshot approach already used successfully earlier in this project (avoids the known Chrome CLI `--screenshot` viewport-width bug):

1. Screenshot the full homepage at each of 1440, 1280, 390, and 375 px widths, after each major implementation step (§12), not just at the end.
2. At each width, verify: hero renders full-bleed with legible search box; mood-card grid shows the correct 2-tier hierarchy (not 6 identical buttons) and reflows to single-column by 390/375; Explore-the-Okanagan cards reflow correctly; Build-Your-Trip CTA remains legible/full-width; Weather banner is visually subordinate, not competing with the section above/below it; wizard/results still function correctly in their new lower position.
3. Console-error check at each width (same CDP tooling) — zero new JS errors, specifically verifying the trimmed `applyOpenStatusToHeroAndFeatured` doesn't throw on the new markup.
4. Confirm no horizontal scroll/overflow at 375px (the narrowest approved width).

**RECOMMENDED:** repeat the same QA pass once against a production-like full dataset (not just the small local dev DB, which currently has very few venues) to verify mood-card/Explore-card links resolve to real, populated category/region pages.

---

## 11. Risks and rollback considerations

**Risks (carried forward from the approved spec, restated with implementation-specific detail):**
- `applyOpenStatusToHeroAndFeatured` is the single highest-coupling risk — get its trim wrong and either the hero or nothing throws a silent JS error that's easy to miss without the console-error QA step in §10.
- Physically reordering `okanagan.html` (hero to top, wizard lower) is a bigger structural edit than the previous incremental architecture cleanup this codebase already did once — **RECOMMENDED**: do this as its own isolated, easily-diffable step (§12 step 3), not bundled with new-section additions, so a bad reorder is trivially revertable independent of new content.
- Nav bar anchors (`#directory`, `#list-venue`, `#app`, `#top`) must keep resolving to the right sections after reorder — explicit check required, not just visual QA (an anchor can visually "look fine" while being attached to the wrong element if IDs get duplicated or dropped during the HTML edit).
- New `/images/*` route is new attack surface (however small) — the path-traversal allowlist approach in §5 is required, not optional, before this route ships.
- Image weight — 12–16 new large cinematic images, even reasonably compressed, could meaningfully increase page weight if not sized/compressed deliberately; **RECOMMENDED**: set an explicit target (e.g. each hero/destination image ≤300KB) before generating final assets.

**Rollback:**
- Because every step in §12 is its own small commit on an isolated feature branch (never `main` until explicitly approved for merge), rollback at any point is `git revert` of the specific step's commit, or simply not merging the branch at all.
- Because the retirement of Spotlight/Featured Venues removes only template markup and JS/CSS, not data, re-enabling either section later (if ever needed) requires no data recovery — only restoring the deleted markup/function calls from git history.
- The anchor-splice mechanism itself means a bad new-section render function fails safe: per the existing convention (`if (!tiles) return '';` etc.), a broken data path should degrade to an empty section, not a crashed page — new functions should follow this same defensive pattern.

---

## 12. Recommended implementation sequence (small, independently verifiable steps)

Each step: its own commit, tests run (`npm test`), visual QA at the four widths where the step has any visual surface, console-error check. All work happens on a feature branch off `main`, never on `main` directly, never deployed until explicit approval (matching the process already used for the prior homepage work this session).

1. **REQUIRED** — Add the `/images/*` route (path-traversal-safe, correct headers) with a couple of placeholder test images. No visual change to the homepage yet — purely infrastructure, easiest to verify in isolation (route tests only).
2. **REQUIRED** — Generate/place the hero image; replace the hero carousel markup with the new scenic-hero + search markup; remove hero-carousel JS (`heroPrev`/`heroNext`/`.hero-scene` handling); trim the hero half of `applyOpenStatusToHeroAndFeatured`. Verify: tests pass, hero renders correctly at all 4 widths, no console errors.
3. **REQUIRED** — Physically reorder `okanagan.html` (hero to top, wizard lower) and update the anchor-splice strings in `server.js` accordingly, with no new sections yet — just the reorder of what already exists. This isolates the highest-structural-risk change (§11) from any new-content risk. Verify: nav anchors still resolve correctly, existing sections all still render in their intended new relative order, tests pass.
4. **REQUIRED** — Add `renderMoodCardsHTML()` + its images + CSS; wire into the splice. Verify: 2-tier hierarchy correct at all 4 widths, links resolve to real category/event/region targets.
5. **REQUIRED** — Redesign `renderHiddenGemsHomepageHTML()` to editorial format; redesign `renderExploreRegionsHTML()` to large photo-led cards + destination images. Verify: graceful-empty-state behavior still holds if data is ever absent; visual QA at all 4 widths.
6. **REQUIRED** — Remove Spotlight banner and Featured Venues (`<section>` markup deletion); trim the Featured half of `applyOpenStatusToHeroAndFeatured`; delete now-dead CSS. Verify: no console errors, no leftover dead references, tests pass.
7. **REQUIRED** — Add `renderBuildTripCTAHTML()` + trip-CTA image + the small click-handler wiring into the existing trip tray/map. Verify: clicking the CTA correctly opens/reaches the existing trip tray, no new planning logic introduced (explicit negative check).
8. **RECOMMENDED** — Weather banner de-emphasis (CSS-only, moved position confirmed as part of step 3's reorder or done as its own tiny step here if kept separate for cleaner diffs).
9. **REQUIRED** — Full regression pass: complete `npm test` run, full 4-width visual QA of the entire page top-to-bottom, explicit verification that region/category/venue SEO pages are byte-identical to their pre-change output, console-error check across the whole page.
10. **OPTIONAL/FUTURE** — Any spacing-scale/CSS-consistency polish (§6), responsive `srcset` work (§8), or expanding Explore-the-Okanagan's destination count beyond the initial set — explicitly deferred, not part of this implementation pass.

No step in this sequence touches `db.js`, any `/api/*` route, or any SEO page-render function. No step deploys, merges to `main`, or touches Railway/production — those remain separate, explicitly-approved actions after this plan is executed and reviewed.
