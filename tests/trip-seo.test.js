'use strict';
// Trip SEO (2026-11-18): /trip (Build My Trip) for trip-planner and itinerary searches. The served page carries the new
// title, description and H1, an answer-first intro, example trips and a short FAQ in its server HTML; a /trip address
// with a query (?q= examples, shared plans) is noindex, follow and canonical to /trip; plain /trip stays indexable and
// canonical to itself; the sitemap still lists /trip once and no /trip?... address; /fr/trip has the French text and
// stays noindex (FRENCH_INDEXABLE is false).
require('../test-network-guard').install(); // no real network or email from tests
process.env.TRIP_PLANNER_V3 = 'on'; // as in production
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server');
const v3 = require('../trip-planner-v3-page.js');
const SITE_PAGE = require('../trip-site.js').page;

let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => new Promise((resolve) => srv.close(resolve)));

const get = async (p) => {
  const r = await fetch(base + p, { headers: { 'user-agent': 'okanaganroam-check/1.0' } });
  return { status: r.status, html: await r.text() };
};
const head = (html) => html.split('</head>')[0];
const metaContent = (html, sel) => { const m = new RegExp(`<meta ${sel} content="([^"]*)"`).exec(head(html)); return m ? m[1] : null; };
const canonical = (html) => { const m = /<link rel="canonical" href="([^"]*)"/.exec(head(html)); return m ? m[1] : null; };
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
// The English text a visitor sees: the page body without the hidden French spans/links.
const englishText = (html) => html.replace(/<(span|a)[^>]*class="t3-fr"[^>]*>[\s\S]*?<\/\1>/g, '');

test('/trip: trip-planner title, description and a visible H1, with Build My Trip kept as the eyebrow', async () => {
  const { status, html } = await get('/trip');
  assert.equal(status, 200);
  const title = decode(/<title>([^<]*)<\/title>/.exec(html)[1]);
  assert.equal(title, 'Okanagan Trip Planner: Free Day-by-Day Itinerary | Okanagan Roam');
  assert.ok(title.length <= 65, `title ${title.length} chars`);
  const desc = decode(metaContent(html, 'name="description"'));
  assert.match(desc, /^Plan an Okanagan trip in one sentence: a free day-by-day itinerary for Kelowna, Penticton, Vernon and wine country/);
  assert.ok(desc.length >= 120 && desc.length <= 160, `description ${desc.length} chars`);
  assert.equal(decode(metaContent(html, 'property="og:title"')), title);
  const h1 = /<h1 class="t3-title" id="t3Title"><span class="t3-en">([^<]+)<\/span>/.exec(html);
  assert.ok(h1, 'server-rendered H1 with English text');
  assert.equal(h1[1], 'Okanagan trip planner');
  assert.match(html, /<p class="t3-eyebrow" data-i18n="tripv3.name">Build My Trip<\/p>/);
});

test('/trip: intro, example trip links and FAQ are in the server HTML, below the planner', async () => {
  const { html } = await get('/trip');
  const at = (s) => html.indexOf(s);
  assert.ok(at('id="t3About"') > at('id="t3Form"'), 'the intro comes after the input box');
  const text = englishText(html);
  for (const s of SITE_PAGE.seo.intro.en) assert.ok(decode(text).includes(s), `intro: ${s}`);
  assert.match(decode(text), /free Okanagan trip planner/);
  assert.match(decode(text), /nothing to sign up for/);
  assert.match(decode(text), /open on your dates/);
  assert.equal(SITE_PAGE.seo.examples.length, 6);
  for (const e of SITE_PAGE.seo.examples) {
    const href = `/trip?q=${encodeURIComponent(e.en)}`;
    assert.ok(html.includes(`<a class="t3-en" href="${href}">${e.en}</a>`), `example link: ${e.en}`);
    // The link replays the request exactly like a shared link.
    assert.equal(v3.t3QueryToState(href.slice(5), []).text, e.en);
    assert.equal(v3.t3QueryToState(`?q=${encodeURIComponent(e.fr)}`, []).text, e.fr);
  }
  assert.equal(SITE_PAGE.seo.faq.length, 4);
  for (const f of SITE_PAGE.seo.faq) {
    assert.ok(decode(html).includes(`<h3><span class="t3-en">${f.q.en}</span>`), `FAQ question: ${f.q.en}`);
    assert.ok(decode(html).includes(`<p><span class="t3-en">${f.a.en}</span>`), `FAQ answer: ${f.q.en}`);
  }
  // No FAQ JSON-LD (the site has no FAQPage helper); the breadcrumb is the only structured data.
  assert.doesNotMatch(html, /FAQPage/);
});

