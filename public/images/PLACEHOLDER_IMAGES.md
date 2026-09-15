# Homepage image placeholders (Milestone 1)

Every image file in this directory is a **temporary structural placeholder**
— a flat generated gradient PNG, not photography, not final AI-generated
imagery, and not approved creative. They exist only so the new hero and
"What are you in the mood for?" sections have correctly-sized, correctly-
positioned images for layout QA.

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

All images are served via the `/images/*` route in `server.js`
(`object-fit: cover` is used throughout, so exact pixel dimensions can vary
as long as the aspect ratio is preserved and the file is reasonably
compressed).

If a `.jpg`/`.jpeg`/`.webp` file is preferred over `.png` for the final
asset, update the single `img:` path per card in `renderMoodCardsHTML()`
(`server.js`) and the hero `<img src>` in `okanagan.html` accordingly —
the `/images/*` route already allowlists `.jpg`/`.jpeg`/`.png`/`.webp`.
