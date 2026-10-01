'use strict';

// ---------- Build My Trip V3 page (Step 2, 2026-09-29) ----------
//
// The redesigned /trip, served only while TRIP_PLANNER_V3 is 'on' (or
// 'preview' for a browser that opted in) -- see tripPlannerV3Mode() in
// server.js. With the flag off nothing here is used and /trip is unchanged.
//
// It is a VIEW over the same deterministic planner: POST /api/trip/plan
// (trip-planner.js) picks every place; this page only shows what the API
// returned -- stop names, types, regions, ratings, review counts, prices,
// verified badges, collections and listed hours exactly as stored -- plus
// straight-line distances computed from the two stops' stored coordinates
// (and only when both have them). No AI, no new data, no invented facts.
//
// Visual language: the new homepage's (tokens.css --ref-* palette, Fraunces
// headings, Nunito text, navy pill buttons, photo cards with a soft bottom
// scrim, the navy "Build your trip" band). Everything is scoped under .t3 so
// no other page can be affected. The shared header, Trip tray and footer are
// the homepage's own (read, never modified), and /scripts/app.js is loaded
// unchanged: its .trip-btn / .fav-btn handlers run Add to Trip / Favorites.

// ---- pure helpers, shared with the browser (see CLIENT_HELPERS_SRC) ----

// Straight-line kilometres between two stored coordinates, or null.
function t3Km(a, b) {
  const ok = (v) => v && typeof v.latitude === 'number' && typeof v.longitude === 'number' && isFinite(v.latitude) && isFinite(v.longitude);
  if (!ok(a) || !ok(b)) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function t3KmText(km) {
  if (km === null || km === undefined) return null;
  if (km < 1) return 'Under 1 km apart (straight line)';
  return 'About ' + (km < 10 ? Math.round(km * 10) / 10 : Math.round(km)) + ' km (straight line)';
}
// The shareable plan state <-> a query string. Only the request text, the
// seed, the visitor's edits and their kept / removed stops -- never a fact.
//
// Stage 5A (F09, 2026-10-01): a link replays the exact plan request that
// produced the plan on screen -- its seed, settings, skipped stops (skip),
// pinned stops (pin) and avoided stops (avoid) -- and then re-applies the
// visitor's own edits on top: kept stops (keep) and removed stops (rm). The
// planner is deterministic for the same request and the same listings, so
// the recipient sees the sender's plan, including after Swap, Regenerate and
// Regenerate day. Only slot keys and venue ids are added: no names, no facts.
// Keys are written in day / daypart order so the same state is always the
// same link. Links made before Stage 5A (no pin / avoid / rm) restore exactly
// as they did before.
function t3StateToQuery(s) {
  const p = [];
  const add = (k, v) => p.push(k + '=' + encodeURIComponent(v));
  const KEY = /^[1-7]-(morning|midday|afternoon|evening)$/;
  const PARTS = ['morning', 'midday', 'afternoon', 'evening'];
  const byKey = (a, b) => (Number(a[0]) - Number(b[0])) || (PARTS.indexOf(a.slice(2)) - PARTS.indexOf(b.slice(2)));
  const id = (x) => Number.isInteger(x) && x > 0 && x < 1e9;
  const slots = (m) => Object.keys(m || {}).filter((k) => KEY.test(k) && id(m[k])).sort(byKey).map((k) => k + ':' + m[k]);
  if (s.text) add('q', s.text);
  if (s.seed) add('seed', String(s.seed));
  const o = s.overrides || {};
  if (o.days) add('days', String(o.days));
  if (o.pace) add('pace', o.pace);
  if (o.baseRegion) add('base', o.baseRegion);
  const locks = slots(s.locks);
  if (locks.length) add('keep', locks.join(','));
  const ex = (s.exclude || []).filter(id).slice(-200);
  if (ex.length) add('skip', ex.join(','));
  const pins = slots(s.pinned).slice(0, 28);
  if (pins.length) add('pin', pins.join(','));
  const avoid = (s.avoid || []).filter(id).slice(0, 200);
  if (avoid.length) add('avoid', avoid.join(','));
  const removed = Object.keys(s.removed || {}).filter((k) => KEY.test(k)).sort(byKey);
  if (removed.length) add('rm', removed.join(','));
  return p.length ? '?' + p.join('&') : '';
}
// The reverse: anything malformed is dropped (never guessed) and reported
// through `invalid`, so a damaged link still plans from its request text.
function t3QueryToState(search, regions) {
  const q = {};
  String(search || '').replace(/^\?/, '').split('&').forEach((pair) => {
    if (!pair) return;
    const i = pair.indexOf('=');
    try {
      const k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      q[k] = v;
    } catch (e) { q.__bad = '1'; }
  });
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 500) : '';
  if (!text) return null;
  let invalid = !!q.__bad;
  const ID = '[1-9]\\d{0,8}';
  const SLOT = new RegExp('^([1-7]-(?:morning|midday|afternoon|evening)):(' + ID + ')$');
  const seedOk = /^\d{1,7}$/.test(q.seed || '') && Number(q.seed) <= 1000000;
  const seed = seedOk ? Number(q.seed) : 0;
  if (q.seed !== undefined && !seedOk) invalid = true;
  const overrides = {};
  if (/^[1-7]$/.test(q.days || '')) overrides.days = Number(q.days); else if (q.days !== undefined) invalid = true;
  if (['relaxed', 'standard', 'packed'].indexOf(q.pace) !== -1) overrides.pace = q.pace; else if (q.pace !== undefined) invalid = true;
  if (q.base === 'valley' || (regions || []).indexOf(q.base) !== -1) overrides.baseRegion = q.base; else if (q.base !== undefined) invalid = true;
  const slotMap = (raw, max) => {
    if (raw === undefined) return null;
    const out = {};
    let n = 0;
    String(raw).split(',').forEach((pair) => {
      const m = SLOT.exec(pair);
      if (m && n < max) { if (!(m[1] in out)) n += 1; out[m[1]] = Number(m[2]); } else invalid = true;
    });
    return out;
  };
  const idList = (raw, max) => {
    if (raw === undefined) return [];
    const all = String(raw).split(',');
    const ok = all.filter((x) => new RegExp('^' + ID + '$').test(x)).map(Number);
    if (ok.length !== all.length || ok.length > max) invalid = true;
    return ok.slice(-max);
  };
  const locks = slotMap(q.keep, 28) || {};
  const exclude = idList(q.skip, 200);
  const pinned = slotMap(q.pin, 28);
  const avoid = idList(q.avoid, 200);
  const removed = [];
  if (q.rm !== undefined) String(q.rm).split(',').forEach((k) => { if (/^[1-7]-(morning|midday|afternoon|evening)$/.test(k)) { if (removed.indexOf(k) === -1) removed.push(k); } else invalid = true; });
  return { text, seed, overrides, locks, exclude, pinned: pinned && Object.keys(pinned).length ? pinned : null, avoid, removed, invalid };
}
// A Google Maps directions link through the given stops, in order, using
// each stop's stored name + address (the same query My Trip's route uses).
function t3MapsUrl(queries) {
  const q = (queries || []).filter(Boolean).slice(0, 10);
  if (!q.length) return null;
  if (q.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q[0]);
  let url = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(q[0]) + '&destination=' + encodeURIComponent(q[q.length - 1]);
  if (q.length > 2) url += '&waypoints=' + encodeURIComponent(q.slice(1, -1).join('|'));
  return url;
}
const CLIENT_HELPERS_SRC = [t3Km, t3KmText, t3StateToQuery, t3QueryToState, t3MapsUrl].map((fn) => fn.toString()).join('\n');

const T3_EXAMPLES = [
  'Plan me a 3-day September trip with wine, great food and golf, with one relaxed day by the lake',
  '2 days in Penticton with the kids — beaches, parks and easy food',
  'A romantic weekend in Naramata with wineries and a great dinner',
  'A dog-friendly weekend in Vernon',
  'Coffee, a hike, a winery and dinner in Kelowna',
  'What can we do around Penticton if it rains?',
];

