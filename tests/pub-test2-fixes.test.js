// Second first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub2-2026-11-10/REPORT.md). The setup code
// is shared, so restaurants get the same fixes. Friction 1–7 (hours notes and "Copy Monday", photos, Facebook in the
// top tiles, What you offer, happy hour day buttons, the greyed badge, wording) and bugs A–F.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test2-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const TEXT = require('../owner-setup-text.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:30', d === 'fri' || d === 'sat' ? '01:00' : '23:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT2 ${type} ${++n}`, slug: `pt2-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: `${n} Main St, Penticton`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the second pub test fix tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p, headers = {}) => fetch(base + p, { headers }).then(async (r) => ({ status: r.status, text: await r.text() }));
const text = (p, headers) => get(p, headers).then((r) => r.text);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.78.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });

// The page's own lateNote(), run on its own with the setup's words.
function lateNoteFrom(script, lang) {
  const src = /function lateNote\(d, y\)\{[\s\S]*?\n  \}/.exec(script)[0];
  const T = lang === 'fr' ? TEXT.fr : TEXT.en;
  const names = lang === 'fr' ? { mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche' } : { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const t12src = /function t12\(v\)\{.*?\}\n/.exec(script)[0];
  const ctx = { T, C: { lang, longDays: names }, DAYS: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], dayName: (d) => names[d].slice(0, 3), fill: (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m)) };
  vm.createContext(ctx); vm.runInContext(t12src + src + '; this.lateNote = lateNote;', ctx);
  return ctx.lateNote;
}

