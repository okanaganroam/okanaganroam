'use strict';
// ---------- Build My Trip V4: the simple plan view (2026-11-20, Dayton) ----------
//
// "Build my trip should be super easy and not a big wall of text. A user types what they want, we turn it into a plan,
// they swap or remove stuff, or confirm the plan, book it in one click, share it with their group chat."
//
// A preview only: /trip?v=4 (or TRIP_V4=on, off by default; see tripV4EnabledFor in server.js). It is a different VIEW of
// the same V3 page and the same planner: trip-planner-v3-page.js keeps its form, request, Swap / Remove / Undo, My Trip,
// stays, "Book my trip" step-through, Stay22 and Viator code, and calls v4Render() instead of its own render() for a
// day-by-day plan or a short outing. Nothing here runs without d.v4.
//
//   Plan    one compact row per stop: photo, start time, name, one short line (what it is, price, at most two badges that
//           answer the request). Tap the row for its hours, why it fits and its page. Swap (⇄) and Remove (✕) only.
//   Confirm one button under the plan; then the sticky bar shows the estimate, "Book my trip" and "Share".
//   Book    one button: a sheet with the checklist (the existing steps, each opening its booking in a new tab), the meals
//           with no online booking, the stay (Stay22 links as today), Viator "Book now" and the commission line.
//   Share   the phone's share sheet (WhatsApp, iMessage...) with a 3-6 line summary and the trip link; else copy.
//
// The page's SEO text, example trips and FAQ stay in the HTML; they are only hidden while a plan is on screen.

const V4_STYLES = `<style>
  /* Build My Trip V4 (2026-11-20): the simple plan view, scoped to .t3-v4. */
  .t3-v4.has-plan .t3-hero, .t3-v4.has-plan #t3How, .t3-v4.has-plan .t3-about, .t3-v4.has-plan .t3-guide { display: none; } /* .t3-guide: Whistler Roam's SEO section */
  .t3-v4.has-plan.v4-editing .t3-hero { display: block; }
  .t3-v4.has-plan.v4-editing .t3-editbar { display: none; }
  .t3-v4 .t3-result { padding-top: 18px; padding-bottom: 40px; }
  .t3-v4.has-plan .t3-result { padding-bottom: 24px; }
  .t3-v4 .v4 { max-width: 720px; margin: 0 auto; }
  .t3-v4 .v4-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: start; margin: 0 0 10px; }
  /* position + z-index 0 (round 1, 2026-11-21): app.css's sticky header rule also matches this <header>; it covered the
     site menu and took taps meant for it ("Edit request" opened instead of the menu). */
  .t3-v4 .v4-head { position: relative; z-index: 0; }
  .t3-v4 .v4-head h2 { grid-column: 1; margin: 0; font-family: 'Fraunces', 'Fraunces Fallback', serif; font-weight: 600; font-size: clamp(1.35rem, 4.6vw, 1.85rem); line-height: 1.15; color: var(--ref-navy); }
  .t3-v4 .v4-head h2:focus { outline: none; }
  .t3-v4 .v4-sub { grid-column: 1; margin: 0; font-size: 0.88rem; font-weight: 700; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-edit { grid-column: 2; grid-row: 1 / span 2; align-self: start; min-height: 40px; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.22); background: #fff; color: var(--ref-navy); font-weight: 800; font-size: 0.8rem; cursor: pointer; white-space: nowrap; }
  .t3-v4 .v4-tip { margin: 0 0 12px; font-size: 0.84rem; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .t3-plan-status { margin: 0 0 8px; font-size: 0.88rem; font-weight: 700; color: var(--ref-navy); }
  .t3-v4 .t3-plan-status:empty { display: none; }
  .t3-v4 .v4-day { margin: 0 0 18px; }
  .t3-v4 .v4-day-title { margin: 0 0 6px; font-size: 1rem; font-weight: 800; color: var(--ref-navy); }
  .t3-v4 .v4-day-title span { font-weight: 700; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-thin { margin: 0 0 8px; padding: 6px 10px; border-radius: 10px; background: #fff0cc; color: #6b4a12; font-size: 13px; line-height: 1.45; font-weight: 700; }
  .t3-v4 .v4-thin-btn { display: inline-flex; align-items: center; min-height: 44px; margin: 2px 0 2px 4px; padding: 0 12px; border: 1px solid #6b4a12; border-radius: 10px; background: #fffdf8; color: #1b303c; font: 800 13px Nunito, sans-serif; cursor: pointer; }
  .t3-v4 .v4-stops { list-style: none; margin: 0; padding: 0; background: #fff; border-radius: 16px; box-shadow: 0 1px 0 rgba(27,43,58,0.06), 0 8px 24px -18px rgba(16,27,36,0.35); overflow: hidden; }
  .t3-v4 .v4-stop { border-top: 1px solid rgba(27,43,58,0.08); }
  .t3-v4 .v4-stop:first-child { border-top: 0; }
  .t3-v4 .v4-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 8px 10px 12px; }
  .t3-v4 .v4-thumb { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; display: block; background: var(--ref-cream-deep, #EAE6D9); }
  .t3-v4 .v4-thumb--none { display: flex; align-items: center; justify-content: center; font-size: 1.3rem; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-main { display: block; min-width: 0; text-align: left; background: none; border: 0; padding: 4px 0; margin: 0; color: inherit; cursor: pointer; font: inherit; }
  .t3-v4 .v4-time { display: block; font-size: 0.76rem; font-weight: 800; letter-spacing: 0.02em; color: var(--ref-gold-ink, #8A6A0F); }
  .t3-v4 .v4-name { display: block; font-size: 1rem; font-weight: 800; line-height: 1.25; color: var(--ref-navy); overflow-wrap: anywhere; }
  .t3-v4 .v4-line { display: block; margin-top: 2px; font-size: 0.82rem; line-height: 1.35; color: var(--ref-navy-muted, #56636E); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .t3-v4 .v4-acts { display: flex; gap: 2px; }
  .t3-v4 .v4-icon { width: 44px; height: 44px; border-radius: 999px; border: 0; background: transparent; color: var(--ref-navy); font-size: 1.15rem; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .t3-v4 .v4-icon:hover { background: rgba(27,43,58,0.07); }
  .t3-v4 .v4-icon[aria-busy="true"] { opacity: 0.4; }
  .t3-v4 .v4-confirmed .v4-acts, .t3-v4 .v4-confirmed .t3-swap-note, .t3-v4 .v4-confirmed .v4-gone { display: none; }
  .t3-v4 .v4-confirmed .v4-row { grid-template-columns: 56px minmax(0, 1fr); padding-right: 12px; }
  .t3-v4 .v4-more { padding: 0 14px 12px 80px; font-size: 0.86rem; line-height: 1.45; color: var(--ref-navy); }
  .t3-v4 .v4-more p { margin: 0 0 4px; }
  .t3-v4 .v4-more ul { margin: 0 0 6px; padding-left: 18px; }
  .t3-v4 .v4-more a { color: var(--ref-navy); font-weight: 800; }
  .t3-v4 .v4-quiet { color: var(--ref-navy-muted, #56636E); }
  /* A suggested time's note on the collapsed card: one small line, the link's hit area 44px tall without adding height. */
  .t3-v4 .v4-note { margin: -6px 0 6px; padding: 0 14px 0 80px; font-size: 0.8rem; line-height: 1.45; font-weight: 700; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-note a { position: relative; white-space: nowrap; color: var(--ref-navy, #1B303C); font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
  .t3-v4 .v4-note a::after { content: ""; position: absolute; inset: -14px -6px; }
  .t3-v4 .v4-leg { list-style: none; padding: 4px 12px 4px 80px; font-size: 0.78rem; font-weight: 700; color: var(--ref-navy-muted, #56636E); background: rgba(27,43,58,0.03); }
  .t3-v4 .v4-free .v4-name, .t3-v4 .v4-gone .v4-name { font-weight: 700; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-gone .v4-name { text-decoration: line-through; }
  /* A removed stop (round 1): its name keeps the full width; Undo and Suggest another go on the line under it. */
  .t3-v4 .v4-gone .v4-row { grid-template-columns: 56px minmax(0, 1fr); }
  .t3-v4 .v4-gone .v4-acts { grid-column: 2; flex-wrap: wrap; margin: -6px 0 0 -10px; }
  .t3-v4 .v4-gone .v4-acts .v4-text { min-height: 44px; padding: 0 10px; border: 0; background: none; font-weight: 800; font-size: 0.84rem; color: var(--ref-navy); cursor: pointer; text-decoration: underline; }
  .t3-v4 .t3-swap-note { margin: 0; padding: 6px 12px 0 80px; font-size: 0.78rem; font-weight: 800; color: var(--ref-gold-ink, #8A6A0F); }
  .t3-v4 .v4-stop.is-swapped { background: rgba(201,162,39,0.10); transition: background .4s; }
  .t3-v4 .t3-edit-error { margin: 0; padding: 4px 12px 8px 80px; font-size: 0.82rem; font-weight: 700; color: #9B2C2C; }
  .t3-v4 .t3-result[aria-busy="true"] .v4-days { opacity: 0.55; transition: opacity .15s; }
  .t3-v4 .v4-confirm { margin: 18px 0 8px; text-align: center; }
  .t3-v4 .v4-confirm p { margin: 8px 0 0; font-size: 0.82rem; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 50px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--ref-navy); color: #fff; font-weight: 800; font-size: 1rem; cursor: pointer; text-decoration: none; }
  .t3-v4 .v4-btn:hover { background: var(--ref-navy-deep, #101B24); }
  .t3-v4 .v4-btn-2 { background: #fff; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.25); }
  .t3-v4 .v4-btn-2:hover { background: var(--ref-cream, #F5F3ED); }
  .t3-v4 .v4-wide { width: 100%; max-width: 420px; }
  .t3-v4 .v4-options { margin: 22px 0 0; font-size: 0.86rem; }
  .t3-v4 .v4-options > summary { cursor: pointer; font-weight: 800; color: var(--ref-navy); min-height: 44px; display: flex; align-items: center; }
  .t3-v4 .v4-options .t3-warnings, .t3-v4 .v4-options .t3-understood, .t3-v4 .v4-options .t3-sched { margin: 8px 0; }
  /* The sticky bar: Confirm first, then the estimate with Book my trip, Share and Save. */
  .t3-v4 .v4-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; background: rgba(255,255,255,0.97); border-top: 1px solid rgba(27,43,58,0.12); box-shadow: 0 -10px 28px -20px rgba(16,27,36,0.55); padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); }
  .t3-v4 .v4-bar-in { max-width: 720px; margin: 0 auto; }
  .t3-v4 .v4-bar-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 0 8px; }
  .t3-v4 .v4-est { margin: 0; font-size: 0.9rem; font-weight: 800; color: var(--ref-navy); min-width: 0; }
  .t3-v4 .v4-est small { font-weight: 700; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-bar-link { flex: none; min-height: 32px; border: 0; background: none; padding: 0; font-weight: 800; font-size: 0.82rem; color: var(--ref-navy); text-decoration: underline; cursor: pointer; }
  .t3-v4 .v4-bar-btns { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; }
  .t3-v4 .v4-bar-btns .v4-btn { padding: 0 10px; font-size: 0.95rem; }
  .t3-v4 .v4-bar-btns.v4-no-book { grid-template-columns: 1fr 1fr; }
  .t3-v4 .v4-bar .v4-disc { margin: 6px 0 0; font-size: 0.7rem; line-height: 1.35; color: var(--ref-navy-muted, #56636E); }
  /* The Book my trip sheet. */
  .t3-v4 .v4-sheet { border: 0; padding: 0; margin: auto auto 0; width: 100%; max-width: 640px; max-height: 88vh; border-radius: 20px 20px 0 0; background: #fff; color: var(--ref-navy); box-shadow: 0 -18px 50px -20px rgba(0,0,0,0.5); }
  .t3-v4 .v4-sheet::backdrop { background: rgba(16,27,36,0.5); }
  .t3-v4 .v4-sheet-in { padding: 14px 16px calc(18px + env(safe-area-inset-bottom, 0px)); overflow-y: auto; max-height: 88vh; box-sizing: border-box; }
  .t3-v4 .v4-sheet-x { position: absolute; top: 8px; right: 8px; width: 44px; height: 44px; border: 0; border-radius: 999px; background: rgba(27,43,58,0.06); font-size: 1.3rem; cursor: pointer; color: var(--ref-navy); z-index: 1; }
  .t3-v4 .v4-sheet .t3-stay { margin: 0; padding: 0; border: 0; box-shadow: none; background: transparent; }
  .t3-v4 .v4-sheet h3 { margin: 4px 48px 10px 0; font-family: 'Fraunces', 'Fraunces Fallback', serif; font-size: 1.3rem; }
  /* Rooms (2026-11-22): "Rooms  [−]  3 (assumed)  [+]" by the stay. One short row; each button's tap area is 44px
     (the card's buttons are drawn shorter and reach 44px with ::after; the sheet's are 44px themselves). */
  .t3-v4 .v4-rooms { position: relative; display: flex; align-items: center; gap: 8px; margin: 8px 0 0; font-size: 0.82rem; font-weight: 700; color: var(--ref-navy); }
  .t3-v4 .v4-rooms-step { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
  .t3-v4 .v4-rooms-now { min-width: 5.8em; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .t3-v4 .v4-rooms button { position: relative; flex: none; width: 44px; height: 32px; padding: 0; border-radius: 999px; border: 1px solid rgba(27,43,58,0.45); background: #fff; color: var(--ref-navy); font: inherit; font-size: 1.15rem; font-weight: 800; line-height: 1; cursor: pointer; }
  .t3-v4 .v4-rooms button::after { content: ''; position: absolute; inset: -7px 0; }
  .t3-v4 .v4-rooms button:focus-visible { outline: 3px solid #2f6f8f; outline-offset: 2px; }
  .t3-v4 .v4-rooms button[disabled] { opacity: 0.38; cursor: not-allowed; }
  .t3-v4 .v4-rooms-say { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
  .t3-v4 .v4-book .v4-rooms button { height: 44px; }
  .t3-v4 .v4-book .v4-rooms button::after { content: none; }
  .t3-v4 .v4-check { list-style: none; margin: 10px 0; padding: 0; border: 1px solid rgba(27,43,58,0.1); border-radius: 14px; }
  .t3-v4 .v4-check li { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 10px 6px 6px; border-top: 1px solid rgba(27,43,58,0.08); }
  .t3-v4 .v4-check li:first-child { border-top: 0; }
  .t3-v4 .v4-check .t3-book-tick { width: 32px; height: 32px; margin: 6px; border-radius: 999px; border: 2px solid rgba(27,43,58,0.35); background: #fff; font-weight: 800; cursor: pointer; color: var(--ref-navy); }
  .t3-v4 .v4-check .is-done .t3-book-tick { background: var(--ref-navy); border-color: var(--ref-navy); color: #fff; }
  .t3-v4 .v4-check-name { min-width: 0; font-weight: 800; font-size: 0.92rem; overflow-wrap: anywhere; }
  .t3-v4 .v4-check-name small { display: block; font-weight: 700; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-check a { font-weight: 800; font-size: 0.86rem; color: var(--ref-navy); white-space: nowrap; min-height: 44px; display: inline-flex; align-items: center; }
  .t3-v4 .v4-check .is-done .v4-check-name { color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-next { margin: 10px 0 4px; }
  .t3-v4 .v4-next .t3-btn { width: 100%; box-sizing: border-box; justify-content: center; min-height: 50px; font-size: 1rem; }
  .t3-v4 .v4-sheet .t3-book-est { margin: 6px 0; }
  .t3-v4 .v4-sheet-h4 { margin: 14px 0 4px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-toast { position: fixed; left: 50%; bottom: calc(160px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 45; background: var(--ref-navy-deep, #101B24); color: #fff; padding: 10px 16px; border-radius: 999px; font-weight: 800; font-size: 0.86rem; max-width: calc(100vw - 32px); box-sizing: border-box; overflow-wrap: anywhere; text-align: center; }
  .t3-v4 .t3-plan-status { overflow-wrap: anywhere; }
  .t3-v4 .v4-ask { margin: 0 0 8px; font-size: 0.86rem; font-weight: 700; color: var(--ref-navy); }
  .t3-v4 .v4-bar-btns.v4-ask-btns { grid-template-columns: 1fr 1fr auto; }
  .t3-v4 .v4-check .v4-call { white-space: nowrap; }
  /* Honest plan (2026-11-22): "I booked this" (the traveller's own note), the commission label, dated suggestions. */
  .t3-v4 .v4-check-name small .t3-book-link { min-height: 32px; padding: 4px 0; font-size: 0.82rem; font-weight: 800; text-decoration: underline; background: none; border: 0; color: var(--ref-navy); cursor: pointer; }
  .t3-v4 .v4-check-name small.v4-aff { font-weight: 600; font-size: 0.74rem; }
  .t3-v4 .v4-book-honest { margin: 10px 0 0; font-size: 0.8rem; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-sugg { margin: 14px 0 6px; padding: 12px 14px; border: 1px dashed rgba(27,43,58,0.28); border-radius: 14px; background: #FFFBF1; }
  .t3-v4 .v4-sugg-h { margin: 0 0 2px; font-size: 0.95rem; color: var(--ref-navy); }
  .t3-v4 .v4-sugg-note { margin: 0 0 8px; font-size: 0.82rem; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-sugg ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .t3-v4 .v4-sugg li { display: grid; gap: 2px; min-width: 0; }
  .t3-v4 .v4-sugg li a, .t3-v4 .v4-sugg li strong { font-weight: 800; color: var(--ref-navy); overflow-wrap: anywhere; }
  .t3-v4 .v4-sugg li small { color: var(--ref-navy-muted, #56636E); font-size: 0.82rem; }
  .t3-v4 .v4-sugg-tag { justify-self: start; padding: 2px 8px; border-radius: 999px; background: #F3E3B5; font-size: 0.74rem; font-weight: 800; color: #5A4300; }
  .t3-v4 .v4-book-unpriced { margin: 4px 0 0; font-size: 0.82rem; color: var(--ref-navy-muted, #56636E); }
  @media (min-width: 721px) {
    .t3-v4 .v4-row { grid-template-columns: 72px minmax(0, 1fr) auto; padding: 12px 10px 12px 14px; }
    .t3-v4 .v4-thumb { width: 72px; height: 72px; }
    .t3-v4 .v4-confirmed .v4-row { grid-template-columns: 72px minmax(0, 1fr); }
    .t3-v4 .v4-more, .t3-v4 .v4-note, .t3-v4 .v4-leg, .t3-v4 .t3-swap-note, .t3-v4 .t3-edit-error { padding-left: 100px; }
    .t3-v4 .v4-sheet { margin: auto; border-radius: 20px; }
  }
</style>`;

