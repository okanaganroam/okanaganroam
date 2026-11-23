'use strict';
// Build My Trip on a phone (2026-11-22, Dayton: "the initial assistant summary, non-drinker and music notes, and hotel
// appear before the day tabs and first itinerary card… make the itinerary quicker to reach, for example with a concise
// summary and expandable details"). Under the title: one line of short facts read from the plan's own data, with a
// "Details" button for the full sentences; the dates question as one row; the place to stay as one row with its
// booking link and the commission line. An ask that is not fully met is flagged in the summary line itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ws = require('../trip-workspace-layout');
const chatPage = require('../trip-chat-page');
const { tripSummaryFacts } = ws;

const EVIDENCE = [
  { ask: 'count:winery', label: 'Wineries', labelFr: 'Vignobles', stops: [{ id: 401, name: 'A', has: true }, { id: 812, name: 'B', has: true }], count: 2, asked: 2, status: 'verified', text: 'Wineries: 2, as asked (A and B).' },
  { ask: 'gluten_free', label: 'Gluten-free', labelFr: 'Sans gluten', stops: [{ id: 222, name: 'C', has: true }], status: 'verified', text: 'Gluten-free: all 1 meal stops list gluten-free options.' },
  { ask: 'stay:pool', label: 'Pool', labelFr: 'Piscine', stops: [{ id: 401, name: 'Hotel', has: true }], status: 'verified', text: 'Pool: the listing says it has a pool.' },
  { ask: 'live_music', label: 'Live music', labelFr: 'Musique en direct', status: 'unknown', needsDates: true, stops: [{ id: 83, name: 'D', has: true }], text: 'Live music depends on the night.', line: true },
  { ask: 'nonalcoholic', label: 'Non-drinker', labelFr: 'Personne qui ne boit pas', stops: [{ id: 401, name: 'A', has: null }, { id: 83, name: 'D', has: null }, { id: 812, name: 'B', has: true }], who: 'one', status: 'partial', text: 'For your non-drinker: B lists non-alcoholic options; A and D don’t say, so ask there.' },
];
const PLAN = { evidence: EVIDENCE, partyNote: { concept: 'alcohol', text: EVIDENCE[4].text } };
const texts = (list) => list.map((x) => x.text);

test('the summary facts come from the plan’s own data, nothing else', () => {
  const facts = tripSummaryFacts(PLAN, false, {});
  assert.deepEqual(texts(facts), ['Live music: needs dates', 'Non-drinker: 1 of 3 stops', 'Wineries: 2 ✓', 'Gluten-free ✓', 'Pool ✓']);
  // Every item is an evidence entry of the plan (its label and its status); a plan with no evidence has no facts.
  for (const f of facts) assert.ok(EVIDENCE.some((e) => e.ask === f.ask && f.text.startsWith(e.label)), f.text);
  assert.deepEqual(tripSummaryFacts({}, false, {}), []);
  assert.deepEqual(tripSummaryFacts(null, false), []);
  // The party and "Dates not set" are said only when the page passes them (the stay card says the party otherwise).
  assert.deepEqual(texts(tripSummaryFacts({}, false, { party: '6 adults', datesUnset: true })), ['6 adults', 'Dates not set']);
  assert.deepEqual(texts(tripSummaryFacts({}, true, { party: '6 adultes', datesUnset: true })), ['6 adultes', 'Dates à choisir']);
});

