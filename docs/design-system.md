# Roam design system

The homepage's editorial look, shared with the rest of the site. Two files:

- `home-polish.js`: the homepage only.
- `roam-polish.js`: everything else. Served as `/styles/shared/roam-polish.css` and added automatically to list pages
  (`body.fd-page`) and town pages (`body.town-page`, `body.kelowna-page`). It changes styling only, so English and
  French pages share it.

## 1. Tokens

| Token | Use |
|---|---|
| `--rp-serif` (Fraunces) | headings |
| `--rp-sans` (Nunito) | buttons, labels, body text |
| `--rp-ink`, `--rp-ink-soft`, `--rp-cream`, `--rp-paper`, `--rp-line`, `--rp-gold`, `--rp-gold-soft` | colours |
| `--rp-radius-sm` 12px, `--rp-radius` 18px, `--rp-radius-lg` 24px, `--rp-pill` | corners |
| `--rp-shadow-1`, `--rp-shadow-2`, `--rp-shadow-3` | resting, floating, raised |
| `--rp-ease` | the one easing curve for every transition |
| `--rp-header-h` | height of the sticky site header (73px, 53px on phones) |

## 2. Utility classes

```html
<h2 class="rp-serif">A heading</h2>
<p class="rp-eyebrow">A small gold label</p>

<!-- a card that lifts, with a photo that zooms -->
<a class="rp-lift rp-shadow-1" href="/kelowna/wineries/example">
  <span class="rp-zoom"><img src="/images/venues/example-w480.jpg" alt=""></span>
  <b class="rp-serif">Example Winery</b>
</a>

<!-- live status -->
<span class="rp-live"><i class="rp-live-dot" aria-hidden="true"></i>
  <span class="home-en">Roam Now</span><span class="home-fr" lang="fr">Roam Now</span></span>
<span class="rp-live rp-live-gold"><i class="rp-live-dot" aria-hidden="true"></i>Happy Hour Now</span>
<span class="rp-live rp-live-open"><i class="rp-live-dot" aria-hidden="true"></i>Open now</span>

<!-- pills and a grid -->
<button class="rp-pill" aria-pressed="true">Patio</button>
<ul class="rp-grid">…</ul>
```

All motion stops for visitors who ask their device for reduced motion.

## 3. Destination / guide template

List pages keep their existing markup; the stylesheet restyles these parts:

```html
<body class="golf-page outdoor-page fd-page …">
  <main class="wrap-wide golf-main">
    <nav class="breadcrumb">…</nav>
    <div class="category-hero">            <!-- banner, serif title, intro -->
      <div class="category-banner"><picture class="banner-pic">…</picture></div>
      <div class="category-hero-text"><h1>Wineries in the Okanagan</h1><p class="subtitle">…</p></div>
    </div>
    <div class="fd-toolbar">               <!-- sticky, frosted filter bar -->
      <div class="fd-search"><input class="fd-search-input" type="search"></div>
      <div class="fd-controls"><button class="fd-pop-btn">Choose a town</button> …</div>
    </div>
    <ul class="card-grid">                 <!-- responsive grid of venue cards -->
      <li class="venue-card" data-ph="own" style="--fd-ph:url(…)">
        <h2><a class="venue-card-link" href="…"><span class="venue-card-name">…</span></a></h2>
        <p class="venue-meta">West Kelowna · 4.8★</p>
        <p class="fd-open-status" data-fd-open="open">Open now · Closes 7 PM</p>  <!-- the dot pulses -->
        …
      </li>
    </ul>
  </main>
</body>
```

- The filter bar sticks under the site header. On phones only the row of filter pills stays; the search box scrolls away.
- Cards lift and their photo zooms slowly on hover (devices with a pointer only).
- `data-fd-open="open"` gets a pulsing dot. Closed, unknown and by-appointment do not.

Town pages (`bw-hero`, `bw-tile`, `bw-pick`) get the same fonts, shadows and hover behaviour.

## Bilingual pages

Nothing here contains words. Text stays in the page as it is today (`home-en` / `home-fr` spans on the homepage,
the `/fr` twins elsewhere), so a French page needs no extra work to get the design.

## 4. Venue profile template (Food & Drink venue pages, `body.fd-venue-page`)

- **Photo:** the main photo is larger (up to 520px tall) with a slow zoom on hover.
- **Icons:** `roamPolish.venueIcons(html)` swaps the emoji in the highlights, the fact labels (Address, Phone, Menu,
  Social, Price, Cuisine, Happy hour and their French labels) and the Hours button for line icons
  (`roamPolish.icon('pin')`). An emoji with no matching icon is left alone, and no words change.
- **Map card:** `roamPolish.mapCard({ lat, lng, map, href, label, credit, esc })` draws the town's pre-rendered map
  (`public/images/regions/maps`) with the place pinned from its own coordinates. It returns nothing when the place has
  no coordinates or would fall outside the picture, so a wrong pin is never shown. The whole card opens directions.
- **Sidebar:** serif headings, the shared shadows, today's row in bold in the hours list.

## Still to do

- Venue pages with other layouts (indoor, outdoor, golf) and the French venue pages, which use the older layout.
- Wider town maps: the current pictures cover about 55% of Food & Drink places; the rest show no map card.