// ---------- Friction 1: hours ----------
test('1: closing times after midnight get a plain note (EN+FR); "Copy Monday to every day" sits under Monday', async () => {
  for (const type of ['pub', 'restaurant']) {
    const v = mk(type); const html = await text(`/owner/${tokenFor(v.id)}/setup`), s = scriptOf(html);
    const en = lateNoteFrom(s, 'en');
    assert.equal(en('fri', ['11:30', '00:00']), '= midnight');
    assert.equal(en('fri', ['11:30', '24:00']), '= midnight');
    assert.equal(en('fri', ['11:30', '01:00']), '1 AM (early Saturday morning)');
    assert.equal(en('sun', ['16:00', '02:30']), '2:30 AM (early Monday morning)');
    assert.equal(en('fri', ['11:30', '23:00']), '', 'no note before midnight');
    const fr = lateNoteFrom(s, 'fr');
    assert.equal(fr('fri', ['11:30', '00:00']), '= minuit');
    assert.equal(fr('fri', ['11:30', '01:00']), '1 h (tôt samedi matin)');
    // The note is in the time row, updates as the owner types, and the copy button is after Monday's card, not at the top.
    assert.match(s, /id="suLate' \+ d \+ j \+ '"/);
    assert.match(s, /n3\.textContent = t3; n3\.hidden = !t3;/);
    // Pub test 4: the copy buttons are on every open day ("Copy these hours to: Every day / Mon–Fri").
    // Pub test 5: "Every open day" (Every day only when no other day is open).
    assert.match(s, /data-copyall="' \+ d \+ '">' \+ h\(DAYS\.every\(function\(x\)\{ return x === d \|\| copyGets\(d, x\); \}\) \? T\.copyAll : T\.copyOpen\)/); // café test 4
    assert.doesNotMatch(s, /msgs\(\) \+ \(anyOpenDay/);
  }
  assert.equal(TEXT.en.sameEvery, 'Copy Monday to every day');
  assert.equal(TEXT.fr.sameEvery, 'Copier lundi à tous les jours');
});

// ---------- Friction 2: photos ----------
test('2: the too-small words; the red box never covers ✕; the current main photo is kept unless the owner picks a new one', async () => {
  assert.equal(TEXT.en.tooSmall, 'This one would look blurry. Pick a different one.');
  assert.equal(TEXT.fr.tooSmall, 'Celle-ci serait floue. Choisissez-en une autre.');
  const withPhoto = mk('pub', { image_url: '/images/venues/pt2-main.jpg' });
  const html = await text(`/owner/${tokenFor(withPhoto.id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.image, '/images/venues/pt2-main.jpg');
  // The red box is in the flow (not over the photo), and ✕ sits above everything.
  assert.match(html, /\.su-badmsg \{ position: static;/);
  assert.match(html, /\.su-ph \.su-x \{ z-index: 2; \}/);
  // With a main photo already, new uploads are not main until the owner says so; "Keep my current main photo" is the default.
  assert.match(s, /if \(C\.image && S\.keepMain !== false\) S\.photos\.forEach\(function\(ph\)\{ ph\.main = false; \}\);/);
  assert.match(s, /data-act="keepMain" aria-pressed="' \+ \(keeping \? 'true' : 'false'\)/);
  assert.match(s, /if \(k === 'keepMain'\) \{ S\.keepMain = true; S\.photos\.forEach\(function\(ph\)\{ ph\.main = false; \}\);/);
  assert.match(s, /ph\.main = i === k; \}\); S\.keepMain = false;/, 'tapping "Make main photo" is the only way a new one becomes main');
  assert.match(s, /body\.main = !!ph\.main;/, 'only a photo the owner marked main asks to be main');
  assert.equal(TEXT.en.keepMain, 'Keep my current main photo');
  assert.ok(TEXT.fr.keepMain && TEXT.fr.curMain && TEXT.fr.reviewLeadKeep);
  // No photo yet: the first good one is the main one, as before.
  const none = mk('restaurant');
  assert.equal(cfgOf(await text(`/owner/${tokenFor(none.id)}/setup`)).image, '');
});

// ---------- Friction 3: Facebook ----------
test('3: Facebook is one of the top Part 2 tiles for pubs and restaurants', async () => {
  const pub = cfgOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  const rest = cfgOf(await text(`/owner/${tokenFor(mk('restaurant').id)}/setup`));
  // Pub test 3 (2026-11-10): Instagram joins it, right before Facebook.
  assert.deepEqual(pub.top2, ['music', 'specials', 'story', 'groups', 'instagram', 'facebook']);
  assert.deepEqual(rest.top2, ['happy', 'specials', 'music', 'story', 'instagram', 'facebook']);
  assert.ok(pub.part2.includes('facebook') && rest.part2.includes('facebook'));
});

// ---------- Friction 4: What you offer ----------
test('4: "Save these" is not sticky on What you offer; a pub\'s wine tile is just "Local wine"', async () => {
  const pubHtml = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), s = scriptOf(pubHtml);
  assert.match(s, /'<div class="su-stack su-offer-save">' \+ big\('✓', T\.saveOffer/);
  assert.doesNotMatch(s, /su-sticky su-sticky-clear">' \+ big\('✓', T\.saveOffer/);
  const pub = cfgOf(pubHtml);
  assert.equal(pub.offerLabels.local_drinks, 'Local wine');
  assert.equal(pub.offerLabels.local_beer_taps, 'Local or craft beer on tap'); // pub test 4
  const pubFr = cfgOf(await text(`/fr/owner/${tokenFor(mk('pub').id)}/setup`).catch(() => ''));
  assert.equal(pubFr.offerLabels.local_drinks, 'Vins locaux');
  const rest = cfgOf(await text(`/owner/${tokenFor(mk('restaurant').id)}/setup`));
  assert.equal(rest.offerLabels.local_drinks, 'Local wine & craft beer', 'restaurants keep theirs');
});

// ---------- Friction 5: happy hour ----------
test('5: happy hour day chips get "Every day" and "Mon–Fri"', async () => {
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  assert.match(s, /data-act="hhDays:' \+ i \+ ',all">' \+ h\(T\.everyDay\)/);
  assert.match(s, /data-act="hhDays:' \+ i \+ ',wk">' \+ h\(T\.monFri\)/);
  assert.match(s, /if \(k === 'hhDays'\) \{ readEntries\(\);/);
  // Run the handler's day rule.
  const rule = (which) => { const days = {}; ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((d) => { if (which === 'all' || ['mon', 'tue', 'wed', 'thu', 'fri'].indexOf(d) >= 0) days[d] = true; }); return Object.keys(days); };
  assert.deepEqual(rule('wk'), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.equal(rule('all').length, 7);
  assert.equal(TEXT.en.everyDay, 'Every day'); assert.equal(TEXT.en.monFri, 'Mon–Fri');
  assert.equal(TEXT.fr.everyDay, 'Tous les jours'); assert.equal(TEXT.fr.monFri, 'Lun–ven');
});

// ---------- Friction 6: finish ----------
test('6: the Complete & Verified pill is greyed with "Reach 100% to earn it" until it is earned', async () => {
  const s = scriptOf(await text(`/owner/${tokenFor(mk('restaurant').id)}/setup`));
  assert.match(s, /<span class="su-badge-pill' \+ \(sc\.badge === 'earned' \? '' : ' su-badge-off'\)/);
  assert.match(s, /' <span class="su-badge-reach">' \+ h\(Math\.max\(sc\.pct, sc\.soon \|\| 0\) < 100 \|\| sc\.soon < sc\.pct \? T\.badgeReach : T\.badgeSoon\)/);
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`);
  assert.match(html, /\.su-badge-off \{ filter: grayscale\(1\); opacity: \.5; \}/);
  assert.equal(TEXT.en.badgeReach, 'Reach 100% to earn it');
  assert.equal(TEXT.fr.badgeReach, 'Atteignez 100 % pour l’obtenir');
});

// ---------- Friction 7: wording ----------
test('7: the spend guess, the pub sports hint, and what "Sent" means', async () => {
  assert.equal(TEXT.en.spendGuess, 'We guessed ${n} from what we found online.');
  assert.match(TEXT.fr.spendGuess, /trouvé en ligne/);
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  assert.match(s, /CUR\.avg_spend\.source === 'research' \? ' ' \+ fill\(T\.spendGuess/, 'only when the figure is from our research');
  assert.doesNotMatch(TEXT.en.pub.sportsEx, /Big games with sound/);
  assert.match(TEXT.en.pub.sportsEx, /sound on for big games/); // pub test 3: now a "Tip:", not a question
  assert.doesNotMatch(TEXT.fr.pub.sportsEx, /De grands matchs avec le son/);
  // Pub test 3 (2026-11-10): said once, in the lead (it used to repeat "It'll show within a day" under it).
  assert.equal(TEXT.en.sentMeans, 'We check it first, then add it to your page within a day.'); // café test 3: plainer // café test 1 (2026-11-11): one set of success words
  assert.ok(TEXT.fr.sentMeans);
  assert.match(s, /if \(sentStep && !S\.sentExplained\) S\.sentExplained = p\[1\];/);
  assert.match(s, /if \(explain\) line = T\.sentMeans;/);
});

// ---------- A: happy hour source ----------
test('A: an owner\'s happy hour is stored with the owner marker, not our page address', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const r = await change(t, { happy_hour: { mon: [], tue: [['15:00', '17:00']], wed: [], thu: [], fri: [], sat: [], sun: [] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = db.prepare('SELECT happy_hour_times, happy_hour_source FROM venues WHERE id = ?').get(v.id);
  assert.match(row.happy_hour_times, /15:00/);
  assert.equal(row.happy_hour_source, 'venue_owner');
});

// ---------- B: Your updates ----------
test('B: "Your updates" folds the rest behind "Show all (N)" and shows a repeated line once', () => {
  const sentAt = '2026-11-10T18:00:00Z';
  const items = [];
  for (let i = 0; i < 16; i++) items.push({ kind: 'change', title: `Update ${i}`, status: 'approved', sent: sentAt });
  items.push({ kind: 'change', title: 'Update 3', status: 'approved', sent: sentAt }); // a repeat
  const html = app.ownerActivityHtml(items, 'en', new Date('2026-11-10T20:00:00Z'));
  assert.equal((html.match(/<li/g) || []).length, 16, 'the repeat is shown once');
  assert.equal((html.match(/class="op-act-old" hidden/g) || []).length, 4, 'items past 12 fold');
  assert.match(html, /Show all \(16\)/);
  assert.match(app.ownerActivityHtml(items, 'fr', new Date('2026-11-10T20:00:00Z')), /Tout afficher \(16\)/);
  // ownerVenueActivity is no longer capped at 10 change requests.
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /ownerActivityHtml\(ownerVenueActivity\(venue\.id, 200, lang\), lang\)/);
});

// ---------- C: dates in Vancouver time ----------
test('C: owner dates use the Okanagan time zone, server and page', async () => {
  // 7:30 AM UTC on Nov 11 is still Nov 10 in Kelowna.
  const html = app.ownerActivityHtml([{ kind: 'change', title: 'Hours', status: 'approved', sent: '2026-11-11 07:30:00' }], 'en', new Date('2026-11-11T08:00:00Z'));
  assert.match(html, /Sent Nov 10/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /toLocaleDateString\(T\.locale, \{ month: 'short', day: 'numeric', timeZone: 'America\/Vancouver' \}\)/);
});

// ---------- D: the sticky tab bar ----------
test('D: the section tab that holds the reading line is the current one, whatever the nav order', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'food-drink-venue.js'), 'utf8');
  function run(sectionRects, navOrder, scroll = { y: 800, inner: 844, height: 5000 }) {
    const links = navOrder.map((id) => { const a = { attrs: { href: '#' + id }, getAttribute: (k) => a.attrs[k], setAttribute: (k, v) => { a.attrs[k] = v; }, removeAttribute: (k) => { delete a.attrs[k]; } }; return a; });
    const sections = Object.fromEntries(Object.entries(sectionRects).map(([id, r]) => [id, { id, getBoundingClientRect: () => ({ top: r[0], bottom: r[1] }) }]));
    const nav = { querySelectorAll: () => links, offsetHeight: 50 };
    let raf = null;
    const ctx = {
      document: { querySelector: (sel) => (sel === '.fd-section-nav' ? nav : sel.startsWith('#') ? sections[sel.slice(1)] || null : null), querySelectorAll: () => [], getElementById: (id) => sections[id] || null, addEventListener() {}, documentElement: { scrollHeight: scroll.height } },
      window: { addEventListener() {}, matchMedia: () => ({ matches: true }), innerHeight: scroll.inner, pageYOffset: scroll.y, scrollY: scroll.y },
      location: { hash: '' }, getComputedStyle: () => ({ top: '60px' }), requestAnimationFrame: (f) => { raf = f; }, setTimeout() {}, Date, Array, Math, parseFloat,
    };
    vm.createContext(ctx); vm.runInContext(src, ctx);
    if (raf) raf();
    return links.find((a) => a.attrs['aria-current'] === 'location').attrs.href;
  }
  // Deals is above Hours on the page but after it in the nav: Hours holds the line, so Hours is current.
  assert.equal(run({ venueHours: [100, 700], deals: [-600, 90] }, ['venueHours', 'deals']), '#venueHours');
  assert.equal(run({ venueHours: [-900, -300], deals: [-300, 400], menu: [400, 900] }, ['menu', 'deals', 'venueHours']), '#deals');
  // At the bottom of the page the lowest section in view wins.
  assert.equal(run({ venueHours: [-200, 300], deals: [300, 600] }, ['venueHours', 'deals'], { y: 4156, inner: 844, height: 5000 }), '#deals');
});

// ---------- E: patio-only dogs ----------
test('E: a pub whose dog note is patio-only shows "Dogs on the patio", not a plain "Dog-friendly"', () => {
  const v = mk('pub', { dog_friendly: 1 });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Dogs', text: 'Dogs welcome on the patio' }] }));
  const html = page(v, 'en');
  assert.match(html, /Dogs on the patio/);
  assert.match(page(v, 'fr'), /Chiens sur la terrasse/);
  // Inside too: unchanged.
  const w = mk('pub', { dog_friendly: 1 });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(w.id, JSON.stringify({ rows: [{ label: 'Dogs', text: 'Dogs welcome inside and on the patio' }] }));
  assert.doesNotMatch(page(w, 'en'), /Dogs on the patio/);
});

// ---------- F: See your page on a local server ----------
test('F: on a local server, "See your page" links point at this server; elsewhere they stay on the live site', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const setup = await text(`/owner/${t}/setup`);
  assert.equal(cfgOf(setup).pageHref.startsWith(base + '/'), true, cfgOf(setup).pageHref);
  assert.doesNotMatch(setup, /https:\/\/okanaganroam\.com\/food-drink\//);
  const portal = await text(`/owner/${t}`);
  assert.doesNotMatch(portal, /href="https:\/\/okanaganroam\.com\/food-drink\//);
  // A production Host header keeps the live address.
  const live = await new Promise((resolve, reject) => {
    const rq = http.request({ host: '127.0.0.1', port: srv.address().port, path: `/owner/${t}/setup`, headers: { Host: 'okanaganroam.com' } }, (rs) => { let b = ''; rs.setEncoding('utf8'); rs.on('data', (c) => { b += c; }); rs.on('end', () => resolve(b)); });
    rq.on('error', reject); rq.end();
  });
  assert.match(cfgOf(live).pageHref, /^https:\/\/okanaganroam\.com\//);
});
