'use strict';
// Roam design system (2026-11-11): the homepage's editorial look (home-polish.js) as one shared stylesheet for the
// rest of the site. Three parts:
//   1. TOKENS   - CSS variables and small utility classes (.rp-*) any page can use.
//   2. GUIDE    - the destination / guide template: every list page (body.fd-page: /wineries, /kelowna/restaurants,
//                 /guide/kelowna/patio, /outdoors, /beaches ...) and the town pages (body.town-page, body.kelowna-page).
//   3. (later)  - the venue profile template.
// It is styling only. No markup, heading, sentence or link changes, so English and French pages share it as they
// share every other stylesheet. server.js adds the block to the pages it covers (withRoamPolish) and serves it as
// /styles/shared/roam-polish.css like the other shared blocks. docs/design-system.md shows how to use the classes.
const SERIF = "'Fraunces','Fraunces Fallback',Georgia,serif";
const SANS = "'Nunito','Nunito Fallback',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

const TOKENS = `
/* ===== 1. Tokens ===== */
:root{
--rp-serif:${SERIF};
--rp-sans:${SANS};
--rp-ink:#14252e;--rp-ink-soft:#56666b;--rp-cream:#faf7f0;--rp-paper:#fffdf8;--rp-line:#e6dfce;
--rp-gold:#b08d3c;--rp-gold-soft:#f1dda1;--rp-live:#ff6b57;--rp-open:#2a6b67;
--rp-radius-sm:12px;--rp-radius:18px;--rp-radius-lg:24px;--rp-pill:999px;
--rp-shadow-1:0 1px 2px #14252e0a,0 6px 16px -10px #14252e33;
--rp-shadow-2:0 1px 2px #14252e0a,0 12px 30px -14px #14252e47;
--rp-shadow-3:0 2px 4px #14252e0f,0 24px 48px -18px #14252e5c;
--rp-ease:cubic-bezier(.2,.7,.2,1);
--rp-header-h:73px;
}
@media(max-width:560px){:root{--rp-header-h:53px}}

/* Type: a serif for headings, a sans for everything you tap or read in a row. */
.rp-serif{font-family:var(--rp-serif);font-weight:600;letter-spacing:-.018em;line-height:1.1}
.rp-sans{font-family:var(--rp-sans)}
.rp-eyebrow{font-family:var(--rp-sans);font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--rp-gold)}

/* Depth: three soft shadows, from resting to raised. */
.rp-shadow-1{box-shadow:var(--rp-shadow-1)}
.rp-shadow-2{box-shadow:var(--rp-shadow-2)}
.rp-shadow-3{box-shadow:var(--rp-shadow-3)}

/* A card that lifts on hover, and a photo frame whose image zooms gently. */
.rp-lift{transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease);will-change:transform}
.rp-lift:hover{transform:translateY(-4px);box-shadow:var(--rp-shadow-3)}
.rp-zoom{overflow:hidden}
.rp-zoom img{transition:transform .9s var(--rp-ease);will-change:transform}
.rp-zoom:hover img,.rp-lift:hover .rp-zoom img{transform:scale(1.06)}

/* Live status: <span class="rp-live"><i class="rp-live-dot"></i>Open now</span>. Add .rp-live-gold for happy hour. */
.rp-live{display:inline-flex;align-items:center;gap:8px;font-family:var(--rp-sans);font-weight:800}
.rp-live-dot{position:relative;flex:none;width:9px;height:9px;border-radius:50%;background:var(--rp-live);box-shadow:0 0 0 3px #ff6b5733}
.rp-live-dot::after{content:'';position:absolute;inset:0;border-radius:50%;background:inherit;animation:rpPulse 2s var(--rp-ease) infinite;will-change:transform,opacity}
.rp-live-gold .rp-live-dot{background:#f5cf5e;box-shadow:0 0 0 3px #f5cf5e33}
.rp-live-open .rp-live-dot{background:var(--rp-open);box-shadow:0 0 0 3px #2a6b6726}
@keyframes rpPulse{0%{transform:scale(1);opacity:.75}75%,100%{transform:scale(3.4);opacity:0}}

/* Pill buttons and a card grid. */
.rp-pill{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:9px 18px;border:1px solid #cdc4ab;border-radius:var(--rp-pill);background:var(--rp-paper);color:var(--rp-ink);font-family:var(--rp-sans);font-size:14px;font-weight:800;white-space:nowrap;cursor:pointer;transition:background-color .25s,color .25s,border-color .25s,transform .25s var(--rp-ease)}
.rp-pill:hover{border-color:var(--rp-ink);transform:translateY(-1px)}
.rp-pill[aria-pressed="true"],.rp-pill[aria-selected="true"],.rp-pill.is-active{background:var(--rp-ink);border-color:var(--rp-ink);color:#fff}
.rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
@media(max-width:700px){.rp-grid{grid-template-columns:1fr;gap:16px}}
`;