function renderStyles() {
  return `<style>
  /* Build My Trip V3 -- scoped to .t3; homepage reference tokens only. */
  body.page-trip-v3 { background: var(--ref-cream, #F5F3ED); }
  .t3 { color: var(--ref-navy); font-family: 'Nunito', sans-serif; }
  .t3 .t3-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .t3 .t3-eyebrow { margin: 0 0 6px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ref-gold); }
  .t3 .t3-wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
  .t3 button { font-family: inherit; }
  .t3 :focus-visible { outline: 3px solid var(--ref-gold); outline-offset: 2px; }
  .t3 [hidden] { display: none !important; }

  /* Hero: the homepage's photo-with-scrim band, the composer as its focal point. */
  .t3-hero { position: relative; overflow: hidden; background: var(--ref-navy-deep); color: #fff; }
  .t3-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 40%; opacity: 0.55; }
  .t3-hero-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(16,27,36,0.35) 0%, rgba(16,27,36,0.72) 70%, rgba(16,27,36,0.9) 100%); }
  .t3-hero-inner { position: relative; z-index: 1; padding-top: 34px; padding-bottom: 44px; }
  .t3-crumb { font-size: 0.8rem; color: rgba(255,255,255,0.75); margin-bottom: 26px; }
  .t3-crumb a { color: #fff; text-decoration: none; } .t3-crumb a:hover { text-decoration: underline; }
  .t3-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(1.9rem, 4.2vw, 3rem); line-height: 1.08; letter-spacing: 0.01em; margin: 0 0 12px; color: #fff; max-width: 18ch; }
  .t3-lead { font-size: 1.02rem; line-height: 1.55; color: rgba(255,255,255,0.88); max-width: 60ch; margin: 0 0 24px; }
  .t3-composer { background: #fff; border-radius: 18px; padding: 16px 16px 12px 20px; box-shadow: 0 18px 40px -22px rgba(0,0,0,0.6); max-width: 820px; }
  .t3-composer textarea { width: 100%; border: 0; resize: vertical; min-height: 78px; font: 500 1.05rem/1.5 'Nunito', sans-serif; color: var(--ref-navy); background: transparent; padding: 4px 0; }
  .t3-composer textarea::placeholder { color: rgba(27,43,58,0.5); }
  .t3-composer textarea:focus { outline: none; }
  .t3-composer:focus-within { box-shadow: 0 0 0 3px var(--ref-gold), 0 18px 40px -22px rgba(0,0,0,0.6); }
  .t3-composer-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid rgba(27,43,58,0.1); padding-top: 10px; margin-top: 6px; }
  .t3-hint { font-size: 0.78rem; color: rgba(27,43,58,0.62); }
  .t3-submit, .t3-btn { background: var(--ref-navy); color: #fff; border: 0; border-radius: 999px; padding: 11px 22px; min-height: 44px; font-weight: 800; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
  .t3-submit:hover, .t3-btn:hover { background: var(--ref-navy-deep); }
  .t3-submit[disabled], .t3-btn[disabled], .t3-btn[aria-disabled="true"] { opacity: 0.55; cursor: default; }
  .t3-btn-ghost { background: transparent; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.25); }
  .t3-btn-ghost:hover { background: rgba(27,43,58,0.06); }
  .t3-examples { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; max-width: 900px; }
  .t3-examples-label { width: 100%; font-size: 0.8rem; color: rgba(255,255,255,0.72); margin-bottom: 2px; }
  .t3-example { background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.28); border-radius: 999px; padding: 8px 14px; min-height: 40px; font-size: 0.84rem; font-weight: 600; cursor: pointer; text-align: left; }
  .t3-example:hover { background: rgba(255,255,255,0.22); }
  .t3-status { min-height: 1.4em; margin: 14px 0 0; font-weight: 700; font-size: 0.92rem; color: #fff; }
  .t3-status.is-error { color: #FFD7A8; }

  /* How it works (before the first plan). */
  .t3-how { padding: 34px 0 56px; }
  .t3-how h2 { font-family: 'Fraunces', serif; font-size: clamp(1.25rem, 2vw, 1.5rem); color: var(--ref-navy); margin: 0 0 16px; }
  .t3-how-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 0; padding: 0; list-style: none; }
  .t3-how-grid li { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 10px 22px -18px rgba(27,43,58,0.45); font-size: 0.92rem; line-height: 1.5; }
  .t3-how-grid strong { display: block; font-family: 'Fraunces', serif; font-size: 1.02rem; margin-bottom: 4px; }
  .t3-how-num { display: inline-flex; width: 26px; height: 26px; border-radius: 999px; background: var(--ref-navy); color: #fff; font-weight: 800; font-size: 0.8rem; align-items: center; justify-content: center; margin-bottom: 8px; }

  /* Result */
  .t3-result { padding: 26px 0 64px; }
  .t3-result[aria-busy="true"] .t3-plan { opacity: 0.45; transition: opacity .15s; }
  .t3-understood { background: #fff; border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; box-shadow: 0 10px 22px -18px rgba(27,43,58,0.45); }
  .t3-understood .t3-eyebrow { color: var(--teal-deep, #1E4F4C); }
  .t3-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; align-items: center; }
  .t3-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--ref-cream); border: 1px solid rgba(27,43,58,0.12); color: var(--ref-navy); border-radius: 999px; padding: 6px 12px; font-size: 0.84rem; font-weight: 700; }
  .t3-chip select { font: inherit; font-weight: 800; color: var(--ref-navy); background: transparent; border: 0; padding: 2px 0; cursor: pointer; }
  .t3-chip-label { font-weight: 600; opacity: 0.7; }
  .t3-notused { margin: 10px 0 0; font-size: 0.84rem; color: #7A4A2A; }

  .t3-plan-head { background: var(--ref-navy); color: #fff; border-radius: 18px; padding: 24px 26px 20px; margin-bottom: 18px; position: relative; overflow: hidden; }
  .t3-plan-head .t3-eyebrow { color: var(--ref-gold); }
  .t3-request { margin: 0 0 6px; font-size: 0.86rem; color: rgba(255,255,255,0.7); overflow-wrap: anywhere; }
  .t3-headline { font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(1.45rem, 3vw, 2.1rem); line-height: 1.15; margin: 0 0 10px; color: #fff; }
  .t3-headline:focus { outline: none; } .t3-headline:focus-visible { outline: 2px solid rgba(201,162,39,0.8); outline-offset: 6px; border-radius: 4px; }
  .t3-expect { margin: 0 0 16px; font-size: 1rem; line-height: 1.6; color: rgba(255,255,255,0.9); max-width: 70ch; }
  .t3-plan-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .t3-plan-head .t3-btn { background: #fff; color: var(--ref-navy-deep); }
  .t3-plan-head .t3-btn:hover { background: var(--ref-cream); }
  .t3-plan-head .t3-btn-ghost { background: transparent; color: #fff; border-color: rgba(255,255,255,0.4); }
  .t3-plan-head .t3-btn-ghost:hover { background: rgba(255,255,255,0.12); }
  .t3-plan-status { margin: 10px 0 0; font-size: 0.88rem; color: rgba(255,255,255,0.9); min-height: 1.2em; }
  .t3-details { margin-top: 12px; font-size: 0.84rem; color: rgba(255,255,255,0.8); }
  .t3-details summary { cursor: pointer; font-weight: 700; }
  .t3-details ul { margin: 8px 0 0; padding-left: 18px; }
  .t3-warnings { background: #FFF6E6; border: 1px solid rgba(201,162,39,0.45); color: #5B4212; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px; font-size: 0.9rem; }
  .t3-warnings ul { margin: 0; padding-left: 18px; }

  .t3-daynav { position: sticky; top: 0; z-index: 20; display: flex; gap: 8px; overflow-x: auto; padding: 10px 0; margin: 0 0 8px; background: var(--ref-cream); scrollbar-width: none; }
  .t3-daynav::-webkit-scrollbar { display: none; }
  .t3-daynav a { flex: 0 0 auto; text-decoration: none; background: #fff; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.14); border-radius: 999px; padding: 8px 14px; font-weight: 800; font-size: 0.84rem; min-height: 40px; display: inline-flex; align-items: center; }
  .t3-daynav a:hover { border-color: var(--ref-navy); }

  .t3-day { margin: 0 0 30px; scroll-margin-top: 64px; }
  .t3-day-head { position: relative; border-radius: 16px; overflow: hidden; min-height: 150px; display: flex; align-items: flex-end; background: var(--ref-navy); color: #fff; margin-bottom: 14px; }
  .t3-day-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .t3-day-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 20%, rgba(16,27,36,0.85) 100%); }
  .t3-day-headin { position: relative; z-index: 1; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; width: 100%; padding: 18px 20px; }
  .t3-day-title { font-family: 'Fraunces', serif; font-size: clamp(1.3rem, 2.4vw, 1.7rem); margin: 0; color: #fff; }
  .t3-day-theme { margin: 4px 0 0; font-size: 0.88rem; font-weight: 700; color: var(--ref-gold); }
  .t3-day-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .t3-day-actions .t3-btn { background: rgba(255,255,255,0.95); color: var(--ref-navy-deep); padding: 8px 14px; min-height: 40px; font-size: 0.82rem; }
  .t3-day-actions .t3-btn:hover { background: #fff; }

  .t3-stops { list-style: none; margin: 0; padding: 0; }
  .t3-stop { display: grid; grid-template-columns: 110px 1fr; gap: 16px; }
  .t3-when { padding-top: 16px; font-weight: 800; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--teal-deep, #1E4F4C); position: relative; }
  .t3-when::after { content: ""; position: absolute; left: 6px; top: 40px; bottom: -16px; width: 2px; background: rgba(27,43,58,0.12); }
  .t3-stop:last-child .t3-when::after { display: none; }
  .t3-leg { list-style: none; margin-left: 126px; font-size: 0.8rem; font-weight: 700; color: rgba(27,43,58,0.62); padding: 8px 0 8px 4px; }
  .t3-leg::before { content: "\\2193  "; }
  .t3-card { background: #fff; border-radius: 14px; padding: 16px 18px 14px; box-shadow: 0 12px 26px -20px rgba(27,43,58,0.5); border: 1px solid rgba(27,43,58,0.06); }
  .t3-card.is-kept { border-color: var(--ref-gold); box-shadow: 0 0 0 1px var(--ref-gold), 0 12px 26px -20px rgba(27,43,58,0.5); }
  .t3-card-top { display: flex; flex-wrap: wrap; gap: 6px 10px; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(27,43,58,0.6); }
  .t3-card h4 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.22rem; margin: 4px 0 4px; line-height: 1.25; }
  .t3-card h4 a { color: var(--ref-navy); text-decoration: none; } .t3-card h4 a:hover { text-decoration: underline; }
  .t3-address { margin: 0 0 6px; font-size: 0.84rem; color: rgba(27,43,58,0.72); }
  .t3-facts { margin: 0 0 8px; font-size: 0.88rem; font-weight: 700; color: var(--ref-navy); }
  .t3-star { color: var(--ref-gold); }
  .t3-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; padding: 0; list-style: none; }
  .t3-badges li { background: rgba(42,107,103,0.1); color: var(--teal-deep, #1E4F4C); border-radius: 999px; padding: 3px 10px; font-size: 0.76rem; font-weight: 800; }
  .t3-badges li.is-collection { background: rgba(201,162,39,0.16); color: #6B5410; }
  .t3-hours { margin: 0 0 8px; font-size: 0.84rem; color: rgba(27,43,58,0.8); }
  .t3-why { margin: 0 0 6px; padding-left: 18px; font-size: 0.88rem; line-height: 1.5; }
  .t3-caveats { margin: 0 0 8px; padding: 8px 12px; list-style: none; background: #FFF6E6; border-radius: 10px; font-size: 0.82rem; color: #5B4212; }
  .t3-caveats li + li { margin-top: 4px; }
  .t3-samename { margin: 0 0 8px; font-size: 0.8rem; font-style: italic; color: #7A4A2A; }
  .t3-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(27,43,58,0.08); }
  .t3-actions .trip-btn, .t3-actions .fav-btn { min-height: 40px; }
  .t3-act { background: transparent; border: 1px solid rgba(27,43,58,0.2); color: var(--ref-navy); border-radius: 999px; padding: 7px 13px; min-height: 40px; font-size: 0.8rem; font-weight: 800; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
  .t3-act:hover { background: rgba(27,43,58,0.06); }
  .t3-act[aria-pressed="true"] { background: var(--ref-gold); border-color: var(--ref-gold); color: var(--ref-navy-deep); }
  .t3-removed { background: transparent; border: 1px dashed rgba(27,43,58,0.3); border-radius: 14px; padding: 14px 18px; font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .t3-empty { background: #fff; border-radius: 14px; padding: 16px 18px; font-size: 0.92rem; }
  .t3-section-title { font-family: 'Fraunces', serif; font-size: 1.25rem; margin: 22px 0 12px; color: var(--ref-navy); }
  .t3-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
  .t3-seeall { display: inline-block; margin-top: 18px; font-weight: 800; color: var(--ref-navy); }

  @media (max-width: 900px) {
    .t3-how-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .t3 .t3-wrap { padding: 0 16px; }
    .t3-hero-inner { padding-top: 20px; padding-bottom: 30px; }
    .t3-crumb { margin-bottom: 16px; }
    .t3-lead { font-size: 0.95rem; }
    .t3-composer { padding: 12px 12px 10px 14px; border-radius: 14px; }
    .t3-composer-foot { flex-wrap: wrap; }
    .t3-hint { width: 100%; }
    .t3-submit { width: 100%; justify-content: center; }
    .t3-stop { grid-template-columns: 1fr; gap: 6px; }
    .t3-when { padding-top: 6px; }
    .t3-when::after { display: none; }
    .t3-leg { margin-left: 0; }
    .t3-plan-head { padding: 20px 18px 16px; border-radius: 14px; }
    .t3-plan-actions .t3-btn { flex: 1 1 auto; justify-content: center; }
    .t3-day-head { min-height: 130px; }
    .t3-day-headin { padding: 14px 14px; }
  }
</style>`;
}

