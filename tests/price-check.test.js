'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createPriceCheck, extractPrices, judge, robotsAllows } = require('../price-check');

const page = (body, status = 200, type = 'text/html') => ({ ok: status < 400, status, headers: { get: () => type }, text: async () => body });

function setup(pages, prices) {
  const db = new DatabaseSync(':memory:');
  const fetchFn = async (url) => {
    if (url.endsWith('/robots.txt')) return pages.robots ? page(pages.robots) : page('', 404);
    const p = pages[url];
    if (p instanceof Error) throw p;
    return p || page('', 404);
  };
  const pc = createPriceCheck({ db, prices, fetchFn, venueName: (id) => `Place ${id}` });
  return { db, pc };
}

test('dollar amounts are read from page text, not scripts, with a little context', () => {
  const f = extractPrices('<script>var x="$999"</script><p>Tasting flight&nbsp;<b>$15</b> per person</p><p>Tour $1,250.00 &#36;24.50</p><p>$15 again</p>');
  assert.deepEqual(f.map((x) => x.amount), [15, 1250, 24.5]);
  assert.match(f[0].context, /Tasting flight \$15 per person/);
});

test('a price still on its page is confirmed; a missing one is changed; no prices or no page is flagged', () => {
  assert.equal(judge(15, { ok: true, body: '<p>Flight $15</p>' }).status, 'confirmed');
  assert.equal(judge(15, { ok: true, body: '<p>Tasting flight $18</p>' }, 'Tasting flight of four').status, 'changed');
  assert.equal(judge(15, { ok: true, body: '<p>Call us</p>' }).status, 'missing');
  assert.equal(judge(15, { ok: false, detail: 'HTTP 500' }).status, 'unreachable');
});

test('other prices on the page are not a change: bottles, fees, add-ons and far-off amounts stay quiet', () => {
  // Real cases from the first run (2026-11-08).
  assert.equal(judge(6, { ok: true, body: 'Custom Wine Boxes - Starting at $60' }, 'Flight of four wines tasting').status, 'unclear');
  assert.equal(judge(45, { ok: true, body: 'You will be charged a $10 late penalty fee for your session' }, 'Single drop-in community session').status, 'unclear');
  assert.equal(judge(35, { ok: true, body: 'Boat rental $3000' }, 'Paddleboard rental, 1 hour').status, 'unclear');
  assert.equal(judge(27.5, { ok: true, body: 'Private Lessons from just $28.60 p/p' }, 'All Ages drop-in session').status, 'unclear');
  const ds = judge(650, { ok: true, body: 'Half day from $675. Full Day $1,050' }, 'Half-day (5 hr) private fishing charter');
  assert.equal(ds.status, 'changed'); assert.equal(ds.found[0].amount, 675);
});

test('robots.txt is followed', () => {
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private', '/private/rates'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private', '/rates'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /rates', '/rates'), true);
  assert.equal(robotsAllows('', '/anything'), true);
});

test('weekly run: confirmed prices stay quiet, changed ones wait for a decision, decisions change the card price', async () => {
  const prices = {
    1: { from: 15, basis: 'Flight', source: 'https://a.test/rates' },
    2: { from: 30, per: 'person', basis: 'Tour', source: 'https://b.test/tours' },
    3: { from: 40, basis: 'Rental', source: 'https://c.test/rent' },
    4: { label: 'Ticket prices vary', source: 'https://d.test/' },
    5: { from: 10, basis: 'Menu', source: 'https://e.test/menu.pdf' },
  };
  const { db, pc } = setup({
    'https://a.test/rates': page('<p>Flight $15</p>'),
    'https://b.test/tours': page('<p>Wine tour now $35 per person</p>'),
    'https://c.test/rent': new Error('down'),
  }, prices);
  const out = await pc.runAll({ pauseMs: 0 });
  assert.equal(out.checked, 3);
  const flagged = pc.listFlagged();
  assert.deepEqual(flagged.map((r) => [r.venue_id, r.status]), [[2, 'changed']], 'a page that did not load is counted, not listed');
  assert.equal(pc.quietCount(), 1);
  assert.equal(flagged[0].found[0].amount, 35);
  assert.equal(flagged[0].name, 'Place 2');

  // Use the new price: live at once and off the list.
  assert.equal(pc.decide(2, 'approve', { edits: { from: '$35' } }).status, 200);
  assert.equal(prices[2].from, 35); assert.equal(prices[2].per, 'person');
  // Take the price off (still possible for a quiet one).
  assert.equal(pc.decide(3, 'dismiss').status, 200);
  assert.equal(prices[3], undefined);
  assert.deepEqual(pc.listFlagged(), []);
  assert.equal(pc.decide(2, 'approve', { edits: { from: 'abc' } }).status, 400);

  // Overrides last across a restart (a new instance on the same database and a fresh copy of the file).
  const fresh = JSON.parse(JSON.stringify({ 2: { from: 30, per: 'person', source: 'https://b.test/tours' }, 3: { from: 40, source: 'https://c.test/rent' } }));
  createPriceCheck({ db, prices: fresh, fetchFn: async () => page('') });
  assert.equal(fresh[2].from, 35); assert.equal(fresh[3], undefined);
});

test('"keep" stays quiet until the prices on the page change', async () => {
  const prices = { 7: { from: 20, basis: 'Kayak rental', source: 'https://k.test/p' } };
  const pages = { 'https://k.test/p': page('<p>Kayak rental now $22</p>') };
  const { pc } = setup(pages, prices);
  await pc.checkOne(7);
  assert.equal(pc.listFlagged().length, 1);
  pc.decide(7, 'keep');
  assert.equal(pc.listFlagged().length, 0);
  await pc.checkOne(7);
  assert.equal(pc.listFlagged().length, 0, 'same prices: still quiet');
  pages['https://k.test/p'] = page('<p>Kayak rental now $25</p>');
  await pc.checkOne(7);
  assert.equal(pc.listFlagged().length, 1, 'prices changed: back on the list');
  assert.equal(prices[7].from, 20, 'nothing changed on the card by itself');
});

test('a page robots.txt blocks is not read', async () => {
  let read = false;
  const db = new DatabaseSync(':memory:');
  const pc = createPriceCheck({ db, prices: { 9: { from: 5, source: 'https://r.test/x' } },
    fetchFn: async (url) => { if (url.endsWith('robots.txt')) return page('User-agent: *\nDisallow: /'); read = true; return page('$5'); } });
  const row = await pc.checkOne(9);
  assert.equal(read, false); assert.equal(row.status, 'unreachable'); assert.match(row.detail, /robots/);
});

test('the weekly timer starts a run only when the last one began over a week ago', async () => {
  let t = Date.parse('2026-11-08T10:00:00Z');
  const db = new DatabaseSync(':memory:');
  const pc = createPriceCheck({ db, prices: {}, fetchFn: async () => page(''), now: () => t });
  const first = pc.tick(); assert.ok(first); await first;
  t += 6 * 86400000; assert.equal(pc.tick(), null);
  t += 2 * 86400000; const again = pc.tick(); assert.ok(again); await again;
});
