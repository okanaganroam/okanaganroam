# Homepage image assets

## Update: Hidden Gems content-model change + new dedicated images (2026-09-17)

The Hidden Gems homepage section changed from "3 real top-rated venues,
picked live by rating" to 3 fixed editorial theme cards, each with its own
new dedicated photo (not reused from the mood cards anymore):

| Image | Source (`~/Downloads`) | Installed | Dimensions | Ratio |
|---|---|---|---|---|
| Dog-Friendly Finds | `dog friendly finds.jpeg` | `hidden-gems/dog-friendly.png` | 1600×656 | 2.44:1 |
| Local Favourites | `Local Favourites.jpeg` | `hidden-gems/local-favourites.png` | 1600×656 | 2.44:1 |
| Secret Spots | `secret spots.jpeg` | `hidden-gems/secret-spots.png` | 1600×656 | 2.44:1 |

All three installed at native resolution, no crop, no upscale — matching
the ~2.4:1 recommendation from the prior measurement audit almost exactly.
New subdirectory `public/images/hidden-gems/` created for these (parallel
to the existing `mood/` and `regions/` convention); the `/images/*` static
route already serves any subpath under `public/images/`, so no route
change was needed.

**Flagging for awareness**: the Local Favourites photo includes a
storefront sign reading "THE LOCAL BEAN, EST. 1930." This is a fictional
business name, not a real Okanagan venue in this site's data — it reads as
atmospheric set-dressing in the photo rather than a specific claim, but it
does contain legible fabricated signage, which conflicts with the "no
text/logos/fake signage" photography guideline from earlier in this
project. Installed as instructed; let me know if you'd like it swapped.

The old per-venue query, card renderer (`hiddenGemHomepageCardHtml`), and
`HIDDEN_GEM_TYPE_IMAGE` mapping (mood images reused as Hidden-Gems-section
backdrops) are unused by the homepage now but were left defined/exported/
tested — they're still correct, real behavior that could back a future
"view all hidden gems" page.

## Update: full Gemini batch install (2026-09-17)

Hero, all four remaining mood cards (Food & Drink, Wine, Golf, Outdoors),
and all six destination cards were replaced with a newly generated,
purpose-shot Gemini batch, all landing within ~1-2% of the previously
measured target ratios (mood ~1.6-2.0:1, destinations ~2.56:1), so every
one installed at native resolution with **no crop, no upscale**:

| Image | Source (`~/Downloads`) | Installed | Dimensions | Ratio |
|---|---|---|---|---|
| Hero | `hero.jpeg` | `hero.png` | 1376×768 | 1.79:1 |
| Food & Drink | `food & drink.jpeg` | `mood/eat.png` | 1456×720 | 2.02:1 |
| Wine | `wine.jpeg` | `mood/drink.png` | 1312×816 | 1.61:1 |
| Golf | `golf.jpeg` | `mood/golf.png` | 1376×768 | 1.79:1 |
| Outdoors | `out door.jpeg` | `mood/explore.png` | 1456×720 | 2.02:1 |
| Kelowna | `kelowna.jpeg` | `regions/kelowna.png` | 1648×640 | 2.58:1 |
| West Kelowna | `west kelowna.jpeg` | `regions/west-kelowna.png` | 1648×640 | 2.58:1 |
| Lake Country | `lake country.jpeg` | `regions/lake-country.png` | 1648×640 | 2.58:1 |
| Penticton | `penticton.jpeg` | `regions/penticton.png` | 1648×640 | 2.58:1 |
| Naramata | `naramata.jpeg` | `regions/naramata.png` | 1648×640 | 2.58:1 |
| Vernon | `vernon.jpeg` | `regions/vernon.png` | 1648×640 | 2.58:1 |

Each destination photo shows a real, recognizable landmark: Kelowna's
downtown waterfront + William R. Bennett Bridge, West Kelowna's Mount
Boucherie wine country, Lake Country's orchard rows, Penticton's SS
Sicamous + the isthmus beach, the Naramata Bench's terraced vineyards, and
Vernon's turquoise Kalamalka Lake. Beaches, What's On, and the Build Your
Trip photo were left untouched (already approved in the prior pass).