// Browser code: runs inside trip-planner-v3-page.js's page script (same scope: state, render helpers, the stays code).
const V4_CLIENT_SRC = String.raw`
  // ---------- V4: the simple plan view ----------
  var V4_TEXT = {
    en: { yourPlan: 'Your plan', edit: 'Edit request', tip: 'Tap a stop for details. Swap ⇄ or remove ✕ anything, then confirm.', tipDone: 'Plan confirmed. Nothing is booked yet: book each part, then share it with your group.',
      confirm: 'Confirm plan', confirmNote: 'You can still change it with Edit plan.', picked: 'We picked {town}. Name a town in your request to change it.', book: 'Book my trip', share: 'Share', save: 'Save', saved: 'Saved ✓', editPlan: 'Edit plan',
      note: 'Times are suggestions. Check hours before you go.', options: 'More options and notes', day: 'Day', stops1: '1 stop', stopsN: '{n} stops', days1: '1 day', daysN: '{n} days',
      swap: 'Swap {name}', remove: 'Remove {name}', removed: 'Removed', undo: 'Undo', another: 'Suggest another', details: 'See the place', why: 'Why it fits', hours: 'Hours',
      lunch: 'Lunch', dinner: 'Dinner', free: 'Free time', freeEve: 'Free evening', event: 'Event', noDinner: 'Dinner not scheduled', close: 'Close',
      sheet: 'Book your trip', next: 'Open next booking', nextOf: 'Next: {name}', allSet: 'All marked as booked ✓', progress: '{d} of {n} marked as booked', iBooked: 'I booked this', markedByYou: 'Marked by you as booked', undoBooked: 'Undo', commission: 'We may earn a commission',
      bookNote: 'You book and pay on the business’s or provider’s own site. “I booked this” is your own note: __ROAM_BRAND__ can’t see or confirm bookings.', markedNote: 'Marked by you. __ROAM_BRAND__ can’t see or confirm bookings.',
      notCounted: 'Not counted: {names}', assumed: ' (assumed)', stayOf: 'the stay ({name})', carEtc: 'getting there and a rental car', taxesEtc: 'taxes, tips and fees', tickets: 'event tickets',
      sugHead: 'Depends on your dates', sugNote: 'Not part of the plan or its bookings. Pick your dates and I’ll add what’s on.', reserve: 'Reserve by phone or on their site', noOnline: 'No online booking listed',
      toBook: 'To book', copied: 'Trip copied. Paste it into your group chat.', copyThis: 'Copy this link: ', shareTitle: 'Our trip', estFor: 'for {n}', est: 'estimate', more: '+{n} more',
      startOver: 'Start over', stay: 'Stay', addBookings: 'Add to bookings', added: 'Added', call: 'Call', contact: 'Contact', byPhone: 'Reserve by phone',
      savedReplaced: 'Saved ✓ Your trip is in My Trip.', notPriced: 'Not priced yet: {names}', freeLabel: 'Free', dogsOk: 'Dogs allowed',
      tipNoBook: 'Plan confirmed. Share it with your group or save it.' },
    fr: { yourPlan: 'Votre plan', edit: 'Modifier la demande', tip: 'Touchez un arrêt pour les détails. Remplacez ⇄ ou retirez ✕ ce que vous voulez, puis confirmez.', tipDone: 'Plan confirmé. Rien n’est encore réservé : réservez chaque partie, puis partagez-le avec votre groupe.',
      confirm: 'Confirmer le plan', confirmNote: 'Vous pourrez encore le modifier avec « Modifier le plan ».', picked: 'Nous avons choisi {town}. Nommez une ville dans votre demande pour la changer.', book: 'Tout réserver', share: 'Partager', save: 'Enregistrer', saved: 'Enregistré ✓', editPlan: 'Modifier le plan',
      note: 'Heures suggérées. Vérifiez les horaires avant de partir.', options: 'Plus d’options et notes', day: 'Jour', stops1: '1 arrêt', stopsN: '{n} arrêts', days1: '1 jour', daysN: '{n} jours',
      swap: 'Remplacer {name}', remove: 'Retirer {name}', removed: 'Retiré', undo: 'Annuler', another: 'Autre suggestion', details: 'Voir le lieu', why: 'Pourquoi ce choix', hours: 'Heures',
      lunch: 'Dîner', dinner: 'Souper', free: 'Temps libre', freeEve: 'Soirée libre', event: 'Événement', noDinner: 'Souper non planifié', close: 'Fermer',
      sheet: 'Réserver votre voyage', next: 'Ouvrir la prochaine réservation', nextOf: 'Ensuite : {name}', allSet: 'Tout est marqué comme réservé ✓', progress: '{d} sur {n} marqués comme réservés', iBooked: 'J’ai réservé', markedByYou: 'Marqué par vous comme réservé', undoBooked: 'Annuler', commission: 'Nous pouvons toucher une commission',
      bookNote: 'Vous réservez et payez sur le site de l’entreprise ou du fournisseur. « J’ai réservé » est votre propre note : __ROAM_BRAND__ ne peut ni voir ni confirmer les réservations.', markedNote: 'Marqué par vous. __ROAM_BRAND__ ne peut ni voir ni confirmer les réservations.',
      notCounted: 'Non compté : {names}', assumed: ' (supposé)', stayOf: 'l’hébergement ({name})', carEtc: 'le transport et la location d’auto', taxesEtc: 'taxes, pourboires et frais', tickets: 'billets d’événements',
      sugHead: 'Selon vos dates', sugNote: 'Hors du plan et de ses réservations. Choisissez vos dates et j’ajouterai ce qui est à l’affiche.', reserve: 'Réservez par téléphone ou sur leur site', noOnline: 'Pas de réservation en ligne indiquée',
      toBook: 'À réserver', copied: 'Voyage copié. Collez-le dans la discussion de votre groupe.', copyThis: 'Copiez ce lien : ', shareTitle: 'Notre voyage', estFor: 'pour {n}', est: 'estimation', more: '+{n} autres',
      startOver: 'Recommencer', stay: 'Hébergement', addBookings: 'Ajouter aux réservations', added: 'Ajouté', call: 'Appeler', contact: 'Coordonnées', byPhone: 'Réserver par téléphone',
      savedReplaced: 'Enregistré ✓ Votre voyage est dans Mon voyage.', notPriced: 'Prix pas encore indiqué : {names}', freeLabel: 'Gratuit', dogsOk: 'Chiens admis',
      tipNoBook: 'Plan confirmé. Partagez-le avec votre groupe ou enregistrez-le.' }
  };
  // Round 4 (2026-11-21: "Before you go" repeated "Confirm the preceding stop's timing..." for every stop): the V4 notes keep
  // only what is particular (a place closed that day, a request not included); the plan already says to check hours.
  if (typeof t3PlanNextSteps === 'function') { var t3NextAll = t3PlanNextSteps; t3PlanNextSteps = function(p){ return t3NextAll(p).filter(function(x){ return x && x.kind !== 'timing' && x.kind !== 'event_timing'; }); }; }
  function vt(k, vars){
    var s = (V4_TEXT[lang()] || V4_TEXT.en)[k] || V4_TEXT.en[k] || k;
    if (vars) Object.keys(vars).forEach(function(x){ s = s.split('{' + x + '}').join(String(vars[x])); });
    return s;
  }
  // Viator's "Add to trip" is "Add to bookings" here: one verb per action (My Trip is "Save").
  if (typeof T3_VT !== 'undefined') { T3_VT.add = { en: V4_TEXT.en.addBookings, fr: V4_TEXT.fr.addBookings }; T3_VT.added = { en: V4_TEXT.en.added, fr: V4_TEXT.fr.added }; }
  var v4 = { confirmed: false, open: {}, saved: false, ask: false, restoreConfirm: false, gone: {} };
  // EN / FR (round 1, 2026-11-21: the switch did nothing on /trip): /trip and /fr/trip are twins with no hreflang (a /trip
  // link with a plan is noindex), so app.js's setLanguage opens the other one through data-twin-path, with the address
  // bar's plan (request, edits, dates, guests, confirmed) in the query. The same plan, in the other language.
  document.documentElement.setAttribute('data-twin-path', (location.pathname + '/').indexOf('/fr/') === 0 ? '/trip' : '/fr/trip');
  // The address bar keeps the trip inputs and the confirmed state too (round 1: a reload or Back lost the dates and
  // guests, so the plan changed, and Confirm was undone). Only ids, dates and small numbers; never a name or a fact.
  function v4UrlExtra(qs){
    var o = typeof t3StayInput === 'function' ? (t3StayInput() || {}) : {}, p = [];
    if (o.arrive) p.push('arrive=' + o.arrive);
    if (o.arrive && o.leave) p.push('leave=' + o.leave);
    if (o.adults) p.push('adults=' + o.adults);
    if (o.kids) p.push('kids=' + o.kids);
    if (o.rooms) p.push('rooms=' + o.rooms);
    if (o.dog) p.push('dog=1');
    if (v4.confirmed) p.push('ok=1');
    return p.length ? (qs ? '&' : '?') + p.join('&') : '';
  }
  // The plan on screen, kept for this tab (round 3, 2026-11-21: after a Swap, a reload, Back from My Trip or EN / FR asked
  // the planner again and got a different plan, so the saved and shared trips no longer matched). Keyed by the address
  // bar's plan (the request, edits, dates and guests); Confirm is not part of the key. sessionStorage: this tab only.
  function v4CacheKey(search){ return String(search || '').replace(/^\?/, '').split('&').filter(function(x){ return x && !/^(?:ok|v)=/.test(x); }).join('&'); }
  function v4CacheSave(){
    if (!state.last) return;
    try { sessionStorage.setItem('t3v4plan', JSON.stringify({ key: v4CacheKey(location.search), last: state.last, lastReq: state.lastReq, removed: state.removed, locks: state.locks, exclude: state.exclude, gone: v4.gone, goneEvents: typeof chat !== 'undefined' && chat ? chat.goneEvents : undefined })); } catch (e) {}
  }
  function v4FromCache(){
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem('t3v4plan') || 'null'); } catch (e) { o = null; }
    if (!o || !o.last || o.key !== v4CacheKey(location.search)) return false;
    state.last = o.last; state.lastReq = o.lastReq || null; state.removed = o.removed || {}; state.locks = o.locks || {}; state.exclude = o.exclude || [];
    v4.gone = o.gone || {};
    // An event taken off the plan stays off after a reload, like a removed stop.
    if (typeof chat !== 'undefined' && chat && o.goneEvents) chat.goneEvents = o.goneEvents;
    try { render(true); } catch (e) { return false; }
    return true;
  }
  function v4RestoreInputs(search){
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function(x){ var i = x.indexOf('='); if (i > 0) q[x.slice(0, i)] = x.slice(i + 1); });
    var set = function(id, v){ var el = document.getElementById(id); if (el && v != null) el.value = v; return !!el; };
    var any = false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.arrive || '')) { any = set('t3Arrive', q.arrive) || any; if (/^\d{4}-\d{2}-\d{2}$/.test(q.leave || '') && q.leave > q.arrive) set('t3Leave', q.leave); }
    if (/^([1-9]|1[0-6])$/.test(q.adults || '')) any = set('t3Adults', q.adults) || any;
    if (/^([0-9]|1[0-2])$/.test(q.kids || '')) any = set('t3Kids', q.kids) || any;
    if (/^[1-8]$/.test(q.rooms || '')) any = set('t3Rooms', q.rooms) || any;
    if (q.dog === '1') { var dg = document.getElementById('t3Dog'); if (dg) { dg.checked = true; any = true; } }
    if (any) { var box = document.getElementById('t3StayIn'); if (box) box.open = true; }
    if (q.ok === '1') v4.restoreConfirm = true;
  }
  function v4Handles(p){
    if (!p) return false;
    if (p.kind === 'multi_day' || p.kind === 'day_plan') return (p.days || []).length > 0;
    if (p.kind === 'outing') return !!(p.outing && (p.outing.stops || []).length);
    if (p.kind === 'itinerary') return !!(p.itinerary && (p.itinerary.stops || []).length);
    return false;
  }
  function v4Main(){ return document.getElementById('tripV3'); }
  function v4Leave(){ var m = v4Main(); if (m) m.classList.remove('has-plan', 'v4-editing'); var bar = document.getElementById('v4Bar'); if (bar) bar.parentNode.removeChild(bar); document.body.style.paddingBottom = ''; }
  function v4Start(s, key){
    var rows = (state.last && state.last.schedule) || [], m = key ? /^(\d+)-/.exec(key) : null, day = m ? Number(m[1]) : null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (day != null && r.day !== day) continue;
      var hit = s.event ? r.eventId === s.event.id : (s.venue && r.venueId === s.venue.id);
      // Round 3: a tour with no departure times of its own shows the planned time and says the departure is booked.
      if (hit && r.bookDeparture) return (typeof r.startMinutes === 'number' ? clockLabel(r.startMinutes) + ' · ' : '') + (lang() === 'fr' ? 'départ à réserver' : 'book a departure time');
      // Suggested times (2026-11-23): a cinema, a class or a session runs at set times we do not hold: "around 7:45 PM".
      if (hit && typeof r.startMinutes === 'number') return (r.timing && r.timing.schedule ? (lang() === 'fr' ? 'vers ' : 'around ') : '') + clockLabel(r.startMinutes);
    }
    return '';
  }
  // The stop's schedule row (its suggested time and what is known about it: trip-timing.js).
  function v4Row(s, key){
    var rows = (state.last && state.last.schedule) || [], m = key ? /^(\d+)-/.exec(key) : null, day = m ? Number(m[1]) : null;
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (day != null && r.day !== day) continue; if (s.venue && r.venueId === s.venue.id) return r; }
    return null;
  }
  // The words for a stop that runs on a schedule we do not hold are trip-timing.js's (the one table, put here as it is).
  __TRIP_TIMING_CLIENT__
  // The collapsed card's short note for a suggested time (2026-11-22): "Suggested time · Check sessions ↗", the kind's
  // own link label as a real link to the listing's stored link (its booking link or website), else to its own page.
  // -> { html, url } | null (a walk-in place, an event and a tour with a departure get none).
  function v4Note(s, key){
    var r = s && s.venue ? v4Row(s, key) : null, tm = r && r.timing;
    if (!tm || !tm.schedule || !TT_WORDS[tm.schedule] || typeof r.startMinutes !== 'number') return null;
    var cu = tm.checkUrl && t3StayExt(tm.checkUrl), url = cu || placeUrl(s.venue) || '';
    var attrs = ' data-v4-check-times' + (cu && tm.checkVia === 'booking' ? ' data-track="booking" data-venue-id="' + esc(s.venue.id) + '"' : '');
    return { url: url, html: '<p class="v4-note">' + ttNote(tm, s.venue.name, lang() === 'fr', url, !!cu, esc, attrs) + '</p>' };
  }
  // Trip needs (2026-11-23): what this stop's own listing says for a wheelchair user and a dog, from the plan's evidence
  // (the same words as Details and the chat). note: one short line for the collapsed card, only for a stop whose
  // listing covers one section or feature or has only a mobility note; more: the lines for the opened card.
  function v4NeedLines(s){
    var out = { note: '', more: [] }, id = s && s.venue && s.venue.id, fr = lang() === 'fr';
    if (!id) return out;
    ((state.last && state.last.evidence) || []).forEach(function(e){
      if (!e || (e.ask !== 'accessible' && e.ask !== 'dog_friendly') || !Array.isArray(e.stops)) return;
      var r = e.stops.filter(function(x){ return x && x.id === id; })[0];
      if (!r) return;
      if (e.ask === 'accessible' && r.note) out.note = (fr && r.noteFr) || r.note;
      if (r.more) out.more.push((fr && r.moreFr) || r.more);
    });
    return out;
  }
  // The expanded card's time: always the planner's suggestion, never a verified slot. A stop on showtimes, classes,
  // sessions, lanes or booked slots gets no end time (a film is not an hour long) and the step to check them, with the
  // children's ages when the plan knows them (or what the listing says about ages); its listed hours that day are still
  // said, since being open is not a session being on. The link for that step is the card's note, right above (one link,
  // not two in a row). Any other stop says whether the suggested time fits its listed hours or the hours are not on file.
  function v4TimingHtml(s, id){
    var key = id && /^\d/.test(id) ? id : null, r = v4Row(s, key), fr = lang() === 'fr', t = stopTime(s, key);
    if (!r || !r.timing || typeof r.startMinutes !== 'number') return t ? '<p><strong>' + esc(t) + '</strong></p>' : '';
    var tm = r.timing, name = s.venue.name;
    if (tm.schedule && TT_WORDS[tm.schedule]) {
      var h = tm.allowMinutes ? tm.allowMinutes / 60 : 0;
      var head = (fr ? 'Heure suggérée : vers ' : 'Suggested: around ') + clockLabel(r.startMinutes) + (h ? (fr ? ', prévoyez environ ' + String(h).replace('.', ',') + ' h' : ', allow about ' + h + ' h') : '') + '.';
      var open = ttOpen(tm, fr);
      return '<p data-v4-timing="' + esc(tm.schedule) + '"><strong>' + esc(head) + '</strong> ' + esc(ttCheck(tm, name, fr)) + (open ? ' <span class="v4-quiet" data-v4-open>' + esc(open) + '</span>' : '') + '</p>';
    }
    var known = tm.hours === 'listed';
    return '<p data-v4-timing="' + (known ? 'hours' : 'unknown') + '"><strong>' + esc((fr ? 'Heure suggérée : ' : 'Suggested: ') + t) + '</strong> <span class="v4-quiet">' + esc(known ? (fr ? 'Dans ses heures indiquées.' : 'Within its listed hours.') : (fr ? 'Heures non vérifiées : à confirmer.' : 'Hours not verified: check before you go.')) + '</span></p>';
  }
  // A stop's short line: what it is (Lunch, Dinner, Winery...), its price, and at most two badges that answer the request.
  function v4Kind(s){
    var v = s.venue;
    if (/\b(?:lunch)\b/i.test(s.label || '') || (s.daypart === 'midday' && ['restaurant', 'cafe', 'pub'].indexOf(v.type) !== -1) || s.wineryLunch) return vt('lunch');
    if (['evening', 'night'].indexOf(s.daypart) !== -1 && ['restaurant', 'pub'].indexOf(v.type) !== -1) return vt('dinner');
    if (v.indoorGolf) return lang() === 'fr' ? 'Golf intérieur' : 'Indoor golf';
    return lang() === 'fr' && v.typeLabelFr ? v.typeLabelFr : frLabel('tripv3.type.' + v.type, v.typeLabel || '');
  }
  function v4Price(v){
    var fr = lang() === 'fr', c = v.cost;
    if (c && Number.isSafeInteger(c.cents) && c.cents > 0) {
      if (c.perGroup || (c.label === 'Rental' && c.unit)) return fr ? c.unitFr || c.unit || '' : c.unit || '';
      return (fr ? 'À partir de ' : 'From ') + cad(c.cents);
    }
    if (v.freeTasting) return fr ? 'Dégustation gratuite' : 'Free tasting';
    if (v.freeTour || v.freeEntry) return fr ? 'Gratuit' : 'Free';
    if (v.byDonation) return fr ? 'Contribution volontaire' : 'By donation';
    if (v.price >= 1 && v.price <= 4) return new Array(v.price + 1).join('$');
    return '';
  }
  function v4Badges(v){
    var p = state.last || {}, party = ((p.understood && p.understood.party) || []).join(' '), want = {};
    if (/dog/.test(party)) want.dog_friendly = 1;
    if (/kid/.test(party)) want.kid_friendly = 1;
    ((p.intent && p.intent.features) || []).forEach(function(f){ want[f] = 1; });
    var out = (v.badges || []).filter(function(b){ return b && want[b.key]; }).slice(0, 2).map(function(b){
      return b.key === 'dog_friendly' && v.dogsPatioOnly ? (lang() === 'fr' ? 'Chiens sur la terrasse' : 'Dogs on patio') : frLabel(BADGE_KEYS[b.key], b.label);
    });
    // Round 2 (2026-11-21): a walk, park or beach on the official dog list says so on a dog trip, like a patio does.
    if (want.dog_friendly && !(v.badges || []).some(function(b){ return b && b.key === 'dog_friendly'; }) && (v.collections || []).some(function(c){ return c && c.key === 'dog_friendly'; })) out.unshift(vt('dogsOk'));
    return out.slice(0, 2);
  }
  function v4Line(s){ return [v4Kind(s), v4Price(s.venue)].concat(v4Badges(s.venue)).filter(Boolean).join(' · '); }
  function v4Thumb(v){
    var u = v ? stopPhotoUrl(v) : null;
    return u ? '<img class="v4-thumb" src="' + esc(u) + '" alt="" width="72" height="72" loading="lazy" decoding="async">' : '<span class="v4-thumb v4-thumb--none" aria-hidden="true">•</span>';
  }
  // The planner's own hidden "Add to trip" button, one per stop: "Save" and "Share" read the plan's stops from them, and
  // app.js stores them in My Trip exactly as before.
  function v4TripBtn(v, key){
    return '<button type="button" class="trip-btn" hidden data-plan-stop' + (key ? ' data-plan-day="' + esc(key.split('-')[0]) + '"' : datedOneDay() ? ' data-plan-day="1"' : '') + (key && v.id && repeatDay(v.id, Number(key.split('-')[0])) ? ' data-trip-slot="' + esc(key.split('-')[0]) + '"' : '')
      + ' data-trip-name="' + esc(v.name) + '" data-trip-query="' + esc(tripQuery(v)) + '" data-trip-region="' + esc(v.region || '') + '"' + (v.id ? ' data-trip-ref="venue:' + esc(v.id) + '"' : '') + ' aria-pressed="false">+</button>';
  }
  function v4Details(s, id){
    var v = s.venue, url = placeUrl(v), fr = lang() === 'fr', out = '';
    out += v4TimingHtml(s, id);
    v4NeedLines(s).more.forEach(function(m){ out += '<p class="v4-need">' + esc(m) + '</p>'; });
    if (v.listedHours) out += '<p class="v4-quiet">' + esc(vt('hours')) + ' · ' + esc(v.listedHours) + '</p>';
    if (v.yearlyClosure) out += '<p>' + esc(fr ? v.yearlyClosure.fr : v.yearlyClosure.en) + '</p>';
    if (s.happyHourLine) out += '<p>' + esc(fr && s.happyHourDealsFr ? '5 à 7 : ' + s.happyHourDealsFr : s.happyHourLine) + '</p>';
    if (s.specialLine) out += '<p>' + esc(fr && s.specialsFr ? (s.specialLineLabelFr || '') + ' : ' + s.specialsFr : s.specialLine) + '</p>';
    if (s.nightLine) out += '<p>' + esc(fr && s.nightLineFr ? s.nightLineFr : s.nightLine) + '</p>';
    if (t3PickupLine(s)) out += '<p>✓ ' + esc(t3PickupLine(s)) + '</p>';
    var cav = (s.caveats || []).filter(function(c){ return !/No usable hours listed|Aucun horaire utilisable|No map location on file|emplacement.*carte|^Provisional visit|^Visite provisoire|straight line|ligne droite/i.test(c); }).slice(0, 2);
    if (cav.length) out += '<ul>' + cav.map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>';
    var why = t3WhyLines(s).filter(function(w){ return !/straight line|ligne droite/i.test(w); }).slice(0, 2);
    if (why.length) out += '<p class="v4-quiet">' + esc(vt('why')) + ' · ' + why.map(esc).join(' · ') + '</p>';
    var price = stopPriceHtml(v);
    if (/data-cost-cents="[1-9]/.test(price) || /Source|Price source/.test(price)) out += price.replace('class="t3-stop-price"', 'class="t3-stop-price v4-quiet"');
    if (url) out += '<p><a ' + hrefAttr(url) + '>' + esc(vt('details')) + ' →</a></p>';
    return out;
  }
  function v4StopHtml(s, key, counts){
    var fr = lang() === 'fr';
    if (key && state.removed[key]) {
      return '<li class="v4-stop v4-gone"><div class="v4-row">' + v4Thumb(null) + '<div class="v4-main"><span class="v4-time">' + esc(vt('removed')) + '</span><span class="v4-name">' + esc((s.venue && s.venue.name) || '') + '</span></div>'
        + '<div class="v4-acts"><button type="button" class="v4-text" data-t3-undo="' + esc(key) + '">' + esc(vt('undo')) + '</button><button type="button" class="v4-text" data-t3-swap="' + esc(key) + '">' + esc(vt('another')) + '</button></div></div></li>';
    }
    if (s.unscheduledMeal) return '<li class="v4-stop v4-free"><div class="v4-row">' + v4Thumb(null) + '<div class="v4-main"><span class="v4-name">' + esc(vt('noDinner')) + '</span></div></div></li>';
    if (!s.venue) {
      if (s.kind === 'event' && s.event) {
        if (typeof tripWorkspaceEventHtml === 'function') return tripWorkspaceEventHtml(s, key);
        var e = s.event, eu = placeUrl(e), eid = 'v4d-e' + esc(e.id);
        return '<li class="v4-stop"><div class="v4-row">' + v4Thumb(e.photo ? { photo: e.photo } : null) + '<button type="button" class="v4-main" aria-expanded="false" aria-controls="' + eid + '" data-v4-toggle="' + eid + '"><span class="v4-time">' + esc(v4Start(s, key) || e.time || '') + '</span><span class="v4-name">' + esc(e.name) + '</span><span class="v4-line">' + esc([vt('event'), e.regionLabel].filter(Boolean).join(' · ')) + '</span></button><span></span></div>'
          + '<div class="v4-more" id="' + eid + '" hidden>' + ((s.why || []).length ? '<p class="v4-quiet">' + s.why.slice(0, 2).map(esc).join(' · ') + '</p>' : '') + t3EventPlaceHtml(e, lang(), esc) + (eu ? '<p><a ' + hrefAttr(eu) + '>' + esc(vt('details')) + ' →</a></p>' : '') + '</div>'
          + '<button type="button" class="trip-btn" hidden data-plan-stop' + (key ? ' data-plan-day="' + esc(key.split('-')[0]) + '"' : '') + ' data-trip-name="' + esc(e.name) + '" data-trip-query="' + esc(e.name) + '" data-trip-region="' + esc(e.region || '') + '"' + (e.id ? ' data-trip-ref="event:' + esc(e.id) + '"' : '') + ' aria-pressed="false">+</button></li>';
      }
      if ((s.freeTime && s.freeTime.minutes > 0) || (s.freeEvening || []).length) {
        var evening = !(s.freeTime && s.freeTime.minutes > 0), fid = 'v4d-f' + esc(key || Math.random().toString(36).slice(2));
        var note = evening ? '' : String((fr ? s.freeTime.noteFr : s.freeTime.note) || '').replace(/^(?:Free time|Temps libre)\s*:\s*/, '');
        var ideas = evening ? s.freeEvening.map(function(x){ var u = placeUrl(x); return u ? '<a ' + hrefAttr(u) + '>' + esc(x.name) + '</a>' : esc(x.name); }).join(fr ? ' ou ' : ' or ') : '';
        // Round 4 (2026-11-21): no "about 5.5 h" on free time; it went wrong once stops around it moved or were left out.
        var hrs = evening ? (fr ? 'Idées pour manger' : 'Ideas to eat out') : '';
        return '<li class="v4-stop v4-free"><div class="v4-row">' + v4Thumb(null) + '<button type="button" class="v4-main" aria-expanded="false" aria-controls="' + fid + '" data-v4-toggle="' + fid + '"><span class="v4-name">' + esc(evening ? vt('freeEve') : vt('free')) + '</span>' + (hrs ? '<span class="v4-line">' + esc(hrs) + '</span>' : '') + '</button><span></span></div>'
          + '<div class="v4-more" id="' + fid + '" hidden><p>' + (note ? esc(note.charAt(0).toUpperCase() + note.slice(1)) : ideas) + '</p></div></li>';
      }
      return '';
    }
    var v = s.venue, id = key || ('s' + v.id), did = 'v4d-' + esc(id);
    // Round 2 (2026-11-21: an evening out or a day of parts had Swap only): a stop with no day slot is removed here, with Undo.
    if (!key && v4.gone[v.id]) {
      return '<li class="v4-stop v4-gone"><div class="v4-row">' + v4Thumb(null) + '<div class="v4-main"><span class="v4-time">' + esc(vt('removed')) + '</span><span class="v4-name">' + esc(v.name) + '</span></div>'
        + '<div class="v4-acts"><button type="button" class="v4-text" data-v4-undo-id="' + esc(v.id) + '">' + esc(vt('undo')) + '</button></div></div></li>';
    }
    if (typeof tripWorkspaceStopHtml === 'function') return tripWorkspaceStopHtml(s, key, counts);
    var html = '<li class="v4-stop" data-venue-id="' + esc(v.id) + '"><div class="v4-row">' + v4Thumb(v)
      + '<button type="button" class="v4-main" aria-expanded="' + (v4.open[id] ? 'true' : 'false') + '" aria-controls="' + did + '" data-v4-toggle="' + did + '" data-v4-id="' + esc(id) + '"><span class="v4-time">' + esc(v4Start(s, key)) + '</span><span class="v4-name">' + esc(v.name) + '</span><span class="v4-line">' + esc(v4Line(s)) + '</span></button>'
      + '<div class="v4-acts">'
      + (key ? (s.noSwap ? '' : '<button type="button" class="v4-icon" data-t3-swap="' + esc(key) + '" aria-label="' + esc(vt('swap', { name: v.name })) + '" title="' + esc(vt('swap', { name: v.name })) + '">⇄</button>') + '<button type="button" class="v4-icon" data-t3-remove="' + esc(key) + '" aria-label="' + esc(vt('remove', { name: v.name })) + '" title="' + esc(vt('remove', { name: v.name })) + '">✕</button>'
        : '<button type="button" class="v4-icon" data-t3-swap-id="' + esc(v.id) + '" aria-label="' + esc(vt('swap', { name: v.name })) + '" title="' + esc(vt('swap', { name: v.name })) + '">⇄</button><button type="button" class="v4-icon" data-v4-remove-id="' + esc(v.id) + '" aria-label="' + esc(vt('remove', { name: v.name })) + '" title="' + esc(vt('remove', { name: v.name })) + '">✕</button>')
      + '</div></div>' + (v4Note(s, key) || { html: '' }).html
      + '<div class="v4-more" id="' + did + '"' + (v4.open[id] ? '' : ' hidden') + '>' + v4Details(s, id) + '</div>'
      + v4TripBtn(v, key) + '</li>';
    return html;
  }
  function v4ListHtml(stops, keyFor, counts){
    var html = '<ol class="v4-stops">', prev = null;
    stops.forEach(function(s){
      var key = keyFor ? keyFor(s) : null;
      // Round 2 (2026-11-21): no "Drive from Whistler Blackcomb to Whistler" after a lunch on the hill or between two places
      // in the same village (you ski down or walk).
      var near = prev && prev.venue && typeof t3Km === 'function' ? t3Km(prev.venue, s.venue) : null;
      var skiLeg = !!(prev && (prev.skiDay || prev.onHill)) || !!(s.skiDay || s.onHill);
      if (s.venue && prev && s.driveFrom && !(key && state.removed[key]) && !skiLeg && !(near !== null && near < 2.5)) html += '<li class="v4-leg">' + esc(t3DriveText(s.driveFrom, lang())) + '</li>';
      html += v4StopHtml(s, key, counts);
      if (s.venue && !(key && state.removed[key])) prev = s;
    });
    return html + '</ol>';
  }
  // Honest plan (2026-11-22): with no dates chosen an event is not a stop of "day 3". It is offered here with its own real
  // date ("Suggestion · Tue Nov 24 only"), outside the days, the booking steps and the shared stops.
  function v4SuggestionsHtml(p, fr){
    var list = (p.dateSuggestions || []).filter(function(x){ return x && x.name; }).slice(0, 2);
    if (!list.length) return '';
    return '<section class="v4-sugg" aria-labelledby="v4SuggHead"><h3 class="v4-sugg-h" id="v4SuggHead">' + esc(vt('sugHead')) + '</h3><p class="v4-sugg-note">' + esc(vt('sugNote')) + '</p><ul>' + list.map(function(x){
      var u = safeUrl((fr && x.urlFr) || x.url), meta = [(fr && x.timeFr) || x.time, x.venueName].filter(Boolean).join(' · ');
      return '<li data-v4-suggestion="' + esc(x.id) + '"><span class="v4-sugg-tag">' + esc((fr && x.labelFr) || x.label) + '</span>' + (u ? '<a ' + hrefAttr(u) + '>' + esc(x.name) + '</a>' : '<strong>' + esc(x.name) + '</strong>') + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</li>';
    }).join('') + '</ul></section>';
  }
  function v4DayDate(day){
    var rows = (state.last && state.last.schedule) || [];
    var r = rows.filter(function(x){ return x.day === day.day && /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''); })[0];
    var iso = day.date || (r && r.date);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(iso + 'T12:00:00Z').toLocaleDateString(lang() === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  }
  function v4Count(p){
    var n = 0;
    // An event taken off the plan (the chat page's ✕ / Remove) is not counted ("6 stops" stood over 5).
    var goneEv = typeof chat !== 'undefined' && chat && chat.goneEvents ? chat.goneEvents : {};
    var evOn = function(s){ return s.kind === 'event' && s.event && !goneEv[s.event.id]; };
    (p.days || []).forEach(function(d){ d.stops.forEach(function(s){ if (s.venue ? !state.removed[d.day + '-' + s.daypart] : evOn(s)) n++; }); });
    ((p.outing && p.outing.stops) || (p.itinerary && p.itinerary.stops) || []).forEach(function(s){ if (s.venue ? !v4.gone[s.venue.id] : evOn(s)) n++; });
    return n;
  }
  // ---- booking: the same steps as the stays box ("Book my trip"), in a sheet ----
  function v4Fallback(){ var b = state.last && state.last.v4Booking; return b && !t3StayData() ? b : null; }
  function v4Estimate(){ var d = t3StayData(); if (d) return d.chosen.estimate || d.w.estimate || null; var b = v4Fallback(); return b ? b.estimate : null; }
  function v4EstimateText(){
    var e = v4Estimate(), fr = lang() === 'fr';
    if (!e || !e.parts || !e.parts.length) return '';
    if (e.showTotal) { var h = t3EstimateHead(e, fr); return '<strong>' + esc(h.amount) + '</strong> <small>' + esc(h.tag) + '</small>'; }
    var lo = 0, hi = 0, ok = true;
    e.parts.forEach(function(x){ if (x.low === null || x.high === null) ok = false; else { lo += x.low; hi += x.high; } });
    if (!ok || !hi) return '';
    return '<strong>' + esc((fr ? 'Environ ' : 'About ') + t3Range(lo, hi, fr) + ' ' + vt('estFor', { n: e.people }) + (e.peopleAssumed ? vt('assumed') : '')) + '</strong> <small>' + esc(t3EstimateHead(e, fr).tag) + '</small>';
  }
  // Meals in the plan with no online booking (a dinner the restaurant takes by phone): listed under the steps with a link to
  // the place's page (its phone and website), so a dinner is never missing from "Book my trip".
  function v4ReserveRows(steps){
    var ids = {}, out = [], seen = {};
    steps.forEach(function(x){ if (x && x.id) ids[x.id] = 1; });
    days().forEach(function(d){ d.stops.forEach(function(s){
      if (!s.venue || state.removed[d.day + '-' + s.daypart] || ids[s.venue.id] || seen[s.venue.id]) return;
      if (['restaurant', 'pub'].indexOf(s.venue.type) === -1 || !(['evening', 'night'].indexOf(s.daypart) !== -1 || /dinner|supper/i.test(s.label || ''))) return;
      seen[s.venue.id] = 1; out.push({ s: s, day: d.day });
    }); });
    // Round 2 (2026-11-21: a date night's dinner was not in "Book my trip"): an evening out's or a day of parts' restaurant.
    var p = state.last || {};
    ((p.outing && p.outing.stops) || (p.itinerary && p.itinerary.stops) || []).forEach(function(s){
      if (!s.venue || v4.gone[s.venue.id] || ids[s.venue.id] || seen[s.venue.id] || s.venue.type !== 'restaurant') return;
      seen[s.venue.id] = 1; out.push({ s: s, day: 0 });
    });
    return out;
  }
  function v4BookCardHtml(){
    var fr = lang() === 'fr', d = t3StayData(), steps = t3BookSteps();
    var keySteps = steps.filter(function(x){ return x.kind !== 'viator'; });
    var key = d ? t3BookKeyFor(d.chosen, d.w, keySteps) : 't3book:v4:' + keySteps.map(function(x){ return x.kind.charAt(0) + x.id; }).join('.');
    if (key !== bookKey) { bookKey = key; bookState = t3BookLoad(key); }
    var html = '<section class="t3-stay t3-book v4-book" data-t3-stay aria-labelledby="t3StayHead"><h3 id="t3StayHead" tabindex="-1">' + esc(vt('sheet')) + '</h3>';
    if (d) {
      var s = d.chosen, t = d.w.trip || {}, u = safeUrl((fr && s.urlFr) || s.url), facts = [t3StayFacts(s, fr), t3StayTripLine(t, fr)].filter(Boolean).join(' · ');
      html += '<div class="t3-book-stay">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="" loading="lazy" width="96" height="96">' : '<span class="t3-stay-nophoto" aria-hidden="true"></span>')
        + '<div class="t3-book-stay-txt"><p class="t3-stay-kicker">' + esc((fr ? 'Où dormir · ' : 'Where to stay · ') + [fr ? (s.kindFr || s.kind) : s.kind, s.regionLabel].filter(Boolean).join(' · ')) + '</p>'
        + '<p class="t3-stay-name">' + (u ? '<a ' + hrefAttr(u) + '>' + esc(s.name) + '</a>' : esc(s.name)) + '</p>' + (facts ? '<p class="t3-stay-facts">' + esc(facts) + '</p>' : '') + t3LiveHtml(s, fr) + '</div>'
        + (d.others.length ? '<button type="button" class="t3-book-link t3-book-change" data-t3-stay-change aria-expanded="false" aria-controls="t3StayAlts">' + esc(fr ? 'Changer' : 'Change') + '</button>' : '') + '</div>' + v4RoomsHtml(fr);
      // Trip dates (2026-11-23): the stay's own dates (proposed until a yes; then what the links carry).
      html += t3StayDatesHtml(t, fr, s);
      if (d.others.length) html += '<ul class="t3-stay-alts" id="t3StayAlts" hidden>' + d.others.map(function(o){
        var ou = safeUrl((fr && o.urlFr) || o.url), of = t3StayFacts(o, fr), why = (o.reasons || [])[0];
        return '<li class="t3-stay-alt"><div><p><strong>' + (ou ? '<a ' + hrefAttr(ou) + '>' + esc(o.name) + '</a>' : esc(o.name)) + '</strong></p><p>' + esc([o.regionLabel, of, why ? (fr ? why.textFr : why.text) : ''].filter(Boolean).join(' · ')) + '</p></div><button type="button" class="t3-btn t3-btn-ghost" data-t3-stay-choose="' + esc(o.id) + '">' + esc(fr ? 'Choisir' : 'Choose') + '</button></li>';
      }).join('') + '</ul>';
    }
    var e = v4Estimate();
    if (e) html += v4EstimateHtml(e, fr, d ? d.chosen : null);
    var st = bookState.st || {}, next = -1, done = 0;
    steps.forEach(function(x, n){ if (st[n] === 'done') done++; if (next < 0 && !st[n]) next = n; });
    if (steps.length) {
      html += '<p class="v4-sheet-h4">' + esc(done ? vt('progress', { d: done, n: steps.length }) : vt('toBook')) + '</p><ol class="v4-check">' + steps.map(function(x, n){
        var mark = st[n], name = x.kind === 'stay' ? vt('stay') + ' · ' + x.name : ((fr && x.nameFr) || x.name);
        var verb = x.kind === 'stay' ? (fr ? ((d && d.chosen.bookingLinks[0]) || {}).shortFr || 'Réserver' : ((d && d.chosen.bookingLinks[0]) || {}).short || 'Book') : t3StepVerb(x, fr);
        return '<li class="' + (mark === 'done' ? 'is-done' : n === next ? 'is-next' : '') + '"><button type="button" class="t3-book-tick" data-t3-bk-toggle="' + n + '" aria-pressed="' + (mark === 'done' ? 'true' : 'false') + '" aria-label="' + esc(vt('iBooked') + (fr ? ' : ' : ': ') + name) + '">' + (mark === 'done' ? '✓' : mark === 'skipped' ? '–' : '') + '</button>'
          + '<span class="v4-check-name">' + esc(name)
          + '<small class="v4-mine">' + (mark === 'done' ? esc(vt('markedByYou')) + ' · <button type="button" class="t3-book-link" data-t3-bk-toggle="' + n + '" data-v4-unbook>' + esc(vt('undoBooked')) + '</button>' : '<button type="button" class="t3-book-link" data-t3-bk-toggle="' + n + '" data-v4-booked>' + esc(vt('iBooked')) + '</button>') + '</small>'
          + (x.affiliate ? '<small class="v4-aff">' + esc(vt('commission')) + '</small>' : '') + '</span>' + t3StepLinkHtml(x, '', verb, n) + '</li>';
      }).join('') + '</ol>';
      html += next >= 0 ? '<div class="v4-next">' + t3StepLinkHtml(steps[next], 't3-btn t3-book-main', done ? vt('nextOf', { name: steps[next].kind === 'stay' ? vt('stay') : ((fr && steps[next].nameFr) || steps[next].name) }) : vt('next'), next) + '</div>'
        : '<p class="v4-sheet-h4">' + esc(vt('allSet')) + ' <button type="button" class="t3-book-link" data-t3-bk-restart>' + esc(vt('startOver')) + '</button></p>';
      if (d) html += t3StayNotesHtml(d.chosen, d.w.trip || {}, fr);
    }
    // Honest plan (2026-11-22): said once in the sheet. Nothing here is a confirmed booking.
    // Trip needs (2026-11-23): what the listings leave to confirm for a wheelchair user and a dog, in the summary's own
    // short words (the full sentences are under Details and on each stop), so the checklist says the same thing.
    try {
      var needFacts = (typeof tripSummaryFacts === 'function' ? tripSummaryFacts(state.last, lang() === 'fr', { removed: typeof v4RemovedIds === 'function' ? v4RemovedIds() : {} }) : []).filter(function(f){ return f && f.kind === 'flag' && (f.ask === 'accessible' || f.ask === 'dog_friendly'); });
      if (needFacts.length) html += '<p class="t3-book-note v4-book-honest" data-v4-book-needs>' + esc((lang() === 'fr' ? 'À confirmer auprès de chaque endroit : ' : 'To confirm with each place: ') + needFacts.map(function(f){ return f.text; }).join('. ') + '.') + '</p>';
    } catch (e) { /* the sheet stands without the line */ }
    if (steps.length || v4ReserveRows(steps).length) html += '<p class="t3-book-note v4-book-honest" data-v4-book-note>' + esc(vt('bookNote')) + '</p>';
    var reserve = v4ReserveRows(steps);
    if (reserve.length) html += '<p class="v4-sheet-h4">' + esc(vt('reserve')) + '</p><ol class="v4-check">' + reserve.map(function(r){
      var u = placeUrl(r.s.venue), tel = v4Tel(r.s.venue.phone);
      // Round 1 (2026-11-21): a Call link straight from the sheet when the place lists a phone, else its page.
      return '<li><span aria-hidden="true" style="text-align:center">☎</span><span class="v4-check-name">' + esc(r.s.venue.name) + '<small>' + esc((r.day ? vt('day') + ' ' + r.day + ' · ' : '') + (tel ? vt('byPhone') + ' · ' + r.s.venue.phone : vt('noOnline'))) + '</small></span>'
        + (tel ? '<a class="v4-call" href="' + esc(tel) + '" data-track="booking" data-venue-id="' + esc(r.s.venue.id) + '">' + esc(vt('call')) + '</a>' : u ? '<a ' + hrefAttr(u) + '>' + esc(vt('contact')) + '</a>' : '<span></span>') + '</li>';
    }).join('') + '</ol>';
    // Suggested times (2026-11-23): the stops that run on showtimes, classes or sessions we do not hold, each with
    // its suggested time and the step to check it (never shown as a booked slot).
    var timed = [];
    days().forEach(function(dd){ dd.stops.forEach(function(s){
      if (!s.venue || state.removed[dd.day + '-' + s.daypart]) return;
      var r = v4Row(s, dd.day + '-' + s.daypart);
      if (r && r.timing && r.timing.schedule && TT_WORDS[r.timing.schedule] && typeof r.startMinutes === 'number') timed.push({ s: s, r: r, day: dd.day });
    }); });
    if (timed.length) html += '<p class="v4-sheet-h4" data-v4-times-h>' + esc(fr ? 'Horaires à vérifier' : 'Times to check') + '</p><ol class="v4-check" data-v4-times>' + timed.map(function(x){
      var tm = x.r.timing, cu = tm.checkUrl && t3StayExt(tm.checkUrl), pu = placeUrl(x.s.venue), why = ttWhy(tm.schedule, fr), ages = ttAgeShort(tm, fr);
      // One short line: the day, the suggested time, why it must be checked, and the age line when there are children.
      return '<li><span aria-hidden="true" style="text-align:center">◷</span><span class="v4-check-name">' + esc(x.s.venue.name) + '<small>' + esc(vt('day') + ' ' + x.day + ' · ' + (fr ? 'suggéré vers ' : 'suggested around ') + clockLabel(x.r.startMinutes) + ' · ' + why.charAt(0).toLowerCase() + why.slice(1) + (ages ? ' · ' + ages : '')) + '</small></span>'
        + (cu ? '<a ' + hrefAttr(cu) + ' target="_blank" rel="nofollow noopener"' + (tm.checkVia === 'booking' ? ' data-track="booking" data-venue-id="' + esc(x.s.venue.id) + '"' : '') + '>' + esc(ttLink(tm.schedule, fr)) + ' <span aria-hidden="true">↗</span></a>' : pu ? '<a ' + hrefAttr(pu) + '>' + esc(vt('details')) + '</a>' : '<span></span>') + '</li>';
    }).join('') + '</ol>';
    if (typeof t3ViatorBlockHtml === 'function') html += t3ViatorBlockHtml(fr, true);
    var aff = steps.some(function(x){ return x.affiliate; }) || (typeof t3ViatorShown === 'function' && t3ViatorShown()) || !!(d && ((d.chosen.bookingLinks || []).some(function(l){ return l && l.affiliate; }) || (d.chosen.livePrices && t3StayExt(d.chosen.livePrices.url))));
    if (aff) html += '<p class="t3-stay-disclosure" data-stay-disclosure>' + esc(fr ? T3_STAY_DISCLOSURE.fr : T3_STAY_DISCLOSURE.en) + '</p>';
    return html + '</section>';
  }
  function v4Tel(phone){
    var d = String(phone || '').replace(/[^0-9+]/g, '');
    if (/^\+?1?\d{10}$/.test(d)) return 'tel:+1' + d.replace(/^\+?1?/, '').slice(-10);
    return /^\+\d{8,15}$/.test(d) ? 'tel:' + d : '';
  }
  // The estimate (round 1, 2026-11-21: "Activities Free" while bowling, the pool and lift tickets had no price): a part
  // that adds up to $0 is left out of the line while some stops have no listed price, and those stops are named under it.
  function v4EstimateHtml(e, fr, chosen){
    var shownNames = v4ShownNames(), unknown = (e.unknown || []).filter(function(n){ return !shownNames || shownNames[n]; });
    var parts = (e.parts || []).filter(function(x){ return !(unknown.length && x && x.low === 0 && x.high === 0); });
    var e2 = {}; Object.keys(e).forEach(function(k){ e2[k] = e[k]; });
    e2.parts = parts; e2.unknown = [];
    var html = t3EstimateHtml(e2, fr, chosen) || (unknown.length ? '<div class="t3-book-est"></div>' : '');
    if (unknown.length) html = html.replace(/<\/div>$/, '') + '<p class="v4-book-unpriced">' + esc(vt('notPriced', { names: unknown.slice(0, 6).join(', ') + (unknown.length > 6 ? ' ' + vt('more', { n: unknown.length - 6 }) : '') })) + '</p></div>';
    // Honest plan (2026-11-22): never a bare total. What the figure leaves out, by name.
    if (html) {
      var out = [], hasStay = (e.parts || []).some(function(x){ return x && x.key === 'stay'; }), d0 = t3StayData();
      if (!hasStay && chosen && chosen.name) out.push(vt('stayOf', { name: chosen.name }));
      if ((state.last && state.last.days || []).some(function(d){ return (d.stops || []).some(function(s){ return s && s.kind === 'event'; }); })) out.push(vt('tickets'));
      out.push(vt('carEtc')); out.push(vt('taxesEtc'));
      html = html.replace(/<\/div>$/, '') + '<p class="v4-book-unpriced" data-v4-not-counted>' + esc(vt('notCounted', { names: out.join(', ') })) + '</p></div>';
      // A partial estimate says who it is for too ("Known costs so far for 6 people").
      if (!e.showTotal) html = html.replace(/(<strong>)(Known costs so far|Coût connu jusqu’ici)(<\/strong>)/, function(m, a, b, c){ return a + b + (fr ? ' pour ' + e.people + (e.people > 1 ? ' personnes' : ' personne') : ' for ' + e.people + (e.people > 1 ? ' people' : ' person')) + c; });
      if (e.peopleAssumed) html = html.replace(/( (?:for|pour) \d+ (?:people|person|personnes?))(<\/strong>)/, '$1' + esc(vt('assumed')) + '$2');
      // Rooms (2026-11-22): the rooms the links carry, said with the party. The figures are not changed by it.
      var rl = d0 ? t3RoomsLabel(d0.w.trip || {}, fr) : '';
      // A priced stay is priced by the listing's own "sleeps" (trip-booking.js), never by the rooms picked here: when
      // the two differ, the figure says which it is for.
      var sp = (e.parts || []).filter(function(x){ return x && x.key === 'stay'; })[0], rs = v4RoomsState();
      if (sp && rs && sp.rooms >= 1 && sp.rooms !== rs.rooms) html = html.replace(/<\/div>$/, '') + '<p class="v4-book-unpriced" data-v4-est-rooms>' + esc(fr ? 'Le montant de l’hébergement vaut pour ' + sp.rooms + (sp.rooms > 1 ? ' chambres ou unités' : ' chambre ou unité') + ', pas les ' + rs.rooms + ' de vos liens : le site de réservation donne le vrai prix.' : 'The stay figure is for ' + sp.rooms + (sp.rooms > 1 ? ' rooms or units' : ' room or unit') + ', not the ' + rs.rooms + ' in your links: the booking site has the real price.') + '</p></div>';
      if (rl && !e.showTotal) html = html.replace(/((?:Known costs so far|Coût connu jusqu’ici) (?:for|pour) \d+ (?:people|person|personnes?)(?: \((?:assumed|supposé)\))?)(<\/strong>)/, '$1 · ' + esc(rl) + '$2');
    }
    return html;
  }
  // Agent hooks (2026-11-22; House of Lager was in the Book sheet right after it was removed): a stop the visitor took
  // out of the plan is not a booking step.
  // Round 5 (2026-11-22: after "add a night in Penticton" the sheet listed "Shelter Floating Sauna — Book" and "Not priced
  // yet: … Shelter Floating Sauna" with no such stop on the plan): the sheet is built only from the stops on screen.
  function v4ShownIds(){
    var ids = {}, p = state.last || {}, gone = v4RemovedIds(), any = false;
    (p.days || []).forEach(function(d){ (d.stops || []).forEach(function(s){ if (s.venue && !gone[s.venue.id]) { ids[s.venue.id] = 1; any = true; } }); });
    var it = (p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || [];
    it.forEach(function(s){ if (s && s.venue && !gone[s.venue.id]) { ids[s.venue.id] = 1; any = true; } });
    return any ? ids : null;
  }
  function v4ShownNames(){
    var names = {}, p = state.last || {}, shown = v4ShownIds();
    if (!shown) return null;
    (p.days || []).forEach(function(d){ (d.stops || []).forEach(function(s){ if (s.venue && shown[s.venue.id]) names[s.venue.name] = 1; }); });
    ((p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || []).forEach(function(s){ if (s && s.venue && shown[s.venue.id]) names[s.venue.name] = 1; });
    return names;
  }
  // Rooms (2026-11-22): the party and the rooms as they stand now: the Dates and guests fields first (Adults, Kids,
  // Rooms: the room buttons by the stay set the Rooms field), else the plan's own trip. -> { adults, kids, rooms,
  // assumed, ages } or null when no adult count is known.
  function v4RoomsState(){
    var d = typeof t3StayData === 'function' ? t3StayData() : null, t = (d && d.w && d.w.trip) || {};
    var g = function(id){ var el = document.getElementById(id); return el && /^\d+$/.test(el.value) ? Number(el.value) : null; };
    var ad = g('t3Adults'), kd = g('t3Kids'), picked = g('t3Rooms');
    if (kd === null) kd = t.kids || 0;
    if (ad === null) ad = t.adults || (kd > 0 ? 2 : null);
    var r = stayRoomsFor(ad, picked !== null ? picked : (t.rooms && !t.roomsAssumed ? t.rooms : null));
    if (!r) return null;
    return { adults: ad, kids: kd, rooms: r.rooms, assumed: r.assumed, ages: t.kidAges && t.kidAges.length === kd ? t.kidAges : null };
  }
  function v4PartyUrl(raw){
    try {
      var g = function(id){ var el = document.getElementById(id); return el && /^\d+$/.test(el.value) ? Number(el.value) : null; };
      // Nothing set on the page: the link is the server's own (built with the same rule).
      if (g('t3Adults') === null && g('t3Kids') === null && g('t3Rooms') === null) return raw;
      var st = v4RoomsState();
      if (!st) return raw;
      var ad = st.adults, kd = g('t3Kids') !== null ? st.kids : null, rooms = st.rooms;
      var u = new URL(raw), h = u.hostname.replace(/^www\./, ''), q = u.searchParams;
      if (/(^|\.)booking\.com$/.test(h) && /^\/hotel\//.test(u.pathname)) {
        q.set('group_adults', String(ad));
        if (kd !== null) { if (Number(q.get('group_children') || 0) !== kd) q.delete('age'); q.set('group_children', String(kd)); }
        q.set('no_rooms', String(rooms));
      } else if (/(^|\.)expedia\.(ca|com)$/.test(h)) {
        // One rmN per room; the children only with their ages (as typed in the request), else the adults alone.
        var had = 0, keys = [];
        q.forEach(function(v, k){ if (/^rm\d+$/.test(k)) { keys.push(k); had += v.split(':c').length - 1; } });
        var ages = st.ages && (kd === null || kd === st.ages.length) && (had === st.ages.length || kd !== null) ? st.ages : [];
        keys.forEach(function(k){ q.delete(k); });
        stayRoomSplit(ad, ages, rooms).forEach(function(r, i){ q.set('rm' + (i + 1), 'a' + r.adults + r.ages.map(function(a){ return ':c' + a; }).join('')); });
      } else if (/(^|\.)stay22\.com$/.test(h)) {
        q.set('adults', String(ad));
        if (kd !== null) { if (Number(q.get('children') || 0) !== kd) q.delete('childrenAges'); q.set('children', String(kd)); }
        q.set('rooms', String(rooms));
        if (q.get('link')) q.set('link', v4PartyUrl(q.get('link')));
      } else return raw;
      return u.toString();
    } catch (e) { return raw; }
  }
  // "Rooms  [−]  3 (assumed)  [+]": the rooms, said and changed in one short row by the stay (the plan's card and the
  // Book my trip sheet). Shown when it matters (stayRoomsMatter) or once a number was picked or said. A minus and a
  // plus button, one room a tap, from 1 up to one room per adult (8 at most); a button at its limit is disabled.
  // "(assumed)" stays until the first tap (or a number said in the chat or set in Dates and guests). The empty status
  // line is filled after a tap ("4 rooms"), so a screen reader hears the new number: the row itself is drawn again.
  function v4RoomsHtml(fr){
    var st = v4RoomsState();
    if (!st || !(stayRoomsMatter(st.adults, st.kids, st.rooms) || !st.assumed || st.rooms > 1)) return '';
    var max = Math.min(8, st.adults);
    var btn = function(dir, off, say, glyph){ return '<button type="button" data-v4-rooms="' + dir + '" aria-label="' + esc(say) + '"' + (off ? ' disabled aria-disabled="true"' : '') + '>' + glyph + '</button>'; };
    return '<div class="v4-rooms" role="group" aria-label="' + esc(fr ? 'Combien de chambres ?' : 'How many rooms?') + '"><span class="v4-rooms-label">' + esc(fr ? 'Chambres' : 'Rooms') + '</span><span class="v4-rooms-step">'
      + btn('less', st.rooms <= 1, fr ? 'Une chambre de moins' : 'One fewer room', '−')
      + '<span class="v4-rooms-now" data-v4-rooms-now>' + esc(st.rooms + (st.assumed ? vt('assumed') : '')) + '</span>'
      + btn('more', st.rooms >= max, fr ? 'Une chambre de plus' : 'One more room', '+')
      + '</span><span class="v4-rooms-say" data-v4-rooms-say role="status" aria-live="polite" aria-atomic="true"></span></div>';
  }
  // The one line by the stay's button for a party of three or more (and what to do on a hotel's own site, which we
  // cannot pre-fill). Never a word about availability or how many a room sleeps.
  function v4RoomsNote(s, fr){
    var st = v4RoomsState(), first = ((s && s.bookingLinks) || [])[0];
    if (!st || !first) return '';
    var out = [];
    if (st.rooms > 1 && (first.key === 'own' || first.key === 'search')) out.push(fr ? 'Site de l’hôtel : indiquez ' + st.rooms + ' chambres sur place.' : 'Hotel’s own site: enter ' + st.rooms + ' rooms there.');
    var d = t3StayData(), dated = !!(d && d.w && d.w.trip && d.w.trip.datesGiven);
    if (first.key === 'expedia' && !dated && st.adults + st.kids !== 2) out.push(fr ? 'Expedia n’affiche vos voyageurs et vos chambres qu’une fois les dates choisies : entrez-les sur place.' : 'Expedia shows your guests and rooms only once dates are picked: enter them there.');
    if (st.adults + st.kids >= 3) out.push(fr ? 'Les chambres et leur capacité sont confirmées sur le site de réservation.' : 'Rooms and how many each sleeps are confirmed on the booking site.');
    return out.join(' ');
  }
  function v4SetRooms(n){
    var st = v4RoomsState(); if (!st) return;
    n = Math.max(1, Math.min(n, Math.min(8, st.adults)));
    var el = document.getElementById('t3Rooms'); if (el) { el.value = String(n); el.setAttribute('data-v4-auto', '1'); }
    var d = t3StayData(); if (d && d.w && d.w.trip) { d.w.trip.rooms = n; delete d.w.trip.roomsAssumed; }
  }
  // A number picked by the room buttons or the chat belongs to that trip: a NEW request starts without it (the Rooms
  // field is not on screen in the chat layout). A number the visitor set in the field itself stays, like Adults.
  document.addEventListener('change', function(e){ if (e.target && (e.target.id === 't3Rooms' || e.target.id === 't3Adults')) e.target.removeAttribute('data-v4-auto'); });
  document.addEventListener('submit', function(e){
    if (!e.target || e.target.id !== 't3Form') return;
    var el = document.getElementById('t3Rooms');
    if (el && el.getAttribute('data-v4-auto')) { el.value = ''; el.removeAttribute('data-v4-auto'); }
    // The same for a number of adults the chat set ("we are 4 adults" stayed on a later "weekend for two").
    var ad = document.getElementById('t3Adults');
    if (ad && ad.getAttribute('data-v4-auto')) { ad.value = ''; ad.removeAttribute('data-v4-auto'); if (typeof chat !== 'undefined' && chat) chat.adults = null; }
  }, true);
  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-v4-rooms]') : null;
    if (!b) return;
    var st = v4RoomsState(); if (!st) return;
    if (b.disabled) return;
    var v = b.getAttribute('data-v4-rooms') === 'less' ? 'less' : 'more', max = Math.min(8, st.adults);
    var n = Math.max(1, Math.min(max, st.rooms + (v === 'less' ? -1 : 1)));
    var inSheet = !!b.closest('#v4Sheet');
    v4SetRooms(n);
    if (typeof chat !== 'undefined' && chat) { chat.rendering = true; try { render(false); } finally { chat.rendering = false; } } else { try { render(false); } catch (err) {} }
    // The plan was drawn again (and the sheet with it): a pick made in the sheet leaves the sheet open, on the same row.
    var dlg = document.getElementById('v4Sheet'), card = dlg && dlg.querySelector('[data-t3-stay]');
    if (card) card.outerHTML = t3StayCardHtml();
    if (inSheet && dlg && !dlg.open) { if (typeof dlg.showModal === 'function') { try { dlg.showModal(); } catch (err) { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', ''); }
    syncUrl();
    // Focus goes back to the same button (the other one when this one just reached its limit and is disabled), and
    // the new number is said: the status line is filled a moment after it is drawn, which is what gets announced.
    var box = inSheet ? document.getElementById('v4Sheet') : resultEl;
    var back = box && box.querySelector('[data-v4-rooms="' + v + '"]');
    if (back && back.disabled) back = box.querySelector('[data-v4-rooms="' + (v === 'more' ? 'less' : 'more') + '"]');
    if (back && !back.disabled) { try { back.focus({ preventScroll: true }); } catch (err) {} }
    var said = lang() === 'fr' ? n + (n > 1 ? ' chambres' : ' chambre') : n + (n > 1 ? ' rooms' : ' room');
    setTimeout(function(){ var say = box && box.querySelector('[data-v4-rooms-say]'); if (say) say.textContent = said; }, 150);
  });
  function v4RemovedIds(){ var ids = {}, p = state.last || {}; (p.days || []).forEach(function(d){ (d.stops || []).forEach(function(s){ if (s.venue && state.removed[d.day + '-' + s.daypart]) ids[s.venue.id] = 1; }); }); Object.keys(v4.gone || {}).forEach(function(id){ if (v4.gone[id]) ids[id] = 1; }); return ids; }
  function v4CanBook(){ return t3BookSteps().length > 0 || v4ReserveRows([]).length > 0 || !!t3StayData(); }
  function v4OpenSheet(){
    var dlg = document.getElementById('v4Sheet');
    if (!dlg) return;
    var card = dlg.querySelector('[data-t3-stay]');
    if (card) card.outerHTML = t3StayCardHtml();
    track('trip_book_open', { surface: 'trip_planner', step_count: t3BookSteps().length });
    if (typeof dlg.showModal === 'function') { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', '');
    var h = document.getElementById('t3StayHead'); if (h) { try { h.focus({ preventScroll: true }); } catch (e) {} }
  }
  // ---- share: the phone's share sheet with a short summary, else copy ----
  function v4ShareStops(){
    var seen = {}, out = [], REF = /^(venue|event):[1-9][0-9]*$/;
    Array.prototype.forEach.call(resultEl.querySelectorAll('.trip-btn[data-plan-stop]'), function(b){
      var r = b.getAttribute('data-trip-ref');
      if (!r || !REF.test(r) || seen[r]) return;
      seen[r] = 1; out.push({ ref: r, day: parseInt(b.getAttribute('data-plan-day'), 10) || 0, name: b.getAttribute('data-trip-name') || '' });
    });
    return out.slice(0, TRIP_MAX_STOPS);
  }
  // A day the planner could not fill (plan.thinDays, 2026-11-24): one short line on that day saying so and why, with at
  // most two one-tap next steps that go through the chat. Never shown as a finished day.
  function v4ThinHtml(p, day, fr){
    var x = ((p && p.thinDays) || []).filter(function(q){ return q && q.day === day && q.text; })[0];
    if (!x) return '';
    var say = typeof chatSend === 'function' ? (x.next || []).slice(0, 2).filter(function(n){ return n && n.message && n.label; }) : [];
    return '<p class="v4-thin" data-v4-thin="' + esc(day) + '"><span>' + esc((fr && x.textFr) || x.text) + '</span>'
      + say.map(function(n){ return ' <button type="button" class="v4-thin-btn" data-v4-say="' + esc(n.message) + '"' + (n.detail ? ' title="' + esc(n.detail) + '"' : '') + '>' + esc((fr && n.labelFr) || n.label) + '</button>'; }).join('') + '</p>';
  }
  function v4ShareLink(list){
    var u = location.origin + (lang() === 'fr' ? '/fr' : '') + '/my-trip?stops=' + list.map(function(x){ return x.ref; }).join(',');
    if (list.length && list.every(function(x){ return x.day > 0; })) u += '&days=' + list.map(function(x){ return x.day; }).join(',');
    return u + v4ShareContext(list);
  }
  // Honest plan (2026-11-22: the shared link opened the stops by day with no hotel and no times): the link also carries
  // the trip's context, all optional and read again from the listings by the shared page (trip-honest-plan.js
  // parseShareContext): chosen dates only (start), each stop's time (t), the stay, the party as given (aa=1 when the
  // number of adults is assumed), date-dependent suggestions (sug) and what was asked for (asks). No free text.
  function v4ShareContext(list){
    var p = state.last || {}, out = '', rows = p.schedule || [], sug = {};
    try {
      var d0 = (p.days || [])[0];
      // Rooms round (2026-11-22: "Family weekend…" shared its stay links with Nov 28-29 though the stay said "Dates not
      // set"): a "weekend" the planner dated by itself is not the visitor's dates, so the copy carries none either.
      var sd0 = typeof t3StayData === 'function' ? t3StayData() : null, stayNoDates = !!(sd0 && sd0.w && sd0.w.trip && sd0.w.trip.datesGiven === false);
      // Trip dates (2026-11-23): dates the visitor gave travel as the trip's own dates (td, ts), and the stay's
      // check-in and check-out only once confirmed (sa, sl, sc=1). Assumed or past dates are never carried.
      var td = p.tripDates, tt = (sd0 && sd0.w && sd0.w.trip) || {}, isoOk = function(x){ return /^\d{4}-\d{2}-\d{2}$/.test(x || ''); };
      if (td && !td.assumed && !td.past && isoOk(td.start)) {
        out += '&td=' + td.start + '_' + (isoOk(td.end) ? td.end : td.start) + '&ts=' + ({ request: 'r', picked: 'p', chat: 'c' }[td.source] || 'r');
        if (tt.stayStatus === 'confirmed' && !tt.datesPast && isoOk(tt.arrive) && isoOk(tt.leave)) out += '&sa=' + tt.arrive + '&sl=' + tt.leave + '&sc=1';
      } else if (!td && p.datesGiven && !stayNoDates && d0 && isoOk(d0.date)) out += '&start=' + d0.date;
      var times = list.map(function(x){
        var m = /^(venue|event):(\d+)$/.exec(x.ref), id = m ? Number(m[2]) : 0;
        var r = rows.filter(function(q){ return (!x.day || q.day === x.day || q.day === undefined) && (m && m[1] === 'venue' ? q.venueId === id : q.eventId === id); })[0];
        return r && Number.isInteger(r.startMinutes) && r.startMinutes >= 0 && r.startMinutes < 1440 ? r.startMinutes : '';
      });
      if (times.some(function(t){ return t !== ''; })) out += '&t=' + times.join(',');
      var sd = typeof t3StayData === 'function' ? t3StayData() : null, t = (sd && sd.w && sd.w.trip) || {};
      if (sd && sd.chosen && sd.chosen.id > 0) out += '&stay=' + sd.chosen.id + (t.nights > 0 ? '&nights=' + t.nights : '');
      if (t.adults > 0) out += '&ad=' + t.adults + (t.adultsAssumed ? '&aa=1' : '');
      if (t.kids > 0) out += '&kids=' + t.kids;
      // The children's ages as typed (ka=6,9), so the copy's stay links ask for the same party; never a guessed age.
      if (t.kids > 0 && t.kidAges && t.kidAges.length === t.kids) out += '&ka=' + t.kidAges.join(',');
      // Rooms (2026-11-22): rm=3, with ra=1 while the number is our assumption.
      if (t.rooms > 0 && t.adults > 0) out += '&rm=' + t.rooms + (t.roomsAssumed ? '&ra=1' : '');
      (p.dateSuggestions || []).slice(0, 2).forEach(function(x){ if (x && x.id > 0) sug['event:' + x.id] = 1; });
      if (Object.keys(sug).length) out += '&sug=' + Object.keys(sug).join(',');
      var asks = []; (p.evidence || []).forEach(function(e){ asks.push(e && /^count:/.test(e.ask || '') && e.asked > 0 ? e.ask + ':' + e.asked : e && e.ask); if (e && e.also) asks.push(e.also); }); asks = asks.filter(function(a){ return a && /^[a-z_:0-9]+$/.test(a); }).slice(0, 12);
      if (asks.length) out += '&asks=' + asks.join(',');
      // Trip needs (2026-11-24): one person's wheelchair (nw=1) and the days the plan could not fill (thin=2), so the
      // copy says the same; both optional.
      if ((p.needs || []).some(function(n){ return n && n.key === 'wheelchair' && n.who === 'one'; })) out += '&nw=1';
      var thin = (p.thinDays || []).map(function(x){ return x && x.day; }).filter(function(n){ return n > 0 && n < 31; });
      if (thin.length) out += '&thin=' + thin.join(',');
    } catch (e) {}
    return out;
  }
  // The group-chat message (round 1, 2026-11-21: "Day 1: A, B, C +2 more" hid the dinner and had no times or dates):
  // the title, then each day with its date and every stop with its time, then the stay. Read from the plan on screen,
  // so swaps and removals are in it, in the page's language.
  function v4ShareText(){
    var fr = lang() === 'fr', lines = [], head = document.getElementById('t3Headline');
    lines.push((head && head.textContent) || vt('shareTitle'));
    Array.prototype.forEach.call(resultEl.querySelectorAll('.v4-day'), function(sec){
      var t = sec.querySelector('.v4-day-title'), rows = [];
      Array.prototype.forEach.call(sec.querySelectorAll('.v4-stop:not(.v4-gone):not(.v4-free)'), function(li){
        var time = li.querySelector('.v4-time'), name = li.querySelector('.v4-name');
        if (!name || !name.textContent.trim()) return;
        rows.push(((time && time.textContent.trim()) ? time.textContent.trim() + ' ' : '') + name.textContent.trim());
      });
      if (!rows.length) return;
      if (t && t.textContent.trim()) { lines.push(''); lines.push(t.textContent.replace(/\s+/g, ' ').trim()); }
      rows.forEach(function(r){ lines.push(r); });
    });
    var d = typeof t3StayData === 'function' ? t3StayData() : null;
    if (d && d.chosen && d.chosen.name) { lines.push(''); lines.push((fr ? 'Hébergement : ' : 'Stay: ') + d.chosen.name); }
    var est = v4EstimateText().replace(/<small>[\s\S]*?<\/small>/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (est) lines.push(est);
    return lines.join('\n');
  }
  function v4Toast(text){
    var t = document.getElementById('v4Toast');
    if (!t) { t = document.createElement('div'); t.id = 'v4Toast'; t.className = 'v4-toast'; t.setAttribute('role', 'status'); (v4Main() || document.body).appendChild(t); }
    t.textContent = text; t.hidden = false;
    clearTimeout(v4Toast.timer); v4Toast.timer = setTimeout(function(){ t.hidden = true; }, 3200);
  }
  function v4Share(){
    var list = v4ShareStops();
    if (!list.length) return;
    var url = v4ShareLink(list), text = v4ShareText(), f = planFacts(state.last);
    var done = function(method){ track('trip_share', { method: method, stop_count: list.length, source: 'plan_v4' }); track('trip_plan_share', { share_method: method, plan_kind: f.plan_kind, day_count: f.day_count }); };
    if (navigator.share) { navigator.share({ title: text.split('\n')[0], text: text, url: url }).then(function(){ done('native'); }, function(){}); return; }
    // No share sheet: copy; when the clipboard is blocked, the older copy command; only then show the link to copy by hand
    // (it wraps, so the page never scrolls sideways).
    var legacy = function(){
      var ok = false, ta = document.createElement('textarea');
      ta.value = text + '\n' + url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { done('copy'); v4Toast(vt('copied')); } else { done('manual'); v4Toast(vt('copyThis') + url); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text + '\n' + url).then(function(){ done('copy'); v4Toast(vt('copied')); }, legacy);
    else legacy();
  }
  // ---- the sticky bar ----
  function v4BarHtml(){
    var fr = lang() === 'fr';
    if (v4.ask) {
      var st = addState(), others = tripSize() - (st.total - st.missing);
      return '<div class="v4-bar-in"><p class="v4-ask">' + esc(tx('tripv3.replaceAsk', { stops: stopsText(Math.max(1, others)) })) + '</p><div class="v4-bar-btns v4-ask-btns">'
        + '<button type="button" class="v4-btn" data-v4-replace="replace">' + esc(tx('tripv3.replace')) + '</button><button type="button" class="v4-btn v4-btn-2" data-v4-replace="add">' + esc(tx('tripv3.addToIt')) + '</button>'
        + '<button type="button" class="v4-btn v4-btn-2" data-v4-replace="cancel" aria-label="' + esc(tx('tripv3.cancel')) + '">✕</button></div></div>';
    }
    if (!v4.confirmed) return '<div class="v4-bar-in"><button type="button" class="v4-btn v4-wide" data-v4-confirm style="width:100%;max-width:none">' + esc(vt('confirm')) + '</button><p class="v4-disc" style="text-align:center">' + esc(vt('confirmNote')) + '</p></div>';
    var est = v4EstimateText(), canBook = v4CanBook();
    return '<div class="v4-bar-in"><div class="v4-bar-top"><p class="v4-est">' + (est || '&nbsp;') + '</p><button type="button" class="v4-bar-link" data-v4-unconfirm>' + esc(vt('editPlan')) + '</button></div>'
      + '<div class="v4-bar-btns' + (canBook ? '' : ' v4-no-book') + '">' + (canBook ? '<button type="button" class="v4-btn" data-v4-book>' + esc(vt('book')) + '</button>' : '')
      + '<button type="button" class="v4-btn v4-btn-2" data-v4-share>' + esc(vt('share')) + '</button><button type="button" class="v4-btn v4-btn-2" data-v4-save aria-pressed="' + (v4.saved ? 'true' : 'false') + '">' + esc(v4.saved ? vt('saved') : vt('save')) + '</button></div></div>';
  }
  function v4UpdateBar(){
    var main = v4Main(), bar = document.getElementById('v4Bar');
    if (!main || !main.classList.contains('has-plan')) return;
    if (!bar) { bar = document.createElement('div'); bar.id = 'v4Bar'; bar.className = 'v4-bar'; bar.setAttribute('role', 'region'); main.appendChild(bar); }
    var canBookNow = v4CanBook();
    // Round 2: Save says Saved when every stop of this plan is already in My Trip (after a reload too).
    try { if (typeof tripWorkspaceStopHtml !== 'function' && !v4.saved && addState().state === 'added') v4.saved = true; } catch (err) {}
    bar.setAttribute('aria-label', v4.confirmed ? vt('book') : vt('confirm'));
    // The travel agent chat (trip-chat-page.js, only with d.chat) keeps its own part of the bar; the rest is redrawn.
    (typeof v4ChatMount === 'function' ? v4ChatMount(bar) : bar).innerHTML = v4BarHtml();
    var tip = resultEl.querySelector('.v4-tip:not(.v4-picked)'); if (tip) tip.textContent = v4.confirmed ? (canBookNow ? vt('tipDone') : vt('tipNoBook')) : vt('tip');
    var plan = resultEl.querySelector('.v4'); if (plan) plan.classList.toggle('v4-confirmed', v4.confirmed);
    document.body.style.paddingBottom = bar.offsetHeight ? bar.offsetHeight + 'px' : '';
  }
  function v4Render(focus){
    var p = t3LocalTimes(lang() === 'fr' ? t3FrenchPlan(state.last) : state.last, lang());
    renderedVenueCardAnchors = {}; renderedPhotos = {};
    var fr = lang() === 'fr', counts = nameCounts(), planKinds = p.kind === 'multi_day' || p.kind === 'day_plan';
    var main = v4Main(); if (main) { main.classList.add('has-plan'); main.classList.remove('v4-editing'); }
    if (v4.restoreConfirm) { v4.restoreConfirm = false; v4.confirmed = true; }
    var n = v4Count(p), nd = (p.days || []).length;
    // Round 3: each town once ("Whistler and Whistler Blackcomb, Whistler Blackcomb" was two days' labels side by side).
    var where = planKinds ? ((p.days || []).reduce(function(all, d){ return all.concat(String(d.regionLabel || '').split(/, | and | et /)); }, []).filter(function(x, i, a){ return x && a.indexOf(x) === i; }).slice(0, 2).join(', ')) : '';
    var sub = [nd > 1 ? vt('daysN', { n: nd }) : '', where, n === 1 ? vt('stops1') : vt('stopsN', { n: n })].filter(Boolean).join(' · ');
    // Round 4 (2026-11-21: "things to do this weekend" quietly became Kelowna): one line says the town was our pick.
    var picked = planKinds && p.understood && p.understood.valleyWide && !(p.understood.base || []).length && where && where.indexOf(',') === -1 ? vt('picked', { town: where }) : '';
    var html = '<div class="t3-plan v4' + (v4.confirmed ? ' v4-confirmed' : '') + '"><header class="v4-head"><h2 class="t3-headline" id="t3Headline" tabindex="-1">' + esc(String(p.headline || p.summary || vt('yourPlan')).replace(/\.$/, '')) + '</h2>'
      + '<p class="v4-sub">' + esc(sub) + '</p><button type="button" class="v4-edit" data-v4-edit>✎ ' + esc(vt('edit')) + '</button></header>'
      + (p.eventAmbiguity ? '<section class="t3-warnings" role="alert"><p>' + esc(fr ? 'Plusieurs événements correspondent à «' + p.eventAmbiguity.phrase + '». Choisissez :' : 'More than one listed event matches “' + p.eventAmbiguity.phrase + '”. Choose one:') + '</p><div class="t3-event-choices">' + p.eventAmbiguity.candidates.map(function(name, i){ var cid = p.eventAmbiguity.candidateIds && p.eventAmbiguity.candidateIds[i]; return Number.isSafeInteger(cid) && cid > 0 ? '<button type="button" class="t3-btn t3-btn-ghost" data-t3-event-choice="' + cid + '">' + esc(name) + '</button>' : ''; }).join('') + '</div></section>' : '')
      + ((p.notIncluded || []).slice(0, 3).map(function(x){ var t = (fr && x.textFr) || x.text; return t ? '<p class="v4-tip v4-picked v4-notinc">' + esc(t) + '</p>' : ''; }).join(''))
      // Group preferences (2026-11-22): one person's need ("one of us doesn't drink") and what the listings say about it.
      + (p.partyNote && ((fr && p.partyNote.textFr) || p.partyNote.text) ? '<p class="v4-tip v4-picked v4-partynote">' + esc((fr && p.partyNote.textFr) || p.partyNote.text) + '</p>' : '')
      // Honest plan (2026-11-22): one short line per ask the listings only partly support or cannot show (plan.evidence).
      + ((p.evidence || []).filter(function(x){ return x && x.line && x.text; }).slice(0, 3).map(function(x){ return '<p class="v4-tip v4-picked v4-evidence" data-ev-status="' + esc(x.status) + '">' + esc((fr && x.textFr) || x.text) + '</p>'; }).join(''))
      + (p.noDrive && p.noDrive.text ? '<p class="v4-tip v4-picked v4-nodrive">' + esc((fr && p.noDrive.textFr) || p.noDrive.text) + '</p>' : '')
      + (picked ? '<p class="v4-tip v4-picked">' + esc(picked) + '</p>' : '')
      + '<p class="v4-tip">' + esc(v4.confirmed ? (v4CanBook() ? vt('tipDone') : vt('tipNoBook')) : vt('tip')) + '</p>'
      + '<p class="t3-plan-status" id="t3PlanStatus" role="status" aria-live="polite"></p><div class="v4-days">';
    if (planKinds) {
      (p.days || []).forEach(function(d){
        // Trip dates (2026-11-23): a date the planner worked out by itself ("a weekend", a month) says so.
        var date = v4DayDate(d), tdd = (state.last && state.last.tripDates) || null;
        if (date && tdd && tdd.assumed) date += vt('assumed');
        var label = [date, d.regionLabel].filter(Boolean).join(' · ');
        html += '<section class="v4-day" id="t3-day-' + d.day + '" aria-labelledby="v4-day-' + d.day + '">' + (nd > 1 || label ? '<h3 class="v4-day-title" id="v4-day-' + d.day + '">' + (nd > 1 ? esc(vt('day') + ' ' + d.day) : '') + (label ? ' <span>' + (nd > 1 ? '· ' : '') + esc(label) + '</span>' : '') + '</h3>' : '')
          + (d.driveIn ? '<p class="v4-leg" style="margin:0 0 6px;border-radius:10px;padding-left:12px">' + esc(t3DriveText(d.driveIn, lang())) + '</p>' : '')
          + v4ThinHtml(p, d.day, fr)
          + v4ListHtml(d.stops, function(s){ return d.day + '-' + s.daypart; }, counts) + '</section>';
      });
    } else {
      var list = (p.outing && p.outing.stops) || (p.itinerary && p.itinerary.stops) || [];
      html += '<section class="v4-day">' + v4ListHtml(list, null, counts) + '</section>';
    }
    html += '</div>' + v4SuggestionsHtml(p, fr) + '<p class="v4-tip" style="margin-top:4px">' + esc(vt('note')) + '</p>';
    // Everything else the planner says (the length, town and pace controls, dates, notes, what wasn't used): one tap away.
    var det = t3PlanDetails(p), extra = understoodHtml(p) + (det.schedHtml || '') + det.html + t3ShowPlacesHtml(p, fr, esc, hrefAttr);
    if (extra) html += '<details class="v4-options"><summary>' + esc(vt('options')) + '</summary>' + extra + '</details>';
    html += '<dialog class="v4-sheet" id="v4Sheet" aria-labelledby="t3StayHead"><button type="button" class="v4-sheet-x" data-v4-close aria-label="' + esc(vt('close')) + '">×</button><div class="v4-sheet-in">' + v4BookCardHtml() + '</div></dialog>';
    html += '</div>';
    detachMap();
    resultEl.innerHTML = html;
    if (lang() === 'fr') Array.prototype.forEach.call(resultEl.querySelectorAll('a[href^="/"]'), function(a){ var u = a.getAttribute('href'), f = t3FrenchHref(u, a.getAttribute('data-url-fr')); if (f !== u) a.setAttribute('href', f); });
    resultEl.hidden = false;
    if (howEl) howEl.hidden = true;
    if (window.__syncTripButtons) window.__syncTripButtons();
    v4UpdateBar();
    if (focus) {
      var toTop = function(){
        var siteHead = document.querySelector('header#top');
        var headH = siteHead && getComputedStyle(siteHead).position === 'sticky' ? siteHead.getBoundingClientRect().height : 0;
        var top = resultEl.getBoundingClientRect().top + (window.pageYOffset || 0) - headH - 8;
        try { window.scrollTo({ top: Math.max(0, top), behavior: 'auto' }); } catch (e) { window.scrollTo(0, Math.max(0, top)); }
      };
      toTop();
      // Round 2 (2026-11-21): again once the hidden hero and photos have settled, so the title is in view.
      if (window.requestAnimationFrame) requestAnimationFrame(function(){ requestAnimationFrame(toTop); });
      var t = document.getElementById('t3Headline'); if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
  }
  // ---- V4 interactions (Swap, Remove, Undo and the booking steps are the page's own handlers) ----
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var b;
    if ((b = t.closest('[data-v4-toggle]')) && resultEl.contains(b)) {
      var box = document.getElementById(b.getAttribute('data-v4-toggle'));
      if (!box) return;
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      var oid = b.getAttribute('data-v4-id'); if (oid) { if (box.hidden) delete v4.open[oid]; else v4.open[oid] = 1; }
      return;
    }
    if ((b = t.closest('[data-v4-confirm]'))) {
      v4.confirmed = true;
      var f = planFacts(state.last);
      track('trip_plan_confirm', { plan_kind: f.plan_kind, day_count: f.day_count, stop_count: v4ShareStops().length });
      var c = resultEl.querySelector('.v4-confirm'); if (c) c.parentNode.removeChild(c);
      v4UpdateBar(); syncUrl();
      var bk = document.querySelector('#v4Bar [data-v4-book], #v4Bar [data-v4-share]'); if (bk) { try { bk.focus({ preventScroll: true }); } catch (err) {} }
      var hd = document.getElementById('t3Headline'); if (hd && hd.getBoundingClientRect().top < 0) { try { hd.scrollIntoView({ block: 'center' }); } catch (err) {} }
      return;
    }
    if ((b = t.closest('[data-v4-remove-id]')) && resultEl.contains(b)) { v4.gone[b.getAttribute('data-v4-remove-id')] = 1; v4.saved = false; render(false); v4CacheSave(); return; }
    if ((b = t.closest('[data-v4-undo-id]')) && resultEl.contains(b)) { delete v4.gone[b.getAttribute('data-v4-undo-id')]; render(false); v4CacheSave(); return; }
    if ((b = t.closest('[data-v4-unconfirm]'))) { v4.confirmed = false; v4.ask = false; render(false); syncUrl(); return; }
    if ((b = t.closest('[data-v4-book]'))) { v4OpenSheet(); return; }
    if ((b = t.closest('[data-v4-close]'))) { var dlg = document.getElementById('v4Sheet'); if (dlg) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } return; }
    if ((b = t.closest('[data-v4-share]'))) { v4Share(); return; }
    if ((b = t.closest('[data-v4-replace]'))) {
      var ch = b.getAttribute('data-v4-replace');
      v4.ask = false;
      if (ch === 'replace' && window.__roamTripReplace) { window.__roamTripReplace(); addStops(null); v4.saved = true; v4Toast(vt('savedReplaced')); }
      else if (ch === 'add') { addStops(null, { offset: tripDayOffset() }); v4.saved = true; v4Toast(vt('saved')); }
      v4UpdateBar();
      return;
    }
    if ((b = t.closest('[data-v4-save]'))) {
      // Round 1 (2026-11-21): Save never mixes this plan into another saved trip without asking (one tap: Replace).
      var as = addState(), oth = tripSize() - (as.total - as.missing);
      if (!v4.saved && (as.state === 'ready' || (typeof tripWorkspaceStopHtml === 'function' && as.state === 'added')) && oth > 0 && window.__roamTripReplace) { v4.ask = true; v4UpdateBar(); var rb = document.querySelector('#v4Bar [data-v4-replace]'); if (rb) { try { rb.focus({ preventScroll: true }); } catch (err) {} } return; }
      if (!v4.saved) { if (typeof tripWorkspaceStopHtml === 'function' && as.state === 'added' && oth <= 0) rememberDays(planStopButtons(null), 0); else addStops(null, { offset: tripDayOffset() }); v4.saved = true; v4UpdateBar(); v4Toast(vt('savedReplaced')); }
      else { var panel = document.getElementById('tripTrayPanel'), toggle = document.getElementById('tripTrayToggle'); if (panel && !panel.classList.contains('open') && toggle) setTimeout(function(){ toggle.click(); }, 0); }
      return;
    }
    if ((b = t.closest('[data-v4-edit]'))) {
      // Round 4 (2026-11-21): a new request starts unconfirmed (an edited request came back already confirmed).
      v4.confirmed = false; v4.ask = false; v4.gone = {}; v4.saved = false;
      var m = v4Main(); if (m) m.classList.add('v4-editing');
      setCompact(false);
      try { form.scrollIntoView({ block: 'center' }); } catch (err) {}
      try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
    }
  });
  // Clicking the sheet's backdrop closes it; closing it refreshes the bar's estimate and progress.
  document.addEventListener('click', function(e){ var dlg = document.getElementById('v4Sheet'); if (dlg && e.target === dlg && dlg.close) dlg.close(); });
  document.addEventListener('close', function(e){ if (e.target && e.target.id === 'v4Sheet') { v4UpdateBar(); var bk = document.querySelector('#v4Bar [data-v4-book], .tw-book [data-v4-book]'); if (bk) { try { bk.focus({ preventScroll: true }); } catch (err) {} } } }, true);
  window.addEventListener('resize', function(){ var bar = document.getElementById('v4Bar'); if (bar) document.body.style.paddingBottom = bar.offsetHeight + 'px'; });
  // The page's example-trip links keep the preview.
  if (V4_PREVIEW) Array.prototype.forEach.call(document.querySelectorAll('.t3-about a[href^="/trip?q="], .t3-guide a[href^="/trip?q="]'), function(a){ a.setAttribute('href', a.getAttribute('href') + '&v=4'); });
`;

