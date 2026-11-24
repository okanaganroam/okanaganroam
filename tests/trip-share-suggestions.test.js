'use strict';
// Build My Trip: the shared copy keeps what the plan could not include and the tour the traveller asked to see
// (2026-11-23). The owner's flow, at 390px: the Osoyoos request (wineries, vegetarian meals, a spa, a hotel with a hot
// tub, no car), then "…add a couples spa if possible?", then "Yes, show me a wine tour with pickup." The plan showed the
// wine tour's booking link under "Getting here & tours" and "Spa: not in this plan"; the shared itinerary showed neither.
// The link carries keys and ids only (ni=spa:n:1563, wt=325656P14); the shared page rebuilds the words from the listings.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '', VIATOR_API_KEY: 'test-only', VIATOR_PARTNER_ID: 'P00000001' });
const H = require('../trip-honest-plan.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const REGION = WR ? 'whistler' : 'vernon';
const TOWN = WR ? 'Whistler' : 'Vernon';
const AT = WR ? [50.1163, -122.9574] : [50.267, -119.272];
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const HAS_TOURS = fs.existsSync(path.join(__dirname, '..', 'wine-tours.js')) && fs.existsSync(path.join(__dirname, '..', 'data', 'viator-wine-tours.json'));
const app = require('../server.js');
const db = require('../db.js');

const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${400 + n} Share Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 3000, longitude: AT[1], description: 'A place used only by the share tests. Open all year.', slug: `share-test-${key.toLowerCase().replace(/_/g, '-')}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
test.before(() => {
  mk('R1', { type: 'restaurant', name: 'Juniper Table ST', vegetarian: 1, price: 2, hours: HOURS });
  mk('W1', { type: 'winery', name: 'Flint Cellars ST', hours: HOURS });
  mk('SPA', { type: 'indoor', name: 'Stillwater Day Spa ST', cuisine: 'Spa', description: 'A day spa with massage and facials.', hours: HOURS });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const baseQ = () => ({ stops: `venue:${F.R1.id},venue:${F.W1.id}`, days: '1,1', asks: 'type:winery,vegetarian', ad: '2' });

test('1. the link: what the plan could not include travels as kind, reason and the nearest listing’s id; free text never does', () => {
  const plan = { evidence: [{ ask: 'type:winery' }, { ask: 'kind:museum' }], notIncluded: [
    { kind: 'spa', reason: 'none_listed', nearest: { id: 1563, name: 'X' }, text: 'There’s no spa listed in Osoyoos, so this plan has none.' },
    { kind: 'museum', reason: 'not_fitted', text: 'said by the evidence already' },
    { kind: 'season', reason: 'out_of_season', text: 'Free text is never carried.' },
    { kind: 'bowling', reason: 'not_fitted', nearest: null, text: 'x' }, { kind: 'bowling', reason: 'not_fitted', text: 'twice' }] };
  assert.deepEqual(H.shareNotIncluded(plan), ['spa:n:1563', 'bowling:f']);
  const c = H.parseShareContext({ ni: 'spa:n:1563,bowling:f,spa:f,<b>:n,zzz:x,cinema:n:0', wt: '325656P14' });
  assert.deepEqual(c.notIncluded, [{ kind: 'spa', reason: 'none_listed', nearestId: 1563 }, { kind: 'bowling', reason: 'not_fitted' }]);
  assert.equal(c.wineTour, '325656P14');
  assert.equal(H.shareContextQuery(c), 'ni=spa:n:1563,bowling:f&wt=325656P14'); // the EN / FR switch keeps both
  // The plan's own town rides along as its slug (only with ni=).
  assert.deepEqual(H.parseShareContext({ ni: 'spa:n', nt: 'pemberton,mount-currie' }).niTowns, ['pemberton', 'mount-currie']);
  assert.equal(H.parseShareContext({ ni: 'spa:n', nt: 'Bad Town' }).niTowns, undefined);
  assert.equal((H.parseShareContext({ nt: 'pemberton', ad: '2' }) || {}).niTowns, undefined);
  assert.equal(H.shareContextQuery(H.parseShareContext({ ni: 'spa:n', nt: 'pemberton' })), 'ni=spa:n&nt=pemberton');
  assert.match(V4, /out \+= '&nt=' \+ nt\.join\(','\)/);
  for (const bad of ['', 'a b', '../x', 'P1;drop', 'x'.repeat(21)]) assert.equal((H.parseShareContext({ wt: bad, ad: '2' }) || {}).wineTour, undefined, bad);
  // The page builds the same tokens, and the chat adds the tour's stored code.
  assert.match(V4, /out \+= '&ni=' \+ ni\.slice\(0, 3\)\.join\(','\)/);
  assert.match(CHAT_PAGE, /'&wt=' \+ w\.code/);
  assert.match(CHAT_PAGE, /Suggested, not booked: /);
  assert.match(CHAT_PAGE, /Suggestion, non réservée : /);
});

test('2. the shared copy says the unmet ask in the plan’s own words (EN + FR), rebuilt from the listings', () => {
  const t = app.tripNotIncludedText('spa', true, TOWN, { name: 'Stillwater Day Spa ST', regionLabel: 'Elsewhere' });
  assert.equal(t.text, `There’s no spa listed in ${TOWN}, so this plan has none. The nearest is Stillwater Day Spa ST in Elsewhere.`);
  const q = { ...baseQ(), ni: `spa:n:${F.SPA.id},museum:f` };
  const en = app.tripShareContext(q, 'en'), fr = app.tripShareContext(q, 'fr');
  const line = (c, k) => c.lines.find((l) => l.ask === `not_included:${k}`);
  assert.equal(line(en, 'spa').status, 'unmet');
  assert.equal(line(en, 'spa').text, `There’s no spa listed in ${TOWN}, so this plan has none. The nearest is Stillwater Day Spa ST in ${TOWN}.`);
  assert.match(line(fr, 'spa').text, new RegExp(`^Aucun lieu « spa » n’est répertorié à ${TOWN} : ce plan n’en a pas\\. Le plus proche : Stillwater Day Spa ST, à ${TOWN}\\.$`));
  assert.equal(line(en, 'museum').text, 'I couldn’t fit a museum into this plan.');
  const html = app.tripShareContextHtml(en, 'en');
  assert.ok(html.includes(`<li data-ev-status="unmet">There’s no spa listed in ${TOWN}, so this plan has none.`));
  // A nearest listing that no longer exists is left out of the sentence; an unknown kind makes no line; a kind the
  // copy has a stop of is not "not in this plan"; an ask the evidence already says is not said twice.
  const gone = app.tripShareContext({ ...baseQ(), ni: 'spa:n:9999999,notakind:n,winery:f' }, 'en');
  assert.deepEqual(gone.lines.filter((l) => /^not_included:/.test(l.ask)).map((l) => l.text), [`There’s no spa listed in ${TOWN}, so this plan has none.`]);
  const twice = app.tripShareContext({ ...baseQ(), asks: 'type:winery,kind:spa', ni: 'spa:n' }, 'en');
  assert.equal(twice.lines.filter((l) => /spa/i.test(l.text)).length, 1);
  // nt= names the plan's own town; an unknown slug falls back to the stops' towns.
  assert.equal(app.tripShareContext({ ...baseQ(), ni: 'spa:n', nt: REGION }, 'en').lines.find((l) => l.ask === 'not_included:spa').text, `There’s no spa listed in ${TOWN}, so this plan has none.`);
  assert.equal(app.tripShareContext({ ...baseQ(), ni: 'spa:n', nt: 'nowhere-town' }, 'en').lines.find((l) => l.ask === 'not_included:spa').text, `There’s no spa listed in ${TOWN}, so this plan has none.`);
  // A link with ni= and nothing else of the context still opens with its line.
  const only = app.tripShareContext({ stops: baseQ().stops, ni: 'spa:f' }, 'en');
  assert.deepEqual(only.lines.map((l) => l.text), ['I couldn’t fit a spa into this plan.']);
});

test('3. the suggested tour: labelled a suggestion, its stored name and one stored link; nothing when it cannot be resolved', { skip: !HAS_TOURS && 'this site has no stored wine tours' }, () => {
  const data = require('../wine-tours.js').loadData();
  const area = Object.keys(data.areas)[0], it = data.areas[area];
  const c = app.tripShareContext({ ...baseQ(), wt: it.productCode, td: '2027-05-07_2027-05-09', ts: 'r' }, 'en');
  assert.equal(c.tour.name, it.title);
  assert.ok(c.tour.url.startsWith(it.url.split('?')[0]), 'the stored product page, never a search');
  const html = app.tripShareContextHtml(c, 'en'), fr = app.tripShareContextHtml(app.tripShareContext({ ...baseQ(), wt: it.productCode }, 'fr'), 'fr');
  assert.match(html, /data-mt-tour="[A-Za-z0-9]+"><p class="mt-ctx-k">Suggested, not booked<\/p>/);
  assert.ok(html.includes('A wine tour you asked to see. It is not in the itinerary.'));
  assert.equal((html.match(/data-link="viator"/g) || []).length, 1, 'one booking button');
  assert.ok(html.includes(`href="${c.tour.url.replace(/&/g, '&amp;')}"`));
  if (/\bpick ?up\b/i.test(it.why || '')) assert.ok(html.includes('Its listing says it picks up at your accommodation; check pickup details and dates when you book.'));
  assert.match(fr, /Suggestion, non réservée/);
  assert.ok(fr.includes('Un tour des vignobles que vous avez demandé à voir. Il ne fait pas partie de l’itinéraire.'));
  // Nothing says the tour or its pickup is available on the trip's dates, and it is not among the stops.
  const block = html.slice(html.indexOf('data-mt-tour'), html.indexOf('</div>', html.indexOf('data-mt-tour')));
  assert.ok(!/May 7|May 9|2027|available|confirmed|booked for/i.test(block.replace('Suggested, not booked', '')), block);
  // Unknown code, or the tour links switched off: no card at all.
  assert.equal(app.tripShareContext({ ...baseQ(), wt: 'NOPE123' }, 'en').tour, undefined);
  assert.ok(!app.tripShareContextHtml(app.tripShareContext({ ...baseQ(), wt: 'NOPE123' }, 'en'), 'en').includes('data-mt-tour'));
  const pid = process.env.VIATOR_PARTNER_ID; process.env.VIATOR_PARTNER_ID = '';
  try { assert.equal(app.tripShareTour(it.productCode), null); } finally { process.env.VIATOR_PARTNER_ID = pid; }
});

test('4. a share without these is unchanged, and an older link opens as it did', () => {
  const c = app.tripShareContext(baseQ(), 'en');
  assert.equal(c.tour, undefined);
  assert.equal(c.notIncluded, undefined);
  assert.ok(!c.lines.some((l) => /^not_included:/.test(l.ask)));
  const html = app.tripShareContextHtml(c, 'en');
  assert.ok(!html.includes('data-mt-tour') && !html.includes('Suggested, not booked'));
  assert.equal(H.shareContextQuery(H.parseShareContext(baseQ())), 'ad=2&asks=type:winery,vegetarian');
  // Links from before (start/nights; asks only; stops only).
  assert.ok(app.tripShareContext({ stops: baseQ().stops, days: '1,1', start: '2027-05-07', stay: '1', nights: '2', ad: '2' }, 'en'));
  assert.equal(app.tripShareContext({ stops: baseQ().stops }, 'en'), null);
  assert.deepEqual(H.shareNotIncluded({ evidence: [], notIncluded: [] }), []);
  // A tour code that is not a stored tour (or a site with no stored tours): the link opens, with no card.
  const odd = app.tripShareContext({ ...baseQ(), wt: 'NOPE123' }, 'en');
  assert.ok(odd && odd.tour === undefined && !app.tripShareContextHtml(odd, 'en').includes('data-mt-tour'));
});

test('5. the chat: the wine tour card carries its stored code; an add that found nothing says why when the listings know', async () => {
  assert.match(fs.readFileSync(require.resolve('../server.js'), 'utf8'), /\.\.\.\(tour\.productCode \? \{ code: tour\.productCode \} : \{\}\)/);
  // One of that kind is already on the plan.
  const onPlan = [{ key: '1-midday', id: F.R1.id, day: 1, region: REGION }, { key: '2-morning', id: F.SPA.id, day: 2, region: REGION }];
  assert.deepEqual(app.tripChatAddWhy('spa', onPlan), { onPlan: { name: 'Stillwater Day Spa ST', day: 2 } });
  // A town with no listing of that kind: said by name. (A town that has one: nothing is claimed.)
  const TR = require('../trip-requirements.js');
  assert.deepEqual(app.tripChatAddWhy('spa', [{ key: '1-midday', id: F.R1.id, day: 1, region: REGION }]), {});
  assert.deepEqual(app.tripChatAddWhy('not_a_kind', onPlan), {});
  assert.ok(TR.KINDS.spa);
  const say = (r, L) => tc.buildReply({ plan: null, req: null, actions: { remove: [], keep: [] }, changed: [], results: [r] }, { lang: L });
  assert.match(say({ op: 'add', ok: false, kind: 'spa', local: true, noneIn: 'Osoyoos' }, 'en'), /^There’s no spa listed in Osoyoos, so I couldn’t add one\./);
  assert.match(say({ op: 'add', ok: false, kind: 'spa', local: true, onPlan: { name: 'Whistler Day Spa', day: 3 } }, 'en'), /^Whistler Day Spa is already on your plan \(day 3\); I didn’t find another one to add\./);
  assert.match(say({ op: 'add', ok: false, kind: 'spa', local: true, noneIn: 'Osoyoos' }, 'fr'), /^Aucun lieu « .+ » n’est répertorié à Osoyoos : je n’ai rien ajouté\./);
  // Neither known: the line it always was.
  assert.match(say({ op: 'add', ok: false, kind: 'spa', local: true }, 'en'), /^I couldn’t find .+ open nearby at that time\./);
  assert.ok(!/open nearby/.test(say({ op: 'add', ok: false, kind: 'spa', local: true, noneIn: 'Osoyoos' }, 'en')));
  for (const L of ['en', 'fr']) for (const k of ['addOnPlan', 'addNoneListed']) assert.ok(tc.T[L][k]);
});