Status as of 2026-09-16, final install pass: **18 of 18 final homepage
image assets installed.** `mood/beaches.png` and `mood/whats-on.png` were
filled with genuinely new, distinct Gemini sources (`beaches.jpeg`,
`whats on.jpeg`, both dated 23:3x, confirmed by MD5 not to be the earlier
duplicate), and `trip-cta.png` was replaced again with a purpose-generated
~2.4:1 source (`build my trip.jpeg`) matching the Build Your Trip photo
panel's actual rendered aspect ratio. All three installed at native
resolution, no crop, no upscale — see "Final install pass" below. Every
other file in this directory is final, approved creative sourced directly
from `~/Downloads`, not placeholder/generated imagery.

## Final install pass (measurement-driven)

`mood/beaches.png` — `~/Downloads/beaches.jpeg`, 1312×816 (1.608:1),
installed at native resolution, no crop. Real Okanagan Lake beach scene
(sand/pebble shoreline, beach chairs, paddleboard, no crowd).

`mood/whats-on.png` — `~/Downloads/whats on.jpeg`, 1312×816 (1.608:1),
installed at native resolution, no crop. Replaces the earlier
crowd-dominated indoor hockey photo with an outdoor vineyard evening
event (live music, string lights, Okanagan Lake and hills in the
background) — matches the site's premium-editorial-travel direction.

`trip-cta.png` — `~/Downloads/build my trip.jpeg`, 1600×656 (2.439:1),
installed at native resolution, no crop. Generated specifically at the
~2.4:1 ratio recommended from the measured Build Your Trip photo panel
(1408×400 desktop = 3.52:1 box; a 2.439:1 source needs only a ~31% height
crop to cover it, vs. ~49% for the previous 1.79:1 source). Same
map/sunglasses/water-bottle/journal composition as before, wider frame.

## Image-asset audit (this pass)

Every homepage image was re-derived **directly from its `~/Downloads`
source** (not from the previously-installed 640×800 copies), fixing a real
double-crop problem: the earlier install pass had cropped every landscape
source down to a fixed portrait 640×800, and then the reference-redesign's
CSS was cropping that portrait image a *second* time back toward landscape
(1.59:1 for mood cards, 2.56:1 for destination cards) — losing image content
twice and, for a few images (e.g. "Outdoors"), cropping out the actual
subject (the lake disappeared from the Outdoors mood card entirely). Fixed
by cropping once, directly from source, straight to a landscape working
ratio close to what every card actually needs, with the crop position
chosen per image to keep the real subject (wine glass, food, hiker, lake,
town) in frame rather than defaulting to a blind center crop. No source was
upscaled beyond its native resolution, and none was stretched.

`trip-cta.png` used to be installed at 1920×1080; that was an artificial
upscale of the same 1376×768 source (interpolated, not real detail). It's
now installed at its native 1376×768 — smaller in pixel count but sharper,
since every pixel is real source data rather than interpolation.

## Update: visual QA follow-up pass (later the same evening)