test('an unmet, partial or unknown ask is flagged in the summary itself, ahead of the asks that are met', () => {
  const facts = tripSummaryFacts(PLAN, false, {});
  const flags = facts.filter((f) => f.kind === 'flag');
  assert.deepEqual(flags.map((f) => [f.ask, f.status]), [['live_music', 'unknown'], ['nonalcoholic', 'partial']]);
  assert.ok(facts.findIndex((f) => f.kind === 'flag') < facts.findIndex((f) => f.kind === 'ok'));
  // Unmet: named and flagged. What the plan left out with no evidence entry: named from its kind (a count in French).
  const unmet = tripSummaryFacts({ evidence: [{ ask: 'type:spa', label: 'Spa', labelFr: 'Spa', status: 'unmet', stops: [], text: 'There’s no spa listed in Osoyoos.' }], notIncluded: [{ kind: 'spa', text: 'There’s no spa listed in Osoyoos.' }] }, false, {});
  assert.deepEqual(unmet.map((f) => [f.kind, f.status, f.text]), [['flag', 'unmet', 'Spa: not in this plan']]);
  const left = tripSummaryFacts({ notIncluded: [{ kind: 'spa', text: 'There’s no spa listed in Osoyoos, so this plan has none.' }] }, false, {});
  assert.deepEqual(left.map((f) => [f.kind, f.status, f.text]), [['flag', 'unmet', 'Spa: not in this plan']]);
  assert.deepEqual(texts(tripSummaryFacts({ notIncluded: [{ kind: 'spa', text: 'x', textFr: 'y' }] }, true, {})), ['1 demande non incluse']);
  // A note for one person that no evidence entry covers is still flagged; a count asked and not reached says how many.
  assert.deepEqual(texts(tripSummaryFacts({ partyNote: { text: 'One of you…' } }, false, {})), ['Note for one of you']);
  const short = tripSummaryFacts({ evidence: [{ ask: 'count:winery', label: 'Wineries', stops: [{ id: 1, has: true }], count: 1, asked: 2, status: 'partial', text: 't' }] }, false, {});
  assert.deepEqual(short.map((f) => [f.kind, f.text]), [['flag', 'Wineries: 1 of 2']]);
  assert.deepEqual(texts(tripSummaryFacts({ evidence: [{ ask: 'vegan', label: 'Vegan', status: 'unknown', stops: [], text: 't' }] }, false, {})), ['Vegan: not confirmed']);
});

test('a stop the visitor removed no longer counts: no "Wineries: 2 ✓" above one winery', () => {
  const facts = tripSummaryFacts(PLAN, false, { removed: { 401: 1 } });
  assert.deepEqual(texts(facts), ['Wineries: 1 of 2', 'Live music: needs dates', 'Non-drinker: 1 of 2 stops', 'Gluten-free ✓', 'Pool ✓']);
  assert.equal(facts[0].kind, 'flag');
  // The place to stay is not a stop: its pool stays (the same id as a removed venue is another table's row).
  assert.ok(texts(facts).includes('Pool ✓'));
  const none = tripSummaryFacts({ evidence: [{ ask: 'kind:easy_walk', label: 'Easy walk', stops: [{ id: 5, has: true }], status: 'verified', text: 't' }] }, false, { removed: { 5: 1 } });
  assert.deepEqual(none.map((f) => [f.kind, f.text]), [['flag', 'Easy walk: not in this plan']]);
});

test('French: the same facts in French, and the new page strings exist in both languages', () => {
  assert.deepEqual(texts(tripSummaryFacts(PLAN, true, {})), ['Musique en direct : selon vos dates', 'Personne qui ne boit pas : 1 sur 3 arrêts', 'Vignobles : 2 ✓', 'Sans gluten ✓', 'Piscine ✓']);
  const src = ws.WORKSPACE_CLIENT_SRC;
  for (const [en, fr] of [['Details', 'Détails'], ['Trip summary', 'Résumé du voyage'], ['Place to stay:', 'Hébergement :'], ['Save trip', 'Enregistrer le voyage'], ['Share trip', 'Partager le voyage']]) {
    assert.ok(src.includes(`twText('${en}','${fr}')`), `${en} / ${fr}`);
  }
  const page = chatPage.chatClientSrc({ v4: 'on', chat: 'on', stays: 'on' });
  assert.match(page, /whenShort: 'When\?'/); assert.match(page, /whenShort: 'Quand\?'/);
  assert.match(page, /stayShort: 'Your stay'/); assert.match(page, /stayShort: 'Votre séjour'/);
  // More than four asks met: three, then "+N".
  const many = { evidence: ['A', 'B', 'C', 'D', 'E'].map((l) => ({ ask: 'kind:' + l, label: l, labelFr: l, status: 'verified', stops: [], text: l })) };
  assert.deepEqual(texts(tripSummaryFacts(many, false, {})), ['A ✓', 'B ✓', 'C ✓', '+2 more ✓']);
  assert.deepEqual(texts(tripSummaryFacts(many, true, {})).slice(-1), ['+2 autres ✓']);
});

