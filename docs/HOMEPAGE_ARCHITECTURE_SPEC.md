# Okanagan Roam — Homepage Redesign Architecture Spec

**Status:** Planning document only. No application code, database, schema, or
production changes are included in this commit.

**Baseline:** `main` @ `9373c28121c3bfbfad95d0ada496974392da9610`

**Product philosophy (approved):** Okanagan Roam = inspiration + discovery
first, directory second. Primary journey: *Inspire me → help me choose →
show me places → help me plan → let me browse deeper.*

**Approved homepage structure:**
1. HERO — Sell the Okanagan
2. WHAT ARE YOU IN THE MOOD FOR? — visual discovery engine
3. HIDDEN GEMS — curated/editorial discovery
4. EXPLORE THE OKANAGAN — major visual destination section
5. BUILD YOUR PERFECT OKANAGAN TRIP — major discovery/CTA
6. BROWSE / SEARCH THE OKANAGAN — deeper directory layer
7. Existing deeper directory/category/region/results functionality

**Approved mood cards:**
- Eat — Find your next favourite table.
- Drink — Wineries, breweries, cocktails & more.
- Hidden Gems — The places you might drive past.
- Golf — Tee off somewhere beautiful.
- What's On — See what's happening around the valley.
- Explore — Let's see where the road takes you.

Visual hierarchy: Eat / Drink / Hidden Gems get the strongest visual
treatment; Golf / What's On / Explore form a secondary row. Not six
identical generic buttons.

**Visual direction:** premium Okanagan travel/discovery experience, large
cinematic imagery. AI-generated imagery is approved for homepage
storytelling, provided it reads as believable high-end travel photography
(not obvious AI art) and never falsely represents a specific real business.
The hero sells the Okanagan, not the directory.

---

## A. CURRENT BASELINE

- **SHA:** `9373c28121c3bfbfad95d0ada496974392da9610`
- **Current homepage order:** Header/nav → Filter/wizard (`#directory`,
  includes search) → Happening Soon → Hidden Gems → Hero (small "Worth the
  Drive" photo carousel, **images embedded as inline base64 data URIs**, not
  files) → Browse by Category (photo-free tile grid) → Explore the
  Okanagan/regions (photo-free tile grid) → Weather banner → Spotlight
  banner → Featured Venues → Results grid → List Your Venue → App teaser.
- **`okanagan.html` is ~1.05MB**, driven almost entirely by 11 base64-embedded
  hero images — a real, pre-existing performance characteristic of `main`,
  not something this redesign introduces.
- **No `/images/*` static-serving route exists on `main` at all.**
  `STATIC_ASSETS` only serves `tokens.css`, `app.css`, `app.js`. This is a
  genuine gap versus earlier draft descriptions (which were based on a
  since-deployed but unrelated branch, not `main`) — corrected here.

---

## B. APPROVED HOMEPAGE ARCHITECTURE

Hero → Mood cards (Eat/Drink/Hidden Gems primary; Golf/What's On/Explore
secondary) → Hidden Gems (editorial) → Explore the Okanagan (major visual) →
Build Your Perfect Okanagan Trip (CTA) → Browse/Search (existing wizard,
repositioned) → existing deeper directory.

---

## C. SECTION-BY-SECTION IMPLEMENTATION PLAN

1. **Hero** — new template section, large cinematic image (file-based, not
   base64), search box moved here from the wizard. Reuses the existing hero
   anchor-splice point; requires the new image-serving route (see E).