`trip-cta.png` was **replaced again**, this time with a genuinely new
source (`~/Downloads/build my trip.jpeg`, 1376×768, distinct file — the
map/sunglasses/water-bottle picnic-table composition, matching the
original reference image's Build Your Trip photo). Installed at native
resolution, no crop, no stretch, same policy as every other landscape
source in this doc. The Build Your Trip section's layout was also rebuilt
around this photo — see the section's own comment in `renderBuildTripCTAHTML()`
in `server.js`.

## Update: visual rebuild pass (photography quality + header + map)

`mood/eat.png` (Food & Drink) was **replaced** with a genuinely stronger
source found in Downloads during this pass:
`Gemini_Generated_Image_2hl5h32hl5h32hl5.jpeg` (1376×768, modified
22:52:24 -- newer than every other file in the batch, and not a
duplicate of anything). A plated dish + two wine glasses + vineyard/lake
backdrop, more premium/editorial than the previous patio-bread-basket
shot. Installed native resolution, no crop.

`mood/whats-on.png` was **re-cropped once from its original source**
(`~/Downloads/whats on.jpeg`, 896×1200) now that the What's On mood card
is back in the approved 6-category set -- it had been left in its old,
double-cropped 640×800 state since it was unused at the time of the
previous crop-pipeline fix. **This source is flagged as weak and a
genuine candidate for Gemini regeneration**: it's an indoor hockey-game
photo with a large crowd dominating the frame, which doesn't match the
site's premium-editorial-travel-photography direction or say "Okanagan"
at all. See the audit report for a suggested replacement prompt.

The Build Your Trip map graphic (inline SVG, `renderBuildTripCTAHTML()`
in `server.js`) was rebuilt from a flat pale-green rect with pin-drop
markers and sans-serif labels into a warmer, muted, topographic-textured
treatment with small ring-and-dot markers, letter-spaced serif labels, a
labeled "Okanagan Lake," and a thin gold frame -- aiming for a printed
travel-guide feel rather than a GIS/interface widget. Still the same real
6 destinations in their real relative geography; still opens the actual
Leaflet map on click.

A separate CSS bug was found and fixed: `.nav{ padding:14px 0 }`'s
implicit `padding-left/right:0` was overriding `.wrap`'s own
`padding:0 32px` in the cascade (equal specificity, `.nav` declared
later), which is why the header logo was rendering flush against the
viewport edge with almost no gutter. Fixed by splitting the rule into
`padding-top`/`padding-bottom` only, in `public/styles/app.css`.

A second `beaches.jpeg` was checked for this same pass and found to be
**byte-for-byte identical** (same MD5, same file size, same modified
timestamp) to the one already identified and rejected as a duplicate of
`osoyoos.jpeg`. No new Beaches source has actually landed in Downloads yet,
despite it being requested — `mood/beaches.png` remains genuinely missing.

`hero.png` was independently re-verified: a Downloads file named
`Hero Image.jpeg` (1365×768) is visually the *same photograph* as the
already-installed `hero.png` (1920×1080, confirmed pixel-for-pixel matching
composition), just re-exported at a lower resolution. The installed
1920×1080 version is the better copy and was left untouched.

| Path | Used for | Installed dimensions | Source | Status |
|---|---|---|---|---|
| `hero.png` | Homepage hero background | 1920×1080 | Same photo as `~/Downloads/Hero Image.jpeg`, installed copy is higher-res — kept | ✅ Final |
| `mood/drink.png` | "Wine" mood card + Hidden Gems cards for winery-type gems | 896×503 (native width, single crop from source) | `~/Downloads/wine.jpeg` (896×1200) | ✅ Final — re-cropped this pass |
| `mood/eat.png` | "Food & Drink" mood card + Hidden Gems cards for restaurant/cafe/brewery/pub/cocktail/winery-type gems | 1376×768 (native, no crop) | `~/Downloads/Gemini_Generated_Image_2hl5h32hl5h32hl5.jpeg` (supersedes `food & drink.jpeg`) | ✅ Final — replaced with a stronger, more premium-editorial source |
| `mood/explore.png` | "Outdoors" mood card (relabeled from "Explore" in the forensic-comparison rebuild; same file, same anchor behavior) | 1376×768 (native, no crop) | `~/Downloads/explore.jpeg` (1376×768) | ✅ Final — re-installed at native res; the lake that was lost in the old double-crop is back in frame |
| `mood/golf.png` | "Golf" mood card + Hidden Gems cards for golf-type gems | 1376×768 (native, no crop) | `~/Downloads/golf.jpeg` (1376×768) | ✅ Final — re-installed at native res |
| `mood/whats-on.png` | "What's On" mood card (back in the 6-category set this pass) | 896×503 | `~/Downloads/whats on.jpeg` (896×1200) | ⚠️ Installed, re-cropped once — but this source itself is weak (indoor hockey game, crowd-dominated, no Okanagan scenery); flagged for Gemini regeneration, see audit report |
| `mood/beaches.png` | "Beaches" mood card | — | See below | **⏳ Genuinely missing** |
| `mood/hidden-gems.png` | "Hidden Gems" mood card + fallback Hidden Gems card backdrop for any venue type not in `HIDDEN_GEM_TYPE_IMAGE` | 896×503 | `~/Downloads/hidden gems.jpeg` (896×1200) | ✅ Final — re-cropped this pass |
| `regions/kelowna.png` | "Explore by Destination" card | 1376×768 (native, no crop) | `~/Downloads/kelowna.jpeg` | ✅ Final — re-installed at native res |
| `regions/west-kelowna.png` | "Explore by Destination" card | 1376×768 (native, no crop) | `~/Downloads/west kelowna.jpeg` | ✅ Final — re-installed at native res |
| `regions/lake-country.png` | "Explore by Destination" card | 928×521 | `~/Downloads/lake country.jpeg` (928×1152) | ✅ Final — re-cropped this pass |
| `regions/penticton.png` | "Explore by Destination" card | 1376×768 (native, no crop) | `~/Downloads/penticton.jpeg` | ✅ Final — re-installed at native res |
| `regions/naramata.png` | "Explore by Destination" card | 928×521 | `~/Downloads/naramata.jpeg` (928×1152) | ✅ Final — re-cropped this pass |
| `regions/vernon.png` | "Explore by Destination" card | 1376×768 (native, no crop) | `~/Downloads/vernon.jpeg` | ✅ Final — re-installed at native res |
| `regions/oliver.png` | Not currently referenced by any code | 1376×768 (native, no crop) | `~/Downloads/oliver.jpeg` | ✅ Installed, unused — Oliver isn't one of the 6 featured homepage destinations; its own region/category pages are untouched |
| `regions/osoyoos.png` | Not currently referenced by any code | 928×521 | `~/Downloads/osoyoos.jpeg` (928×1152) | ✅ Installed, unused — re-cropped this pass for consistency even though nothing renders it today |
| `regions/summerland.png` | Not currently referenced by any code | 928×521 | `~/Downloads/summerland.jpeg` (928×1152) | ✅ Installed, unused — re-cropped this pass for consistency even though nothing renders it today |
| `trip-cta.png` | "Build Your Perfect Okanagan Trip" CTA photo (now dissolves into the map on the right) | 1376×768 (native, no crop) | `~/Downloads/build my trip.jpeg` (supersedes `trip CTA.jpeg`) | ✅ Final — replaced with the correct reference-matching photo (map/sunglasses/water-bottle), native res, no crop |

### `mood/beaches.png` — genuinely missing, one candidate rejected

A file named `beaches.jpeg` exists in `~/Downloads` (added 2026-09-16
20:39, after every other image in this batch), but its MD5 checksum is
**byte-for-byte identical** to `osoyoos.jpeg` — it is that same Osoyoos
beach photo saved under a second filename, not a distinct Beaches
photograph. Installing it as `mood/beaches.png` would put the exact same
image on two different homepage sections (the Beaches mood card and,
were Osoyoos ever re-added to Explore by Destination, the Osoyoos card)
with no visual distinction between them. Per instruction not to substitute
another image for a missing one, this was **not** installed. The Beaches
mood card still points at the not-yet-created `mood/beaches.png` path and
shows a clean empty state (no broken-image icon, since `alt=""`) until a
genuinely distinct Beaches photo is supplied.

All images are served via the `/images/*` route in `server.js`. Every mood
and destination card now uses a *single* deliberate crop from source
(landscape sources installed at native resolution with no crop at all;
portrait sources cropped once to a landscape working ratio, anchored to
keep the actual subject — glass, plate, hiker, town, lake — in frame), and
CSS `aspect-ratio` + `object-fit: cover` performs only the final,
per-card-width adjustment from there, not a second independent crop.

If a `.jpg`/`.jpeg`/`.webp` file is preferred over `.png` for a given
asset, update the single `img:` path per card in `renderMoodCardsHTML()`
(`server.js`) and the hero `<img src>` in `okanagan.html` accordingly —
the `/images/*` route already allowlists `.jpg`/`.jpeg`/`.png`/`.webp`.