function renderBody(d) {
  const esc = d.esc;
  const chips = T3_EXAMPLES.map((e) => `<button type="button" class="t3-example" data-t3-example>${esc(e)}</button>`).join('\n          ');
  return `<main class="t3" id="tripV3">
  <section class="t3-hero" aria-labelledby="t3Title">
    <img class="t3-hero-img" src="/images/trip-v3/hero.webp" width="1600" height="656" alt="" fetchpriority="high">
    <div class="t3-hero-scrim"></div>
    <div class="t3-wrap t3-hero-inner">
      <nav class="t3-crumb" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; Build My Trip</nav>
      <p class="t3-eyebrow">Build My Trip</p>
      <h1 class="t3-title" id="t3Title">Tell us the trip. We&rsquo;ll map it out.</h1>
      <p class="t3-lead">Describe your Okanagan trip in your own words &mdash; how long, who&rsquo;s coming, what you love. We&rsquo;ll plan it day by day from real places on Okanagan Roam, and tell you why each one fits.</p>
      <form class="t3-composer" id="t3Form" novalidate>
        <label class="t3-sr" for="t3Input">Describe the trip you want</label>
        <textarea id="t3Input" rows="3" maxlength="500" placeholder="Plan me a 3-day September trip with wine, great food and golf, with one relaxed day by the lake."></textarea>
        <div class="t3-composer-foot">
          <span class="t3-hint">Real Okanagan Roam places only &mdash; no invented details.</span>
          <button type="submit" class="t3-submit" id="t3Submit">Plan my trip <span aria-hidden="true">&rarr;</span></button>
        </div>
      </form>
      <div class="t3-examples">
        <span class="t3-examples-label" id="t3ExamplesLabel">Or start from one of these:</span>
          ${chips}
      </div>
      <p class="t3-status" id="t3Status" role="status" aria-live="polite"></p>
    </div>
  </section>
  <section class="t3-wrap t3-how" id="t3How" aria-labelledby="t3HowTitle">
    <h2 id="t3HowTitle">How it works</h2>
    <ol class="t3-how-grid">
      <li><span class="t3-how-num">1</span><strong>Say it your way</strong>&ldquo;Three days, wine and golf, one slow day by the lake.&rdquo; Days, dates, kids, dogs and occasions all count.</li>
      <li><span class="t3-how-num">2</span><strong>Real places, real reasons</strong>Every stop is a place listed on Okanagan Roam, chosen from what we actually know about it &mdash; and we tell you why.</li>
      <li><span class="t3-how-num">3</span><strong>Make it yours</strong>Keep the stops you love, swap or remove the rest, regenerate a day and add it all to My Trip.</li>
    </ol>
  </section>
  <section class="t3-wrap t3-result" id="t3Result" hidden aria-labelledby="t3Headline"></section>
</main>`;
}