const GUIDE = `
/* ===== 2. Destination / guide template: list pages (body.fd-page) ===== */
/* Header: breadcrumb, banner, title, intro. */
html body.fd-page .category-hero h1{font-family:var(--rp-serif);font-weight:600;font-size:clamp(2.1rem,3.4vw,3rem);line-height:1.06;letter-spacing:-.02em}
html body.fd-page .category-banner{border-radius:var(--rp-radius-lg);box-shadow:var(--rp-shadow-2)}
html body.fd-page .category-banner img{transition:transform 1.2s var(--rp-ease)}
html body.fd-page .category-banner:hover img{transform:scale(1.03)}

/* The filter bar stays with you as you scroll: frosted, under the site header. */
html body.fd-page .fd-toolbar{position:sticky;top:calc(var(--rp-header-h) + 10px);z-index:40;border-radius:var(--rp-radius-lg);border-color:#e6dfcecc;background:#fffaf0e6;-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);box-shadow:var(--rp-shadow-2);transition:box-shadow .3s var(--rp-ease)}
html body.fd-page .fd-toolbar .fd-search-input{transition:border-color .2s,box-shadow .25s var(--rp-ease)}
html body.fd-page .fd-toolbar .fd-search-input:focus-visible{outline:0;border-color:var(--rp-ink);box-shadow:0 0 0 3px #f1dda1cc}
html body.fd-page .fd-pop-btn,html body.fd-page .fd-sort select{transition:background-color .2s,color .2s,border-color .2s,transform .25s var(--rp-ease)}
html body.fd-page .fd-pop-btn:hover{border-color:var(--rp-ink);transform:translateY(-1px)}

/* Venue cards: softer depth, a lift and a slow photo zoom on hover. */
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off){border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1);transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease)}
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off)::before{transition:transform .9s var(--rp-ease);transform-origin:50% 60%;will-change:transform}
@media(hover:hover){
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off):hover{transform:translateY(-4px);box-shadow:var(--rp-shadow-3)}
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off):hover::before{transform:scale(1.05)}
}
html body.fd-page .venue-card .venue-card-cue{transition:transform .3s var(--rp-ease)}
html body.fd-page .venue-card:hover .venue-card-cue{transform:translateX(3px)}

/* "Open now" is live: its dot pulses. Closed, unknown and by-appointment stay still. */
html body.fd-page .fd-open-status[data-fd-open="open"]{position:relative}
html body.fd-page .fd-open-status[data-fd-open="open"]::after{content:'';position:absolute;left:0;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:50%;background:currentColor;animation:rpPulse 2.4s var(--rp-ease) infinite;will-change:transform,opacity;pointer-events:none}

/* Phones: only the row of filter pills stays; the search box scrolls away under the header. */
@media(max-width:560px){
html body.fd-page .fd-toolbar{top:calc(var(--rp-header-h) - 60px);border-radius:var(--rp-radius)}
}
@media(max-width:700px){
html body.fd-page .category-hero h1{font-size:2rem}
}

/* ===== 2b. Town pages (body.town-page, body.kelowna-page) ===== */
body.town-page,body.kelowna-page{font-family:var(--rp-sans);-webkit-font-smoothing:antialiased}
body.town-page h1,body.town-page h2,body.town-page h3,body.kelowna-page h1,body.kelowna-page h2,body.kelowna-page h3{font-family:var(--rp-serif);font-weight:600;letter-spacing:-.018em}
body.town-page .bw-hero h1,body.kelowna-page .bw-hero h1{font-size:clamp(2.5rem,4.6vw,4rem);line-height:1.04;text-shadow:0 2px 26px #0e1f2866}
body.town-page .bw-hero h1,body.town-page .bw-hero p,body.kelowna-page .bw-hero h1,body.kelowna-page .bw-hero p{text-wrap:balance}
body.town-page .bw-eyebrow,body.kelowna-page .bw-eyebrow{letter-spacing:.22em;font-weight:800}
body.town-page .bw-tile,body.town-page .bw-pick,body.kelowna-page .bw-tile,body.kelowna-page .bw-pick{overflow:hidden;border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1);transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease)}
body.town-page .bw-tile img,body.town-page .bw-pick img,body.kelowna-page .bw-tile img,body.kelowna-page .bw-pick img{transition:transform .9s var(--rp-ease)}
@media(hover:hover){
body.town-page .bw-tile:hover,body.town-page .bw-pick:hover,body.kelowna-page .bw-tile:hover,body.kelowna-page .bw-pick:hover{transform:translateY(-4px);box-shadow:var(--rp-shadow-3)}
body.town-page .bw-tile:hover img,body.town-page .bw-pick:hover img,body.kelowna-page .bw-tile:hover img,body.kelowna-page .bw-pick:hover img{transform:scale(1.06)}
}
body.town-page .bw-pill,body.kelowna-page .bw-pill{font-family:var(--rp-sans);font-weight:800;transition:transform .25s var(--rp-ease),box-shadow .25s var(--rp-ease)}
body.town-page .bw-pill:hover,body.kelowna-page .bw-pill:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px #14252e80}
body.town-page .bw-essentials,body.kelowna-page .bw-essentials{border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1)}

/* People who ask for less motion get none. */
@media(prefers-reduced-motion:reduce){
.rp-lift,.rp-zoom img,.rp-pill,.rp-live-dot::after,
html body.fd-page .fd-toolbar,html body.fd-page .category-banner img,html body.fd-page .card-grid > li.venue-card,html body.fd-page .card-grid > li.venue-card::before,html body.fd-page .fd-open-status::after,html body.fd-page .venue-card .venue-card-cue,
body.town-page .bw-tile,body.town-page .bw-pick,body.town-page .bw-tile img,body.town-page .bw-pick img,body.kelowna-page .bw-tile,body.kelowna-page .bw-pick,body.kelowna-page .bw-tile img,body.kelowna-page .bw-pick img{animation:none!important;transition:none!important;transform:none!important}
}
`;

const css = TOKENS + GUIDE;
// The block exactly as it is added to a page; server.js swaps it for a <link> to /styles/shared/roam-polish.css.
const block = `<style>${css}</style>`;
// Pages the guide template covers: list pages and town pages.
const COVERED = /<body[^>]*class="[^"]*\b(?:fd-page|town-page|kelowna-page)\b/;
function apply(html) {
  if (typeof html !== 'string' || !COVERED.test(html) || html.indexOf(block) !== -1) return html;
  const at = html.indexOf('</head>');
  return at === -1 ? html : html.slice(0, at) + block + '\n' + html.slice(at);
}

module.exports = { css, block, apply, TOKENS, GUIDE };
