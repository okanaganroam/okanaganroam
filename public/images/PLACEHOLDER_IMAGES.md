# Homepage image placeholders (Milestone 1 + Milestone 2)

Every image file in this directory is a **temporary structural placeholder**
— a flat generated gradient PNG, not photography, not final AI-generated
imagery, and not approved creative. They exist only so the hero, "What are
you in the mood for?", and "Explore the Okanagan" sections have correctly-
sized, correctly-positioned images for layout QA.

**To replace with real imagery:** overwrite the file at the exact path
below with a final image of the same (or larger, same-aspect-ratio)
dimensions. No HTML/CSS/JS changes are required — the application code
references these exact filenames.

| Path | Used for | Dimensions | Aspect ratio |
|---|---|---|---|
| `hero.png` | Homepage hero background | 1920×1080 (or larger) | 16:9 |
| `mood/eat.png` | "Eat" mood card (primary) | 900×1200 (or larger) | 3:4 |
| `mood/drink.png` | "Drink" mood card (primary) | 900×1200 (or larger) | 3:4 |
| `mood/hidden-gems.png` | "Hidden Gems" mood card (primary) | 900×1200 (or larger) | 3:4 |
| `mood/golf.png` | "Golf" mood card (secondary) | 960×540 (or larger) | 16:9 |
| `mood/whats-on.png` | "What's On" mood card (secondary) | 960×540 (or larger) | 16:9 |
| `mood/explore.png` | "Explore" mood card (secondary) | 960×540 (or larger) | 16:9 |
| `regions/kelowna.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |
| `regions/penticton.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |
| `regions/vernon.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |
| `regions/west-kelowna.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |
| `regions/oliver.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |
| `regions/osoyoos.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |
| `regions/summerland.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |
| `regions/naramata.png` | "Explore the Okanagan" destination card | 640×800 (or larger) | 4:5 |

Note: `regions/*.png` are destination-inspired placeholders, not photos of
any specific business — real replacements should follow the same rule
(destination/scenery imagery for the region, never a depiction implying a
specific real venue).

All images are served via the `/images/*` route in `server.js`
(`object-fit: cover` is used throughout, so exact pixel dimensions can vary
as long as the aspect ratio is preserved and the file is reasonably
compressed).

If a `.jpg`/`.jpeg`/`.webp` file is preferred over `.png` for the final
asset, update the single `img:` path per card in `renderMoodCardsHTML()`
(`server.js`) and the hero `<img src>` in `okanagan.html` accordingly —
the `/images/*` route already allowlists `.jpg`/`.jpeg`/`.png`/`.webp`.