function renderScript(d) {
  return `<script>
(function(){
  'use strict';
  var form = document.getElementById('t3Form');
  if (!form) return;
  var input = document.getElementById('t3Input');
  var submitBtn = document.getElementById('t3Submit');
  var statusEl = document.getElementById('t3Status');
  var resultEl = document.getElementById('t3Result');
  var howEl = document.getElementById('t3How');
  var REGIONS = ${JSON.stringify(d.regions)};
  var REGION_SLUGS = REGIONS.map(function(r){ return r.slug; });
  var REGION_IMAGES = ${JSON.stringify(d.regionImages)};
  var TRIP_MAX_STOPS = 10; // My Trip's own limit (MAX_STOPS in /scripts/app.js)
  ${CLIENT_HELPERS_SRC}
  var state = { text: '', seed: 0, overrides: {}, locks: {}, exclude: [], removed: {}, last: null, lastReq: null };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u){ return typeof u === 'string' && u.charAt(0) === '/' && u.charAt(1) !== '/' ? u : null; }
  function setStatus(text, mode){ statusEl.textContent = text || ''; statusEl.className = 't3-status' + (mode ? ' is-' + mode : ''); }

  // ---- analytics: the same events and fixed parameters as the V2 view, plus
  // the Stage 5A (F12) V3 events: trip_plan_edit (keep / unkeep / remove /
  // undo), trip_plan_share, outbound_click for "Map this day", and the
  // 'shared_link' request type / 'invalid_share' error. Fixed values only --
  // never the request text, a venue name or a venue id. ----
  function track(name, params){ if (window.trackEvent) window.trackEvent(name, params); }
  function planFacts(p){
    var regions = ((p && p.intent && p.intent.regions) || []).filter(function(r){ return REGION_SLUGS.indexOf(r) !== -1; });
    return {
      plan_kind: (p && /^[a-z_]{1,24}$/.test(p.kind)) ? p.kind : 'unknown',
      region: regions.length === 1 ? regions[0] : (regions.length ? 'multiple' : 'none'),
      day_count: (p && p.days) ? p.days.length : 0,
    };
  }

  // ---- request ----
  function request(extra, opts){
    opts = opts || {};
    var body = { text: state.text, seed: state.seed, excludeVenueIds: state.exclude.slice(-200) };
    var o = state.overrides, ov = {};
    ['days', 'pace', 'baseRegion'].forEach(function(k){ if (o[k] !== undefined) ov[k] = o[k]; });
    if (Object.keys(ov).length) body.overrides = ov;
    for (var k in extra) body[k] = extra[k];
    var requestType = opts.requestType || 'initial';
    var trigger = opts.trigger || null;
    setStatus('Planning your trip…', 'loading');
    submitBtn.disabled = true;
    resultEl.setAttribute('aria-busy', 'true');
    if (trigger) { trigger.disabled = true; trigger.setAttribute('aria-busy', 'true'); }
    function done(){ submitBtn.disabled = false; resultEl.removeAttribute('aria-busy'); if (trigger) { trigger.disabled = false; trigger.removeAttribute('aria-busy'); } }
    return fetch('/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function(res){
        done();
        if (!res.ok) {
          setStatus(res.j && res.j.error ? res.j.error : 'Something went wrong. Please try again.', 'error');
          track('trip_plan_error', { request_type: requestType, error_type: 'response', http_status: res.status });
          return;
        }
        setStatus('');
        state.last = res.j;
        state.lastReq = { seed: body.seed, overrides: body.overrides || {}, exclude: body.excludeVenueIds, pinned: body.pinned || null, avoid: body.avoidVenueIds || [] };
        state.removed = {};
        // A shared link's removed stops (rm=): removed again, exactly as the
        // sender left them, and skipped by any later regenerate.
        (opts.removedKeys || []).forEach(function(key){
          var rs = stopAt(key);
          if (!rs) return;
          state.removed[key] = rs.venue.id;
          if (state.exclude.indexOf(rs.venue.id) === -1) state.exclude.push(rs.venue.id);
        });
        // Kept stops the planner could not keep are no longer kept.
        Object.keys(state.locks).forEach(function(key){ if (!stopAt(key) || stopAt(key).venue.id !== state.locks[key]) delete state.locks[key]; });
        render(opts.focus !== false);
        syncUrl();
        var facts = planFacts(res.j);
        facts.request_type = requestType;
        facts.stop_count = planStopButtons().length;
        track('trip_plan_complete', facts);
      })
      .catch(function(){
        done();
        setStatus('Something went wrong. Please try again.', 'error');
        track('trip_plan_error', { request_type: requestType, error_type: 'exception' });
      });
  }
  // The address bar always holds the link to the plan on screen (replaceState:
  // no extra history entries, so Back leaves the page as before). It is built
  // from the request that produced that plan -- not from a later request that
  // failed -- plus the visitor's kept and removed stops.
  function syncUrl(){
    var r = state.lastReq;
    var s = r ? { text: state.text, seed: r.seed, overrides: r.overrides, locks: state.locks, exclude: r.exclude, pinned: r.pinned, avoid: r.avoid, removed: state.removed }
      : { text: state.text, seed: state.seed, overrides: state.overrides, locks: state.locks, exclude: state.exclude };
    try { history.replaceState(null, '', '/trip' + t3StateToQuery(s)); } catch (e) {}
  }

  // ---- plan helpers ----
  function days(){ return (state.last && state.last.days) || []; }
  function stopAt(key){
    var parts = key.split('-'), d = Number(parts[0]), dp = parts[1];
    var day = days().filter(function(x){ return x.day === d; })[0];
    var s = day && day.stops.filter(function(x){ return x.daypart === dp; })[0];
    return s && s.venue ? s : null;
  }
  function currentPins(exceptKeys){
    var pins = {};
    days().forEach(function(d){ d.stops.forEach(function(s){ var k = d.day + '-' + s.daypart; if (s.venue && !state.removed[k] && (exceptKeys || []).indexOf(k) === -1) pins[k] = s.venue.id; }); });
    return pins;
  }
  function shownIds(){
    var ids = [], p = state.last || {};
    days().forEach(function(d){ d.stops.forEach(function(s){ if (s.venue) ids.push(s.venue.id); }); });
    ((p.outing && p.outing.stops) || []).forEach(function(s){ if (s.venue) ids.push(s.venue.id); });
    ((p.itinerary && p.itinerary.stops) || []).forEach(function(s){ if (s.kind !== 'event' && s.venue) ids.push(s.venue.id); });
    (p.recommendations || []).forEach(function(s){ if (s.venue) ids.push(s.venue.id); });
    return ids.slice(0, 200);
  }
  function tripQuery(v){ return v.address ? (v.name + ', ' + v.address) : (v.name + ', ' + v.regionLabel + ', Okanagan Valley, BC'); }
  function nameCounts(){
    var c = {}, p = state.last || {};
    var all = [];
    days().forEach(function(d){ d.stops.forEach(function(s){ if (s.venue) all.push(s.venue); }); });
    ((p.outing && p.outing.stops) || []).forEach(function(s){ if (s.venue) all.push(s.venue); });
    ((p.itinerary && p.itinerary.stops) || []).forEach(function(s){ if (s.venue) all.push(s.venue); });
    all.forEach(function(v){ c[v.name] = (c[v.name] || 0) + 1; });
    return c;
  }

  // ---- rendering ----
  function factsLine(v){
    var parts = [];
    if (v.rating != null) parts.push('<span class="t3-star" aria-hidden="true">★</span> ' + esc(v.rating) + (v.reviews ? ' <span class="t3-sr">from</span>(' + esc(Number(v.reviews).toLocaleString('en-CA')) + ' reviews)' : ''));
    if (v.price) parts.push('<span aria-label="Price level ' + v.price + ' of 4">' + new Array(v.price + 1).join('$') + '</span>');
    return parts.length ? '<p class="t3-facts">' + parts.join(' · ') + '</p>' : '';
  }
  function badgesHtml(v){
    var items = (v.badges || []).map(function(b){ return '<li>' + esc(b.label) + '</li>'; })
      .concat((v.collections || []).map(function(c){ return '<li class="is-collection">' + esc(c.label) + '</li>'; }));
    return items.length ? '<ul class="t3-badges" aria-label="Verified on Okanagan Roam">' + items.join('') + '</ul>' : '';
  }
  function cardHtml(stop, key, opts){
    opts = opts || {};
    var v = stop.venue, url = safeUrl(v.url), counts = opts.counts || {};
    var kept = key && state.locks[key] === v.id;
    // The listed hours are shown once, as the fact line above the reasons.
    var why = (stop.why || []).filter(function(w){ return !(v.listedHours && /^Listed hours/.test(w)) && !/\(straight line\)/.test(w); }).slice(0, 2).map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('');
    var cav = (stop.caveats || []).map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('');
    var same = counts[v.name] > 1;
    var html = '<article class="t3-card' + (kept ? ' is-kept' : '') + '" data-venue-id="' + esc(v.id) + '">'
      + '<div class="t3-card-top"><span>' + esc(v.typeLabel) + '</span><span aria-hidden="true">·</span><span>' + esc(v.regionLabel) + '</span></div>'
      + '<h4>' + (url ? '<a href="' + esc(url) + '">' + esc(v.name) + '</a>' : esc(v.name)) + '</h4>'
      + (same && v.address ? '<p class="t3-address">' + esc(v.address) + '</p>' : '')
      + factsLine(v)
      + badgesHtml(v)
      + (v.listedHours ? '<p class="t3-hours">' + esc(v.listedHours) + ' <span class="t3-sr">(</span>— check before you go<span class="t3-sr">)</span></p>' : '')
      + (why ? '<ul class="t3-why" aria-label="Why it fits">' + why + '</ul>' : '')
      + (cav ? '<ul class="t3-caveats" aria-label="Good to know">' + cav + '</ul>' : '')
      + (same ? '<p class="t3-samename">Another stop in this plan has the same name. My Trip lists places by name, so only one of them can be added there.</p>' : '')
      + '<div class="t3-actions">'
      + '<button type="button" class="trip-btn" data-trip-name="' + esc(v.name) + '" data-trip-query="' + esc(tripQuery(v)) + '" data-trip-region="' + esc(v.region) + '"' + (opts.planStop ? ' data-plan-stop' + (key ? ' data-plan-day="' + esc(key.split('-')[0]) + '"' : '') : '') + '>Add to trip</button>'
      + '<button type="button" class="fav-btn" data-fav-name="' + esc(v.name) + '">Favorite</button>';
    if (key) {
      html += '<button type="button" class="t3-act" data-t3-keep="' + esc(key) + '" aria-pressed="' + (kept ? 'true' : 'false') + '" aria-label="Keep ' + esc(v.name) + ' when regenerating">' + (kept ? 'Kept' : 'Keep') + '</button>'
        + '<button type="button" class="t3-act" data-t3-swap="' + esc(key) + '" aria-label="Swap ' + esc(v.name) + ' for another suggestion">Swap</button>'
        + '<button type="button" class="t3-act" data-t3-remove="' + esc(key) + '" aria-label="Remove ' + esc(v.name) + ' from this plan">Remove</button>';
    } else if (opts.swapId) {
      html += '<button type="button" class="t3-act" data-t3-swap-id="' + esc(v.id) + '" aria-label="Swap ' + esc(v.name) + ' for another suggestion">Swap</button>';
    }
    if (url) html += '<a class="t3-act" href="' + esc(url) + '">View details</a>';
    return html + '</div></article>';
  }
  function understoodHtml(p){
    var u = p.understood;
    if (!u) return '';
    var chips = [];
    var planKinds = p.kind === 'multi_day' || p.kind === 'day_plan';
    if (planKinds) {
      var dOpts = '';
      for (var n = 1; n <= 7; n++) dOpts += '<option value="' + n + '"' + (n === (p.days || []).length ? ' selected' : '') + '>' + n + (n === 1 ? ' day' : ' days') + '</option>';
      chips.push('<li class="t3-chip"><span class="t3-chip-label">Length</span><select data-t3-override="days" aria-label="Trip length">' + dOpts + '</select></li>');
    }
    if (!(u.route && u.route.to) && ['events', 'navigate', 'unknown'].indexOf(p.kind) === -1) {
      var cur = u.base.length === 1 ? u.base[0].slug : (u.base.length ? '' : 'valley');
      var bOpts = (u.base.length > 1 ? '<option value="" selected>' + esc(u.base.map(function(b){ return b.label; }).join(' & ')) + '</option>' : '')
        + '<option value="valley"' + (cur === 'valley' ? ' selected' : '') + '>Anywhere in the Okanagan</option>'
        + REGIONS.map(function(r){ return '<option value="' + esc(r.slug) + '"' + (cur === r.slug ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }).join('');
      chips.push('<li class="t3-chip"><span class="t3-chip-label">Where</span><select data-t3-override="baseRegion" aria-label="Where to base the plan">' + bOpts + '</select></li>');
    }
    if (planKinds) {
      var paces = [['relaxed', 'Relaxed'], ['standard', 'Balanced'], ['packed', 'Packed']];
      chips.push('<li class="t3-chip"><span class="t3-chip-label">Pace</span><select data-t3-override="pace" aria-label="Pace">' + paces.map(function(x){ return '<option value="' + x[0] + '"' + (u.pace === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></li>');
    }
    if (u.season) chips.push('<li class="t3-chip"><span class="t3-chip-label">When</span>' + esc(u.season.label) + '</li>');
    else if (u.when) chips.push('<li class="t3-chip"><span class="t3-chip-label">When</span>' + esc(u.when) + '</li>');
    if (u.occasion) chips.push('<li class="t3-chip">' + esc(u.occasion.charAt(0).toUpperCase() + u.occasion.slice(1)) + '</li>');
    (u.party || []).forEach(function(x){ chips.push('<li class="t3-chip">' + esc(x.charAt(0).toUpperCase() + x.slice(1)) + '</li>'); });
    (u.interests || []).forEach(function(x){ chips.push('<li class="t3-chip">' + esc(x.charAt(0).toUpperCase() + x.slice(1)) + '</li>'); });
    (u.themes || []).forEach(function(x){ chips.push('<li class="t3-chip"><span class="t3-chip-label">One day</span>' + esc(x) + '</li>'); });
    var notUsed = (u.notUsed || []).length ? '<p class="t3-notused">Not something we can plan around yet: ' + u.notUsed.map(function(w){ return '“' + esc(w) + '”'; }).join(', ') + '.</p>' : '';
    return '<div class="t3-understood"><p class="t3-eyebrow">Here’s what we understood</p><ul class="t3-chips">' + chips.join('') + '</ul>' + notUsed + '</div>';
  }
  function stopsListHtml(stops, keyFor, counts){
    var html = '<ol class="t3-stops">', prev = null;
    stops.forEach(function(s){
      var key = keyFor ? keyFor(s) : null;
      if (key && state.removed[key]) {
        html += '<li class="t3-stop"><div class="t3-when">' + esc(s.label) + '</div><div class="t3-removed">Removed from this plan. <button type="button" class="t3-act" data-t3-undo="' + esc(key) + '">Undo</button><button type="button" class="t3-act" data-t3-swap="' + esc(key) + '">Suggest another</button></div></li>';
        return;
      }
      if (!s.venue) {
        if (s.kind === 'event' && s.event) {
          var e = s.event, u = safeUrl(e.url);
          html += '<li class="t3-stop"><div class="t3-when">' + esc(s.label) + '</div><div><article class="t3-card"><div class="t3-card-top"><span>Event</span><span aria-hidden="true">·</span><span>' + esc([e.dateLabel, e.time, e.regionLabel].filter(Boolean).join(' · ')) + '</span></div><h4>' + (u ? '<a href="' + esc(u) + '">' + esc(e.name) + '</a>' : esc(e.name)) + '</h4>'
            + ((s.caveats || []).length ? '<ul class="t3-caveats">' + s.caveats.map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '')
            + '<div class="t3-actions">' + (e.name ? '<button type="button" class="trip-btn" data-plan-stop data-trip-name="' + esc(e.name) + '" data-trip-query="' + esc(e.name + ', ' + (e.regionLabel || 'Okanagan') + ', Okanagan Valley, BC') + '" data-trip-region="' + esc(e.region || '') + '">Add to trip</button>' : '') + (u ? '<a class="t3-act" href="' + esc(u) + '">View event</a>' : '') + '</div></article></div></li>';
          return;
        }
        html += '<li class="t3-stop"><div class="t3-when">' + esc(s.label) + '</div><div class="t3-empty">No suitable stop was found for this part of the day.</div></li>';
        return;
      }
      if (prev) {
        var km = t3KmText(t3Km(prev.venue, s.venue));
        if (km) html += '<li class="t3-leg" aria-label="Distance from the previous stop">' + esc(km) + '</li>';
      }
      html += '<li class="t3-stop"><div class="t3-when">' + esc(s.label) + '</div><div>' + cardHtml(s, key, { planStop: true, counts: counts, swapId: !key }) + '</div></li>';
      prev = s;
    });
    return html + '</ol>';
  }
  function dayHtml(d, counts){
    var img = REGION_IMAGES[d.region];
    // The day header spans the content width (16px / 32px side padding, at
    // most 1116px), so the browser picks the 640px thumbnail on phones and
    // the full-size photo on wider screens.
    var imgHtml = img ? '<img class="t3-day-img" src="' + esc(img.src) + '"' + (img.srcset ? ' srcset="' + esc(img.srcset) + '" sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1180px) calc(100vw - 64px), 1116px"' : '') + ' alt="" loading="lazy" decoding="async">' : '';
    var dayStops = d.stops.filter(function(s){ return s.venue && !state.removed[d.day + '-' + s.daypart]; });
    var maps = t3MapsUrl(dayStops.map(function(s){ return tripQuery(s.venue); }));
    return '<section class="t3-day" id="t3-day-' + d.day + '" aria-labelledby="t3-day-title-' + d.day + '">'
      + '<div class="t3-day-head">' + imgHtml + '<div class="t3-day-scrim"></div>'
      + '<div class="t3-day-headin"><div><p class="t3-eyebrow">Day ' + esc(d.day) + '</p><h3 class="t3-day-title" id="t3-day-title-' + d.day + '">' + esc(d.regionLabel || 'The Okanagan') + '</h3>'
      + (d.theme && d.theme.label ? '<p class="t3-day-theme">Planned around your ' + esc(d.theme.label) + '</p>' : '') + '</div>'
      + '<div class="t3-day-actions"><button type="button" class="t3-btn" data-t3-regen-day="' + d.day + '">Regenerate day</button>'
      + '<button type="button" class="t3-btn" data-t3-add-day="' + d.day + '">Add day to My Trip</button>'
      + (maps ? '<a class="t3-btn" href="' + esc(maps) + '" target="_blank" rel="noopener" data-t3-map-day>Map this day</a>' : '') + '</div></div></div>'
      + stopsListHtml(d.stops, function(s){ return d.day + '-' + s.daypart; }, counts)
      + '</section>';
  }
  function render(focus){
    var p = state.last;
    var counts = nameCounts();
    var planKinds = p.kind === 'multi_day' || p.kind === 'day_plan';
    var hasStops = planKinds || (p.kind === 'outing' && p.outing) || (p.kind === 'itinerary' && p.itinerary && (p.itinerary.stops || []).length);
    var regen = hasStops ? 'Regenerate plan' : ((p.kind === 'recommendations' || p.kind === 'discover') && (p.recommendations || []).length ? 'Show others' : null);
    var notes = (p.notes || []).filter(function(n){ return (p.contextNotes || []).indexOf(n) === -1; });
    var html = understoodHtml(p)
      + '<div class="t3-plan"><header class="t3-plan-head"><p class="t3-eyebrow">Your Okanagan plan</p>'
      + (state.text ? '<p class="t3-request">You asked for “' + esc(state.text) + '”</p>' : '')
      + '<h2 class="t3-headline" id="t3Headline" tabindex="-1">' + esc(p.headline || p.summary) + '</h2>'
      + (p.experience && p.experience.text ? '<p class="t3-expect">' + esc(p.experience.text) + '</p>' : '')
      + ((p.contextNotes || []).length ? '<p class="t3-expect">' + p.contextNotes.map(esc).join(' ') + '</p>' : '')
      + '<div class="t3-plan-actions">'
      + (hasStops ? '<button type="button" class="t3-btn" data-t3-add-all aria-describedby="t3PlanStatus">Add whole trip to My Trip</button>' : '')
      + (regen ? '<button type="button" class="t3-btn t3-btn-ghost" data-t3-regen>' + regen + '</button>' : '')
      + '<button type="button" class="t3-btn t3-btn-ghost" data-t3-share>Copy link to this plan</button>'
      + '<button type="button" class="t3-btn t3-btn-ghost" data-t3-view-trip hidden>View My Trip</button>'
      + '</div><p class="t3-plan-status" id="t3PlanStatus" role="status" aria-live="polite"></p>'
      + (notes.length ? '<details class="t3-details"><summary>How this plan was made</summary><ul>' + notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></details>' : '')
      + '</header>';
    var issues = (p.warnings || []).slice();
    if (issues.length) html += '<div class="t3-warnings" role="note"><ul>' + issues.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';
    if (planKinds && days().length) {
      if (days().length > 1) html += '<nav class="t3-daynav" aria-label="Jump to a day">' + days().map(function(d){ return '<a href="#t3-day-' + d.day + '">Day ' + d.day + (d.regionLabel ? ' · ' + esc(d.regionLabel) : '') + '</a>'; }).join('') + '</nav>';
      html += days().map(function(d){ return dayHtml(d, counts); }).join('');
    } else if (p.kind === 'outing' && p.outing) {
      html += '<h3 class="t3-section-title">Your outing</h3>' + stopsListHtml(p.outing.stops, function(s){ return null; }, counts);
      if ((p.outing.alternates || []).length) html += '<h3 class="t3-section-title">Other good options</h3><div class="t3-grid">' + p.outing.alternates.map(function(a){ return cardHtml(a, null, { counts: {} }); }).join('') + '</div>';
    } else if (p.kind === 'itinerary' && p.itinerary) {
      var it = p.itinerary;
      html += '<h3 class="t3-section-title">Your itinerary</h3>';
      if (it.route && it.route.regions && it.route.regions.length > 1) html += '<p class="t3-hours">' + it.route.regions.map(function(r){ return esc(r.label); }).join(' → ') + '</p>';
      html += (it.stops || []).length ? stopsListHtml(it.stops, null, counts) : '<p class="t3-empty">Nothing on Okanagan Roam matches those parts yet.</p>';
      (it.stops || []).forEach(function(s){ if ((s.alternates || []).length) html += '<h3 class="t3-section-title">Other options for ' + esc(String(s.label || '').toLowerCase()) + '</h3><div class="t3-grid">' + s.alternates.map(function(a){ return cardHtml(a, null, { counts: {} }); }).join('') + '</div>'; });
    } else if ((p.kind === 'recommendations' || p.kind === 'discover') && (p.recommendations || []).length) {
      html += '<h3 class="t3-section-title">Places that fit</h3><div class="t3-grid">' + p.recommendations.map(function(s){ return cardHtml(s, null, { counts: {} }); }).join('') + '</div>';
    } else if (p.kind === 'events') {
      var ev = p.events || [];
      html += '<h3 class="t3-section-title">What’s on</h3>' + (ev.length ? '<div class="t3-grid">' + ev.map(function(e){ var u = safeUrl(e.url); return '<article class="t3-card"><div class="t3-card-top"><span>' + esc(e.dateLabel) + (e.time ? ' · ' + esc(e.time) : '') + '</span></div><h4>' + (u ? '<a href="' + esc(u) + '">' + esc(e.name) + '</a>' : esc(e.name)) + '</h4>' + (u ? '<div class="t3-actions"><a class="t3-act" href="' + esc(u) + '">View event</a></div>' : '') + '</article>'; }).join('') + '</div>' : '<p class="t3-empty">Nothing is listed for that yet.</p>');
    } else if (p.kind === 'navigate' && p.venue && safeUrl(p.venue.url)) {
      html += '<p class="t3-empty">That’s a place on Okanagan Roam: <a class="t3-seeall" href="' + esc(p.venue.url) + '">open its page →</a></p>';
    } else {
      html += '<p class="t3-empty">Try telling us how long you have and what you’d love to do — for example “three days in Kelowna with wineries and beaches”.</p>';
    }
    if (p.seeAll && safeUrl(p.seeAll.url)) html += '<a class="t3-seeall" href="' + esc(p.seeAll.url) + '">See everything that matches on Okanagan Roam →</a>';
    html += '</div>';
    resultEl.innerHTML = html;
    resultEl.hidden = false;
    if (howEl) howEl.hidden = true;
    if (window.__syncFavButtons) window.__syncFavButtons();
    if (window.__syncTripButtons) window.__syncTripButtons();
    refreshAddAll();
    if (focus) {
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var t = document.getElementById('t3Headline');
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
  }

  // ---- My Trip (tray) -- driven through each stop's own Add to trip button ----
  function tripSize(){
    var c = document.getElementById('tripTrayCount');
    var n = c ? parseInt(c.textContent, 10) : NaN;
    if (!isNaN(n)) return n;
    try { var t = JSON.parse(window.localStorage.getItem('okanaganTrip') || '[]'); return Array.isArray(t) ? t.length : 0; } catch (e) { return 0; }
  }
  function planStopButtons(day){
    var seen = {}, out = [];
    Array.prototype.forEach.call(resultEl.querySelectorAll('.trip-btn[data-plan-stop]'), function(b){
      if (day && b.getAttribute('data-plan-day') !== String(day)) return;
      var n = b.getAttribute('data-trip-name');
      if (!n || seen[n]) return;
      seen[n] = true; out.push(b);
    });
    return out;
  }
  function stopsText(n){ return n === 1 ? '1 stop' : n + ' stops'; }
  function addState(day){
    var stops = planStopButtons(day);
    var missing = stops.filter(function(b){ return !b.classList.contains('in-trip'); }).length;
    var room = Math.max(0, TRIP_MAX_STOPS - tripSize());
    return { total: stops.length, missing: missing, room: room, state: !stops.length ? 'empty' : !missing ? 'added' : !room ? 'full' : 'ready' };
  }
  function refreshAddAll(){
    var btn = resultEl.querySelector('[data-t3-add-all]');
    if (btn) {
      var st = addState();
      btn.textContent = st.state === 'added' ? '✓ Whole trip in My Trip' : st.state === 'full' ? 'My Trip is full' : st.missing < st.total ? 'Add the remaining ' + stopsText(st.missing) + ' to My Trip' : (st.total > st.room ? 'Add ' + stopsText(st.room) + ' to My Trip (it holds ' + TRIP_MAX_STOPS + ')' : 'Add whole trip to My Trip');
      btn.setAttribute('aria-disabled', st.state === 'ready' ? 'false' : 'true');
    }
    Array.prototype.forEach.call(resultEl.querySelectorAll('[data-t3-add-day]'), function(b){
      var st = addState(b.getAttribute('data-t3-add-day'));
      b.textContent = st.state === 'added' ? '✓ Day in My Trip' : st.state === 'full' ? 'My Trip is full' : 'Add day to My Trip';
      b.setAttribute('aria-disabled', st.state === 'ready' ? 'false' : 'true');
    });
  }
  function announce(text){
    var s = document.getElementById('t3PlanStatus');
    if (!s) return;
    s.textContent = '';
    setTimeout(function(){ s.textContent = text; }, 40);
  }
  function addStops(day){
    var st = addState(day);
    if (st.state !== 'ready') {
      announce(st.state === 'added' ? 'Those stops are already in My Trip — nothing new was added.' : st.state === 'full' ? 'My Trip is full (' + TRIP_MAX_STOPS + ' stops). Remove a stop from My Trip to make room.' : 'There are no stops to add.');
      return;
    }
    var added = 0, already = 0, noRoom = 0, failed = 0;
    // Each stop is added by clicking its own Add to trip button, so app.js
    // stores it and reports add_to_trip, tagged with where it came from.
    window.__roamTripSource = day ? 'plan_day' : 'whole_trip';
    try {
      planStopButtons(day).forEach(function(b){
        if (b.classList.contains('in-trip')) { already += 1; return; }
        if (tripSize() >= TRIP_MAX_STOPS) { noRoom += 1; return; }
        var before = tripSize();
        b.click();
        if (b.classList.contains('in-trip') || tripSize() > before) added += 1; else failed += 1;
      });
    } finally { window.__roamTripSource = null; }
    if (added && !day) track('add_whole_trip', { added_count: added, already_in_trip_count: already, no_room_count: noRoom, failed_count: failed, trip_size: tripSize(), plan_kind: planFacts(state.last).plan_kind });
    refreshAddAll();
    var msg = 'Added ' + stopsText(added) + ' to My Trip.';
    if (already) msg += ' ' + (already === 1 ? '1 was' : already + ' were') + ' already there.';
    if (noRoom) msg += ' ' + stopsText(noRoom) + ' didn’t fit — My Trip holds up to ' + TRIP_MAX_STOPS + ' stops, so remove some to make room.';
    if (failed) msg += ' ' + stopsText(failed) + ' couldn’t be added. Please try again.';
    announce(msg);
    var view = resultEl.querySelector('[data-t3-view-trip]');
    if (view && added) view.hidden = false;
  }
  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('.trip-btn, .trip-remove, #tripClearBtn')) setTimeout(refreshAddAll, 0);
  });
  window.addEventListener('storage', function(ev){ if (ev.key === 'okanaganTrip') refreshAddAll(); });

  // ---- interactions ----
  resultEl.addEventListener('click', function(e){
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    var b;
    if ((b = t.closest('[data-t3-add-all]'))) { addStops(null); return; }
    if ((b = t.closest('[data-t3-add-day]'))) { addStops(b.getAttribute('data-t3-add-day')); return; }
    if ((b = t.closest('[data-t3-view-trip]'))) {
      var panel = document.getElementById('tripTrayPanel'), toggle = document.getElementById('tripTrayToggle');
      // Opened after this click has finished: app.js closes the tray on any
      // click outside it, which would otherwise include this one.
      if (panel && !panel.classList.contains('open')) { track('open_my_trip', { trip_size: tripSize(), open_source: 'plan_view_trip' }); if (toggle) setTimeout(function(){ toggle.click(); }, 0); }
      return;
    }
    if ((b = t.closest('[data-t3-map-day]'))) {
      track('outbound_click', { link_type: 'trip_day_map', surface: 'trip_planner' });
      return;
    }
    if ((b = t.closest('[data-t3-share]'))) {
      syncUrl();
      var link = location.href;
      var shared = function(method){ var f = planFacts(state.last); track('trip_plan_share', { share_method: method, plan_kind: f.plan_kind, day_count: f.day_count }); };
      var ok = function(){ announce('Link copied — anyone with it sees this plan.'); shared('clipboard'); };
      var manual = function(){ announce('Copy this link: ' + link); shared('manual'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, manual);
      else manual();
      return;
    }
    if ((b = t.closest('[data-t3-keep]'))) {
      var key = b.getAttribute('data-t3-keep'), s = stopAt(key);
      if (!s) return;
      if (state.locks[key] === s.venue.id) delete state.locks[key]; else state.locks[key] = s.venue.id;
      var on = state.locks[key] === s.venue.id;
      track('trip_plan_edit', { edit_action: on ? 'keep' : 'unkeep', plan_kind: planFacts(state.last).plan_kind });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? 'Kept' : 'Keep';
      var card = b.closest('.t3-card'); if (card) card.classList.toggle('is-kept', on);
      announce(on ? s.venue.name + ' will stay when you regenerate.' : s.venue.name + ' is no longer kept.');
      syncUrl();
      return;
    }
    if ((b = t.closest('[data-t3-remove]'))) {
      var rk = b.getAttribute('data-t3-remove'), rs = stopAt(rk);
      if (!rs) return;
      state.removed[rk] = rs.venue.id;
      delete state.locks[rk];
      track('trip_plan_edit', { edit_action: 'remove', plan_kind: planFacts(state.last).plan_kind });
      if (state.exclude.indexOf(rs.venue.id) === -1) state.exclude.push(rs.venue.id);
      render(false);
      syncUrl();
      var undo = resultEl.querySelector('[data-t3-undo="' + rk + '"]');
      if (undo) undo.focus();
      announce(rs.venue.name + ' was removed from this plan.');
      return;
    }
    if ((b = t.closest('[data-t3-undo]'))) {
      var uk = b.getAttribute('data-t3-undo'), id = state.removed[uk];
      delete state.removed[uk];
      track('trip_plan_edit', { edit_action: 'undo', plan_kind: planFacts(state.last).plan_kind });
      state.exclude = state.exclude.filter(function(x){ return x !== id; });
      render(false);
      syncUrl();
      var back = resultEl.querySelector('[data-t3-remove="' + uk + '"]');
      if (back) back.focus();
      return;
    }
    if ((b = t.closest('[data-t3-swap]'))) {
      var sk = b.getAttribute('data-t3-swap'), ss = stopAt(sk);
      if (ss && state.exclude.indexOf(ss.venue.id) === -1) state.exclude.push(ss.venue.id);
      delete state.locks[sk];
      delete state.removed[sk];
      request({ pinned: currentPins([sk]) }, { requestType: 'replace', trigger: b, focus: false });
      return;
    }
    if ((b = t.closest('[data-t3-swap-id]'))) {
      var sid = Number(b.getAttribute('data-t3-swap-id'));
      if (state.exclude.indexOf(sid) === -1) state.exclude.push(sid);
      request({}, { requestType: 'replace', trigger: b, focus: false });
      return;
    }
    if ((b = t.closest('[data-t3-regen-day]'))) {
      var dayN = Number(b.getAttribute('data-t3-regen-day'));
      var others = [], avoid = [];
      days().forEach(function(d){ d.stops.forEach(function(s){ var k = d.day + '-' + s.daypart; if (d.day !== dayN) others.push(k); else if (s.venue && state.locks[k] !== s.venue.id) avoid.push(s.venue.id); }); });
      var pins = currentPins([]);
      Object.keys(pins).forEach(function(k){ if (Number(k.split('-')[0]) === dayN && state.locks[k] !== pins[k]) delete pins[k]; });
      track('trip_plan_regenerate', { plan_kind: planFacts(state.last).plan_kind });
      state.seed += 1;
      request({ pinned: pins, avoidVenueIds: avoid }, { requestType: 'regenerate_day', trigger: b, focus: false });
      return;
    }
    if ((b = t.closest('[data-t3-regen]'))) {
      track('trip_plan_regenerate', { plan_kind: planFacts(state.last).plan_kind });
      state.seed += 1;
      var locks = {}; Object.keys(state.locks).forEach(function(k){ locks[k] = state.locks[k]; });
      var keptIds = Object.keys(locks).map(function(k){ return locks[k]; });
      var extra = { avoidVenueIds: shownIds().filter(function(id){ return keptIds.indexOf(id) === -1; }) };
      if (Object.keys(locks).length) extra.pinned = locks;
      request(extra, { requestType: 'regenerate', trigger: b });
    }
  });
  resultEl.addEventListener('change', function(e){
    var sel = e.target.closest ? e.target.closest('[data-t3-override]') : null;
    if (!sel) return;
    var k = sel.getAttribute('data-t3-override'), v = sel.value;
    if (k === 'days') state.overrides.days = Number(v);
    else if (k === 'pace') state.overrides.pace = v;
    else if (k === 'baseRegion') { if (v) state.overrides.baseRegion = v; else delete state.overrides.baseRegion; }
    // Edited settings start a fresh plan from the same words; kept stops only
    // survive when the days they sit on still exist and the base is unchanged.
    if (k !== 'pace') state.locks = {};
    state.removed = {};
    request(Object.keys(state.locks).length ? { pinned: state.locks } : {}, { requestType: 'refine', trigger: sel, focus: false });
  });
  var exampleSubmit = false;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var text = input.value.trim();
    var fromExample = exampleSubmit; exampleSubmit = false;
    if (!text) { setStatus('Tell us a little about the trip you’d like — where, how long, what you love.', 'error'); input.focus(); return; }
    state = { text: text, seed: 0, overrides: {}, locks: {}, exclude: [], removed: {}, last: null };
    track('trip_plan_start', { input_method: fromExample ? 'example' : 'typed' });
    request({}, { requestType: 'initial' });
  });
  input.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); }
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-t3-example]'), function(chip){
    chip.addEventListener('click', function(){ input.value = chip.textContent; exampleSubmit = true; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); });
  });
  // A shared link (/trip?q=...) restores the same plan: it replays the
  // sender's plan request (pin / avoid; an older link without them pins its
  // kept stops, as before), then removes the stops the sender removed. A link
  // that cannot be read at all leaves the page exactly as a plain /trip.
  var restored = t3QueryToState(location.search, REGION_SLUGS);
  if (restored) {
    input.value = restored.text;
    state = { text: restored.text, seed: restored.seed, overrides: restored.overrides, locks: restored.locks, exclude: restored.exclude, removed: {}, last: null, lastReq: null };
    track('trip_plan_start', { input_method: 'link' });
    if (restored.invalid) track('trip_plan_error', { request_type: 'shared_link', error_type: 'invalid_share' });
    var replay = {};
    if (restored.pinned) replay.pinned = restored.pinned;
    else if (Object.keys(restored.locks).length) replay.pinned = restored.locks;
    if (restored.avoid.length) replay.avoidVenueIds = restored.avoid;
    request(replay, { requestType: 'shared_link', removedKeys: restored.removed });
  } else if (/(?:^|[?&])(?:q|seed|days|pace|base|keep|skip|pin|avoid|rm)=/.test(location.search)) {
    track('trip_plan_error', { request_type: 'shared_link', error_type: 'invalid_share' });
  }
})();
</script>`;
}