test('the disclosure is a real button that says its state and names what it opens; the summary is text', () => {
  const src = ws.WORKSPACE_CLIENT_SRC;
  assert.match(src, /<button type="button" class="tw-sum-toggle" id="twSumToggle" aria-expanded="'\+\(twSumOpen\?'true':'false'\)\+'" aria-controls="twSumMore">/);
  assert.match(src, /<div class="tw-sum-more" id="twSumMore"'\+\(twSumOpen\?'':' hidden'\)\+'>/);
  assert.match(src, /b\.setAttribute\('aria-expanded',twSumOpen\?'true':'false'\);box\.hidden=!twSumOpen;/);
  assert.match(src, /sum\.setAttribute\('aria-label',twText\('Trip summary','Résumé du voyage'\)\)/);
  assert.match(src, /'<ul class="tw-facts">'\+facts\.map\(function\(f\)\{return '<li class="tw-fact-'\+esc\(f\.kind\)\+'"/);
  assert.ok(!/<img[^>]*tw-fact/.test(src), 'the facts are text, not images');
  // Closed until asked for, and it stays as the visitor left it through a redraw (a chat change, Swap, Remove).
  assert.match(src, /var twSelectedDay=1,twOptionsOpen=false,twSumOpen=false;/);
  // 44px tap targets: the Details button, the dates answers and "Check rates" on a phone.
  const css = ws.WORKSPACE_STYLES;
  assert.match(css, /\.tw-sum-toggle \{[^}]*min-height:44px;min-width:44px;/);
  assert.match(css, /\.tw-has-sum \.v4-ask-btns button \{flex:none;min-height:44px;/);
  assert.match(css, /\.v4-stay-card \.v4-stay-acts \.v4-btn \{min-height:44px;/);
  // Keyboard focus is put back on the same control after the plan is redrawn.
  assert.match(src, /var at=focus\?null:twFocusKey\(\);twBaseRender\(focus\);tripWorkspaceChrome\(\);twFocusBack\(at\);/);
});

test('the sentences move under Details (none is dropped); on a phone the agent’s line too, the dates question stays out', () => {
  const src = ws.WORKSPACE_CLIENT_SRC;
  // Every line the plan view prints under the title (left out, one person's note, evidence, no driving, our pick).
  assert.match(src, /var notes=Array\.from\(root\.children\)\.filter\(function\(el\)\{return el\.matches\('p\.v4-tip\.v4-picked'\);\}\);/);
  assert.match(src, /notes\.forEach\(function\(el\)\{box\.appendChild\(el\);\}\);/);
  const v4 = require('../trip-planner-v4-page').V4_CLIENT_SRC;
  for (const cls of ['v4-notinc', 'v4-partynote', 'v4-evidence', 'v4-nodrive']) assert.ok(v4.includes(`class="v4-tip v4-picked ${cls}"`), cls);
  // Only the agent's paragraphs move (the dates question, a div, stays in the plan as one row); back in the sidebar on a wide screen.
  assert.match(src, /var said=Array\.from\(agent\.children\)\.filter\(function\(el\)\{return el\.tagName==='P';\}\);said\.forEach\(function\(el\)\{slot\.appendChild\(el\);\}\);/);
  assert.match(src, /if\(ask\)ask\.before\(el\);else agent\.appendChild\(el\);/);
  assert.match(src, /sum\.after\(agent\);/);
  const page = chatPage.chatClientSrc({ v4: 'on', chat: 'on', stays: 'on' });
  assert.match(page, /<div class="v4-ask"><p class="v4-ask-q" id="v4AskQ"><span class="v4-ask-full">/);
  assert.match(page, /<div class="v4-ask-btns" role="group" aria-labelledby="v4AskQ">/);
  // No plan facts: no summary, and the page is as before.
  assert.match(src, /if\(!facts\.length\)return;/);
});

// The stay card, drawn by the page's own function with a place to stay that has an affiliate link.
function stayHtml(opts) {
  const page = chatPage.chatClientSrc({ v4: 'on', chat: 'on', stays: 'on' });
  const a = page.indexOf('function chatStayChips('), b = page.indexOf('function chatGhHtml(', a);
  assert.ok(a !== -1 && b > a);
  const AG = { stayH: 'Where you’ll stay', stayShort: 'Your stay', rates: 'Check rates', seeMore: 'See {n} more', fewer: 'Hide', choose: 'Choose', sleeps: 'Sleeps {n}', poolWinter: 'check it’s open in winter', notConfirmed: '{what} not confirmed', chip: { pool: 'Pool' } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const step = { kind: 'stay', url: 'https://www.stay22.com/allez/x', rel: 'sponsored nofollow noopener', link: 'stay22', affiliate: opts.affiliate };
  const ctx = {
    AG: { en: AG }, esc, lang: () => 'en', chat: { stayMore: false }, chatDiscShown: false,
    ag: (k, v) => { let x = AG[k]; if (v) for (const n of Object.keys(v)) x = x.split('{' + n + '}').join(String(v[n])); return x; },
    chatOvernight: () => true, state: { last: {}, overrides: {} }, t3StayInputBase: () => ({}), t3StayExt: (u) => u,
    t3StayData: () => ({ chosen: { id: 9, name: 'Lake Hotel', kind: 'Hotel', regionLabel: 'Kelowna', photo: '/images/stays/lake.jpg', has: ['pool'], bookingSteps: [step] }, others: [{ id: 10, name: 'Other Inn' }, { id: 11, name: 'Third Inn' }], w: { trip: { adults: 6 }, amenity: { keys: ['pool'], winterCheck: true } } }),
    t3StayTripLine: (t) => (t.adults ? t.adults + ' adults' : ''),
    t3StayLinkHtml: (s, l, cls, text) => '<a class="' + cls + '" href="' + l.url + '" target="_blank" rel="' + l.rel + '"' + (l.affiliate ? ' data-affiliate="1"' : '') + '>' + text + '</a>',
    T3_STAY_DISCLOSURE: { en: 'We may earn a commission if you book through these links.' },
    chatImg: (u) => u,
  };
  vm.createContext(ctx);
  vm.runInContext(page.slice(a, b).replace('var chatDiscShown = false;', ''), ctx);
  return ctx.chatStayHtml();
}

test('the stay stays in the plan with its booking link; the commission line is on the card whenever the link is an affiliate link', () => {
  const html = stayHtml({ affiliate: true });
  // One card: the name, one "Check rates" link, the commission line. Nothing of it is inside a <details> or [hidden].
  assert.match(html, /^<section class="v4-card v4-stay-card t3-stay" aria-label="Where you’ll stay">/);
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.match(html, /<a class="v4-btn" href="https:\/\/www\.stay22\.com\/allez\/x"[^>]*data-affiliate="1">Check rates<\/a>/);
  assert.match(html, /<p class="v4-disc-line">We may earn a commission if you book through these links\.<\/p><\/section>$/);
  assert.ok(!/<details|\shidden[\s>=]/.test(html), 'no closed section inside the stay card');
  assert.match(html, /<span class="v4-stay-name">Lake Hotel<\/span>/);
  // The label: the full words for screen readers and wide screens, a short one on a phone; the party after it.
  assert.match(html, /<p class="v4-card-h"><span class="v4-h-full">Where you’ll stay<\/span><span class="v4-h-short" aria-hidden="true">Your stay<\/span> · 6 adults<\/p>/);
  // "Pool" on the chip; the winter caveat in its own span (the phone card shows "Pool", the sentence is under Details).
  assert.match(html, /<span class="v4-stay-chip">Pool<span class="v4-chip-extra"> · check it’s open in winter<\/span><\/span>/);
  // Not an affiliate link: no commission line.
  assert.ok(!stayHtml({ affiliate: false }).includes('v4-disc-line'));
  // The layout keeps the card above the day tabs, outside the summary's closed part; only "See N more" moves under
  // Details on a phone, and the link and the commission line are never moved.
  const src = ws.WORKSPACE_CLIENT_SRC;
  assert.match(src, /stayAt\.before\(stayCard\)/);
  assert.match(src, /more=root\.querySelector\('\[data-v4-stay-more\]'\)/);
  assert.match(src, /staySlot\.appendChild\(more\)/);
  assert.ok(!/appendChild\(stayCard\)|\.tw-sum-more[^;]*stayCard/.test(src), 'the stay card is not moved into the Details box');
  assert.ok(!/v4-disc-line/.test(src.replace(/\$\{[^}]*\}/g, '')), 'the layout script does not touch the commission line');
  const css = ws.WORKSPACE_STYLES;
  assert.ok(!/\.v4-disc-line \{[^}]*display:none/.test(css) && !/\.v4-stay-acts \{[^}]*display:none/.test(css));
});

test('the whole page script still parses, and the layout keeps Save, Share, day tabs and Book my trip', () => {
  const page = require('../trip-planner-v3-page');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const data = { esc, title: 'Trip', description: 'Trip', canonical: 'https://example.com/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, v4: 'on', chat: 'on', stays: 'preview' };
  const html = page.renderTripPlannerV3Page(data);
  assert.match(html, /function tripSummaryFacts\(plan, fr, ctx\)/);
  assert.match(html, /function twSummary\(root,head\)/);
  for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) { if (m[0].includes('application/ld+json')) continue; new vm.Script(m[1]); }
  const src = ws.WORKSPACE_CLIENT_SRC;
  assert.match(src, /data-v4-save aria-pressed="false"/); assert.match(src, /data-v4-share/);
  assert.match(src, /role="tab" data-tw-day="/); assert.match(src, /data-v4-book/);
});