test('/trip stays indexable and canonical to itself', async () => {
  const { html } = await get('/trip');
  assert.equal(canonical(html), 'https://okanaganroam.com/trip');
  assert.equal(metaContent(html, 'name="robots"'), null);
});

test('/trip?q=... (example and shared-plan links) is noindex, follow and canonical to /trip', async () => {
  for (const p of [`/trip?q=${encodeURIComponent('2 days in Kelowna')}`, '/trip?q=Date+night+in+Kelowna&seed=3', '/trip?region=kelowna', '/trip?utm_source=instagram']) {
    const { status, html } = await get(p);
    assert.equal(status, 200, p);
    assert.equal(canonical(html), 'https://okanaganroam.com/trip', p);
    assert.equal(metaContent(html, 'name="robots"'), 'noindex, follow', p);
    assert.equal((head(html).match(/<meta name="robots"/g) || []).length, 1, `${p}: one robots tag`);
  }
});

test('sitemap: /trip listed once, no /trip?... or new trip address', async () => {
  const { status, html: xml } = await get('/sitemap.xml');
  assert.equal(status, 200);
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.filter((l) => l === 'https://okanaganroam.com/trip').length, 1);
  assert.equal(locs.filter((l) => /\/trip\?|\/trip&/.test(l)).length, 0);
  assert.equal(locs.filter((l) => /^https:\/\/okanaganroam\.com\/(fr\/)?trip(\/|$)/.test(l) && l !== 'https://okanaganroam.com/trip').length, 0);
});

test('/fr/trip: the French title, description, H1, intro, examples and FAQ; still noindex', async () => {
  const { status, html } = await get('/fr/trip');
  assert.equal(status, 200);
  assert.match(html, /<html lang="fr"/);
  assert.equal(decode(/<title>([^<]*)<\/title>/.exec(html)[1]), 'Itinéraire gratuit jour par jour dans l’Okanagan | Okanagan Roam');
  assert.match(decode(metaContent(html, 'name="description"')), /^Planifiez votre voyage dans l’Okanagan en une phrase/);
  assert.equal(metaContent(html, 'name="robots"'), 'noindex, follow');
  assert.equal(canonical(html), 'https://okanaganroam.com/fr/trip');
  assert.ok(html.includes(`<span class="t3-fr" lang="fr">${SITE_PAGE.titleFr}</span>`), 'French H1');
  const x = SITE_PAGE.seo;
  assert.ok(decode(html).includes(x.intro.fr.join(' ')), 'French intro');
  for (const e of x.examples) assert.ok(html.includes(`<a class="t3-fr" lang="fr" href="/fr/trip?q=${encodeURIComponent(e.fr)}">${e.fr}</a>`), `French example: ${e.fr}`);
  for (const f of x.faq) assert.ok(decode(html).includes(`<span class="t3-fr" lang="fr">${f.a.fr}</span>`), `French FAQ: ${f.q.fr}`);
  const q = await get(`/fr/trip?q=${encodeURIComponent(x.examples[0].fr)}`);
  assert.equal(metaContent(q.html, 'name="robots"'), 'noindex, follow');
  assert.equal(canonical(q.html), 'https://okanaganroam.com/fr/trip');
});