// The stays code with three V4 hooks: its card is the sheet's checklist, "Book my trip" works with no place to stay (the
// stops' own booking links, plan.v4Booking), and the bar follows each step.
function v4StaySrc(staySrc) {
  const swap = (from, to) => { if (!staySrc.includes(from)) throw new Error(`v4 hook not found: ${from.slice(0, 60)}`); staySrc = staySrc.replace(from, to); };
  swap('  function t3StayCardHtml(){\n', '  function t3StayCardHtml(){\n    if (V4) return v4BookCardHtml();\n');
  swap('  function t3BookSteps(){ var d = t3StayData(); return d ?', '  function t3BookSteps(){ var gone = V4 && typeof v4RemovedIds === \'function\' ? v4RemovedIds() : {}, shown = V4 && typeof v4ShownIds === \'function\' ? v4ShownIds() : null; return t3BookStepsAll().filter(function(x){ return !(x && x.kind === \'venue\' && (gone[x.id] || (shown && !shown[x.id]))); }); }\n  function t3BookStepsAll(){ var d = t3StayData(); if (!d && V4) { var fb = v4Fallback(); return ((fb && fb.steps) || []).filter(function(x){ return x && t3StayExt(x.url); }).concat(typeof t3ViatorSteps === \'function\' ? t3ViatorSteps() : []); } return d ?');
  // Round 3 (2026-11-21: an evening out with Arrive = Leave showed "stay.leave must be after stay.arrive."): a leave date
  // that is not after the arrival is simply not sent; the plan is for the arrival day.
  swap("    if (o.arrive && /^\\d{4}-\\d{2}-\\d{2}$/.test(l)) o.leave = l;", "    if (o.arrive && /^\\d{4}-\\d{2}-\\d{2}$/.test(l) && l > o.arrive) o.leave = l;");
  // Round 5 (2026-11-22: after "we are 4 adults" the Booking.com link had dates but no guest count): a stay link carries
  // the party in the Dates and guests fields as the visitor sees them now (formats checked on live pages 2026-11-22:
  // Booking.com group_adults / group_children / age; Expedia rm1=a<adults>[:c<age>...]; Stay22 adults / children).
  swap('  function t3StayLinkHtml(s, l, cls, text){\n    var u = t3StayExt(l.url);', '  function t3StayLinkHtml(s, l, cls, text){\n    var u = t3StayExt(v4PartyUrl(l.url));');
  swap('  function t3StepLinkHtml(step, cls, text, n){\n    var u = t3StayExt(step.url);', '  function t3StepLinkHtml(step, cls, text, n){\n    var u = t3StayExt(step.kind === \'stay\' ? v4PartyUrl(step.url) : step.url);');
  swap('  function t3BookRerender(focusSel){\n', '  function t3BookRerender(focusSel){\n    if (V4) setTimeout(v4UpdateBar, 0);\n');
  // "Getting here" (2026-11-21, getting-here.js): the "Rent a car" step's link (data-link="discovercars") and its click.
  return require('./getting-here').v4ClientSwaps(staySrc);
}

// "__ROAM_BRAND__" in the browser text is this site's name (trip-site.js), so the Whistler Roam copy says its own.
const V4_CLIENT = V4_CLIENT_SRC.replace(/__ROAM_BRAND__/g, String(require('./trip-site').brand || 'This site')).replace('__TRIP_TIMING_CLIENT__', () => require('./trip-timing').clientSource());
module.exports = { V4_STYLES, V4_CLIENT_SRC: V4_CLIENT, v4StaySrc };