2. **Mood cards** — new render function, 6 cards, two-tier CSS grid
   (Eat/Drink/Hidden Gems large; Golf/What's On/Explore smaller row). Links:
   Eat/Drink → existing category pages or `#directory` pre-filtered; Hidden
   Gems → `#hiddenGems`; Golf → existing golf category page; What's On →
   `#happeningSoon`; Explore → `#exploreRegions` or `#directory`.
3. **Hidden Gems** — reuse `renderHiddenGemsHomepageHTML()`'s query/data as
   is; redesign only the card markup/copy to read editorial (short
   curatorial sentence per venue, de-emphasized "directory" chrome like
   ratings/hours), matching the pattern already proven in this codebase's
   Worth the Roam work.
4. **Explore the Okanagan** — reuse `renderExploreRegionsHTML()`'s
   data/query; upgrade from small tile grid to large photo-led cards (needs
   new imagery, see G).
5. **Build Your Perfect Okanagan Trip** — new template section (large CTA,
   not a new builder), linking into the existing trip-tray (`localStorage`,
   "Add to trip", multi-stop Google Maps route) and Leaflet map. No new
   planning logic per product direction.
6. **Browse/Search** — the existing wizard/filter-bar, moved down, logic
   untouched.

---

## D. EXISTING INFRASTRUCTURE WE CAN REUSE

- `renderHiddenGemsHomepageHTML()` — `collections`/`collection_items`, kind
  `hidden_gem`
- `renderExploreByCategoryHTML()` / `renderExploreRegionsHTML()` —
  `CATEGORY_SLUGS`/`CATEGORY_LABELS`/`REGION_LABELS`/`VALID_REGIONS`/
  `CATEGORY_TAGLINES`/`REGION_TAGLINES`
- `renderHappeningSoonHTML()` — `events` table
- `renderHomepageDiscoveryStyles()` — existing `discover-section`/
  `discover-heading`/`eyebrow`/`discover-grid` CSS pattern, already used by
  4 sections
- Leaflet map (`L.map('okMap')`) and the full trip planner (`localStorage`,
  "Add to trip," multi-stop Google Maps route) in `app.js` — both confirmed
  present and working on `main`
- `public/styles/tokens.css` — shared color tokens
- The existing wizard/filter/results system — entirely reusable, only
  repositioned
- The anchor-splice homepage-assembly mechanism itself (see J below)

## E. NEW INFRASTRUCTURE ACTUALLY REQUIRED

- **An image-serving route** — `main` has none for photography (confirmed
  above); needs a `/images/*` route with `Cache-Control` headers, same
  simple pattern as `STATIC_ASSETS` but for binary files. This is real,
  necessary new infrastructure, not just template work.
- New render function(s) for the mood-card grid and the Build-Your-Trip CTA
  section — new markup/CSS, no new data source.
- New CSS for the two-tier mood-card hierarchy and the larger
  Explore-the-Okanagan card treatment.

No schema changes, no new tables, no new API routes are required for any
approved section.

---

## F. MODULES TO KEEP / MOVE / REDESIGN / RETIRE

- **Keep (logic unchanged):** venue filtering/results, category/region
  taxonomy, Hidden Gems data, events data, trip planner, map
- **Move:** wizard/filter-bar + search (down the page); Hidden Gems and
  Explore-the-Okanagan (up the page)
- **Redesign:** Hero (carousel → scenic hero+search), Hidden Gems cards
  (directory-style → editorial), Explore the Okanagan (small tiles → major
  visual section), Browse by Category (folds into the new mood cards rather
  than surviving as a separate section)
- **De-emphasize:** none beyond the above — Weather banner's fate is still
  an open decision (see K)
- **Retire (module only, data untouched):** Spotlight banner, Featured
  Venues — both conflict with the new "curated discovery" direction and are
  redundant with Hidden Gems; retiring requires also updating
  `applyOpenStatusToHeroAndFeatured` in `app.js`, which currently targets
  both the hero carousel and Featured Venues cards by DOM structure

---

## G. IMAGE PLAN

- **Reusable now:** none of the current homepage imagery is file-based —
  the 11 hero carousel photos are inline base64, not separable assets to
  reuse cleanly in a new file-based hero. Effectively starting fresh on
  hero imagery.
- **New AI-generated images needed (pending approval):** one large
  cinematic hero image; imagery for the two-tier mood cards (at minimum
  Eat/Drink/Hidden Gems get distinct strong visuals; Golf/What's
  On/Explore can share a lighter treatment); Explore-the-Okanagan section
  imagery (per-region or one strong composite scene — open decision, see
  K); Build-Your-Trip CTA background image.
- **Constraint carried forward correctly:** AI imagery must read as
  premium travel photography, not obvious AI art, and must not depict
  specific real businesses — consistent with product direction and with
  this codebase's existing practice (venue `image_url` is effectively
  unpopulated in production, so no AI image should imply it's a real,
  named venue).
- All new images should be served as real files via the new image route,
  not embedded as base64 — directly addresses the ~1MB-homepage-payload
  issue that exists today.

---

## H. DESKTOP + MOBILE LAYOUT PLAN

- Reuse the established `discover-section`/`wrap` container pattern and
  `@media (max-width: 640px)` / `@media (min-width: 900px)` breakpoints
  already used elsewhere in `app.css` — consistent with the rest of the
  site rather than a new breakpoint system.
- Mood cards: CSS grid, asymmetric spans on desktop (large cards ~2x the
  width/height of secondary cards, matching the codebase's own prior
  asymmetric-grid precedent), collapsing to a single column on mobile.
- Explore the Okanagan: large-format cards, likely 2-up on desktop tapering
  to 1-up on mobile, consistent with existing `region-tile-grid`/
  `discover-grid` reflow behavior.
- Build Your Trip: full-width immersive section, CTA button prominent on
  both breakpoints; map/trip-tray interaction can remain the existing
  floating tray, just entered from this section rather than invented anew.

---

## I. SEO / PERFORMANCE / ACCESSIBILITY PLAN

- **SEO:** All region/category/venue SEO routes (`renderRegionPage`,
  `renderCategoryPage`, `renderVenuePage`) are rendered by functions
  entirely separate from the homepage splice logic — zero reason for this
  redesign to touch canonical URLs, JSON-LD, or the sitemap. Should be
  explicitly regression-checked at implementation time regardless.
- **Performance:** Moving hero imagery from inline base64 to real files
  served with `Cache-Control` headers is a direct, meaningful improvement
  over `main`'s current ~1.05MB homepage payload — this redesign is a net
  performance win if done this way, not a risk, provided new images
  aren't embedded inline again.