// The whole page. deps: { esc, title, description, canonical, breadcrumbJson,
// headerHtml, tripTrayHtml, footerHtml, footerStyles, analyticsHead, regions,
// regionImages, preview }
function renderTripPlannerV3Page(d) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${d.esc(d.title)}</title>
<meta name="description" content="${d.esc(d.description)}">
<link rel="canonical" href="${d.canonical}">
${d.preview ? '<meta name="robots" content="noindex">\n' : ''}${d.faviconLink || ''}
<meta property="og:site_name" content="Okanagan Roam">
<meta property="og:title" content="${d.esc(d.title)}">
<meta property="og:description" content="${d.esc(d.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${d.canonical}">
<meta property="og:image" content="https://okanaganroam.com/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${d.breadcrumbJson}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/app.css">
<style>${d.footerStyles}</style>
${renderStyles()}
${d.analyticsHead}
</head>
<body class="page-trip page-trip-v3">
${d.tripTrayHtml}
<div id="floatingTooltip"></div>
${d.headerHtml}

${renderBody(d)}

${d.footerHtml}

<script src="/scripts/app.js"></script>
${renderScript(d)}
</body>
</html>`;
}

module.exports = { renderTripPlannerV3Page, t3Km, t3KmText, t3StateToQuery, t3QueryToState, t3MapsUrl, T3_EXAMPLES };