- **Accessibility:** `main`'s homepage already uses `alt=""`/`aria-*`
  attributes in a handful of places (10 `alt=`, 73 `aria-` occurrences) —
  new sections should follow the same pattern (meaningful `alt` text on
  content images, `aria-label` on icon-only controls), consistent with
  existing practice rather than introducing new conventions.
- **Mobile:** No new infrastructure needed; extend the existing responsive
  patterns already in `app.css`.

---

## J. IMPLEMENTATION ORDER

1. Add the image-serving route (prerequisite for everything visual below)
2. Hero replacement (isolated; update the hero-half of
   `applyOpenStatusToHeroAndFeatured`)
3. Mood-cards section (new, additive)
4. Reorder Hidden Gems + Explore the Okanagan upward via anchor-splice
   (same technique already proven in this codebase's history — small,
   targeted string-anchor replacements in `server.js`, not a rewrite)
5. Redesign Hidden Gems cards to read editorial; redesign
   Explore-the-Okanagan cards to be photo-led
6. Retire Spotlight + Featured Venues (module-only; fix the remaining half
   of `applyOpenStatusToHeroAndFeatured`)
7. Build Your Trip CTA section, wired to the existing trip-tray/map
8. Move wizard/results lower (last — highest-traffic existing feature,
   warrants the most testing)

**On the anchor-splice architecture:** retain it, don't replace it. It's
already proven capable of everything this redesign needs (reordering,
inserting, removing sections) via targeted string-anchor replacement in
`server.js`, with zero risk to the separate SEO-page render functions. A
framework/templating-engine replacement would be a much larger, riskier
change with no functional benefit for what's being asked here.

**Where new sections should live in code:** new render functions alongside
the existing ones in `server.js` (same file, same pattern —
`renderHeroHTML()`, `renderMoodCardsHTML()`, `renderBuildTripCTAHTML()`
sitting next to `renderHiddenGemsHomepageHTML()` etc.); new CSS either
extending `renderHomepageDiscoveryStyles()` or a small new equivalent
function, following the existing convention of homepage-specific CSS
living server-side rather than in `app.css`; the image-serving route added
alongside the existing `STATIC_ASSETS` block in `server.js`.

---

## K. RISKS / OPEN DECISIONS

**Risks:**
- `applyOpenStatusToHeroAndFeatured` in `app.js` directly couples
  hero-carousel and Featured-Venues DOM structure — retiring/replacing
  either requires updating this function or it will silently no-op or
  break.
- Nav bar hard-links to `#directory`, `#list-venue`, `#app`, `#top` — these
  IDs must be preserved on whatever sections end up owning them.
- No image-serving route currently exists on `main` — this must be added
  correctly (path traversal-safe) rather than improvised.
- `main`'s ~1.05MB homepage HTML (base64 images) is a pre-existing
  performance issue, not something introduced by this redesign, but
  relevant context for why moving to file-based images matters.
- Golf's real-world venue inventory should be confirmed adequate before
  it's given equal visual weight to Eat/Drink/Hidden Gems in the secondary
  row (local dev DB is not representative of production counts).

**Dead/inefficient code observed (not fixed here):** the base64-embedded
hero images in `okanagan.html`; the dual-purpose
`applyOpenStatusToHeroAndFeatured` function that will need splitting once
Featured Venues retires.

**Open decisions needing approval before implementation:**
1. Weather banner — retire, defer lower, or keep? Still unaddressed.
2. Hero and Explore-the-Okanagan imagery — one AI image per section, or
   multiple (e.g., per-region for Explore)?
3. Hidden Gems editorial copy format — short curatorial sentence per venue
   (matching this codebase's own prior Worth the Roam pattern), or
   something else?
4. Confirm Build Your Trip CTA stays scoped to linking into the existing
   trip-tray/map with no new UI beyond the CTA itself.
5. Confirm it's acceptable to modify `applyOpenStatusToHeroAndFeatured` as
   an unavoidable consequence of retiring Featured Venues/the carousel.
6. Confirm the new image route should live in `server.js` alongside
   `STATIC_ASSETS`, matching the codebase's existing convention.

---

## RECOMMENDED BUILD PLAN

Branch fresh from `main` (`9373c28`). Implement in this exact sequence:
**(1)** add the image-serving route, **(2)** replace the hero (scenic
image + search, update the hero half of
`applyOpenStatusToHeroAndFeatured`), **(3)** add the new mood-cards
section, **(4)** anchor-splice Hidden Gems and Explore-the-Okanagan
upward, **(5)** redesign Hidden Gems cards to editorial and
Explore-the-Okanagan cards to photo-led, **(6)** retire Spotlight and
Featured Venues (data untouched, fix the remaining JS coupling), **(7)**
add the Build Your Trip CTA wired to the existing trip-tray/map, **(8)**
move the wizard/results section lower. No schema changes, no new API
routes, no changes to region/category/venue SEO pages at any step.
Implementation should not begin until the open decisions in Section K are
resolved.
