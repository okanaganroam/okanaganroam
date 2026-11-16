'use strict';
// Menu reader regression fixtures (2026-11-16). The raw lines in tests/fixtures/menu-parse/ were read from real
// Kelowna menu pages and PDFs by the "My menu is on my website" importer. The parser runs in the owner's browser, so
// it is taken out of server.js the same way drafts/menu-import-2026-11-16 does (the text from pdfTextData up to the
// window.__menuTidy line) and run on its own. The checks are key properties, not full snapshots.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const a = src.indexOf('  function pdfTextData(items, height){');
const b = src.indexOf('  window.__menuTidy = tidyImported;', a);
assert.ok(a > 0 && b > a, 'menu reader found in server.js');
const inVm = vm.runInNewContext(src.slice(a, b) + '\n({ parseMenuLines: parseMenuLines, tidyImported: tidyImported });', {});
// Results are copied out of the sandbox so deepStrictEqual compares plain arrays and objects.
const plain = (x) => JSON.parse(JSON.stringify(x));
const reader = { parseMenuLines: (l) => plain(inVm.parseMenuLines(l)), tidyImported: (m) => plain(inVm.tidyImported(m)) };

const dir = path.join(__dirname, 'fixtures', 'menu-parse');
function load(name) { return JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')); }
// The website import: every line is sure (conf 100) and carries the page's heading level (mark).
function read(name) {
  const fx = load(name);
  return reader.tidyImported(reader.parseMenuLines(fx.lines.map((l) => ({ text: l.text, conf: l.conf == null ? 100 : l.conf, mark: l.mark || 0 }))));
}
const items = (m) => m.sections.flatMap((s) => s.items.map((it) => Object.assign({ section: s.name }, it)));
const sectionNames = (m) => m.sections.map((s) => s.name);
function hasItem(m, name, price) {
  const it = items(m).find((i) => i.name === name);
  assert.ok(it, `dish "${name}" is read (got: ${items(m).slice(0, 30).map((i) => i.name).join(' | ')})`);
  if (price !== undefined) assert.strictEqual(it.price, price, `"${name}" price`);
  return it;
}
function noSection(m, name) { assert.ok(!sectionNames(m).includes(name), `"${name}" is not a section (sections: ${sectionNames(m).join(' | ')})`); }
function noItem(m, re) { const bad = items(m).filter((i) => re.test(i.name)); assert.deepStrictEqual(bad.map((i) => i.name), [], `no dish matching ${re}`); }
function atLeast(m, n) { assert.ok(items(m).length >= n, `at least ${n} dishes (got ${items(m).length})`); }
function pricedShare(m) { const all = items(m); return all.filter((i) => i.price).length / all.length; }

// ----- 1. A dish name on its own line, above its description and price -----
test('Menu reader: a dish name above "description $price" is the dish, not a section (Antico)', () => {
  const m = read('antico');
  for (const dish of ['Pomodoro', 'Bolognese', 'Crema e Tartufo', 'Margherita Di Bufala']) noSection(m, dish);
  hasItem(m, 'Pomodoro', '20');
  assert.strictEqual(hasItem(m, 'Bolognese', '22').description, 'Traditionally made with beef & pancetta');
  hasItem(m, 'Crema e Tartufo', '22');
  atLeast(m, 45);
});

test('Menu reader: name, short description, then the price on its own line (Bouchons, Half Blind Bean)', () => {
  const m = read('bouchons');
  for (const dish of ['Olives Marinées', 'Pâté de Campagne', 'Oeufs Mimosa', 'Poireaux vinaigrette']) noSection(m, dish);
  assert.strictEqual(hasItem(m, 'Oeufs Mimosa', '13.00').description, 'Mimosa Eggs');
  hasItem(m, 'Olives Marinées', '7.00');
  hasItem(m, 'Truffle Fries', '12.00');
  assert.ok(sectionNames(m).includes('Appetizers') && sectionNames(m).includes('Mains'));
  noItem(m, /^Mimosa Eggs$|^Leeks vinaigrette$/);

  const h = read('half-blind-bean');
  for (const dish of ['Caffe Lattè', 'Flat White', 'Iced Latte', 'Iced Chai']) noSection(h, dish);
  hasItem(h, 'Caffe Lattè', '5.50');
  hasItem(h, 'Iced Chai', '6.25');
  assert.strictEqual(pricedShare(h), 1);
});

test('Menu reader: a "G.F" mark under a dish is the dish\'s dietary tag, never a dish (Dozo)', () => {
  const m = read('dozo');
  noItem(m, /^g\.?f/i);
  for (const dish of ['Sichuan Cucumbers', 'Ohitashi', 'Edamame', 'Agedashi Tofu']) noSection(m, dish);
  assert.deepStrictEqual(hasItem(m, 'Sichuan Cucumbers', '4.50').dietary, ['gluten_free']);
  hasItem(m, 'Edamame', '6.00');
  atLeast(m, 90);
});

// ----- 2. Sub-headings and option lines -----
test('Menu reader: a sub-heading does not take the next dish\'s price (Diner Deluxe)', () => {
  const m = read('diner-deluxe');
  noItem(m, /^(Simple Starts|Diner Favourites|From The Griddle|Plants & Veggies)$/i);
  assert.ok(sectionNames(m).includes('Simple Starts'));
  hasItem(m, 'Yogurt & Granola Parfait', '15');
  hasItem(m, 'Breakfast Poutine', '14');
});

test('Menu reader: "Combo 1" is a dish name with its own price, not "Combo" at $1 (BNA)', () => {
  const m = read('bna-burger');
  noItem(m, /^Combo$/);
  hasItem(m, 'Combo 1', '19.99');
  hasItem(m, 'Combo 2', '23.99');
  hasItem(m, 'Fried Chicken Burger', '13.99');
});

// ----- 3. Website clutter -----
test('Menu reader: calorie and nutrition lines are not dishes, and dishes are not doubled (Denny\'s)', () => {
  const m = read('dennys');
  noItem(m, /cal(orie)?s?\b|^(total fats?|saturated|trans fats?|cholesterol|sodium|carbohydrates|fibre|sugars|protein)\b|^nutrition/i);
  assert.ok(!sectionNames(m).some((s) => /cal(orie)?s?\b|nutrition/i.test(s)), sectionNames(m).join(' | '));
  hasItem(m, 'Chicken Pesto Spaghettini', '21.99');
  hasItem(m, 'Shrimp Pasta Pomodoro', '20.99');
  const names = items(m).map((i) => i.name);
  assert.strictEqual(new Set(names).size, names.length, 'no dish twice');
});

test('Menu reader: "Get directions", "Legend ..." and the page title are left out (Cafe Quattro, Pakwaan)', () => {
  const q = read('cafe-quattro');
  noItem(q, /get directions/i);
  atLeast(q, 50);
  assert.strictEqual(pricedShare(q), 1);
  const p = read('pakwaan');
  noItem(p, /^legend\b/i);
  hasItem(p, 'Vegetable Pakora', '6.95');
  atLeast(p, 130);
});

// ----- 4. Text PDFs -----
test('Menu reader: a PDF in small letters keeps its course headings, and two sizes stay one dish (Vintners)', () => {
  const m = read('vintners-pdf');
  assert.ok(sectionNames(m).includes('breakfast'), sectionNames(m).join(' | '));
  noItem(m, /^breakfast$/i);
  hasItem(m, 'Smashed avocado toast', '16');
  hasItem(m, 'Classic benny (g*)', '13 / 17');
  hasItem(m, 'Pancakes', '12 / 16');
  noItem(m, /\bhalf \d+ full\b/i);
});

// ----- Menus that already read well must not get worse -----
const CLEAN = {
  'wok-star': { min: 89, dish: ['Honey Garlic Spareribs', '16.95'], sections: 14 },
  'pakwaan': { min: 136, dish: ['Chicken Pakora', '9.95'] },
  'manhattan-point-pdf': { min: 29, dish: ['Thai Chili Popcorn Chicken', '14'], sections: 8 },
  'maestros': { min: 32, dish: ['Smoked Olives', '14'], sections: 6 },
  'cafe-quattro': { min: 52, dish: ['Okanagan Granola Bowl', '9'], sections: 10 },
  'kayan': { min: 38, dish: ['Chicken Shawarma Plate', '18.99'], sections: 5 },
};
for (const [name, want] of Object.entries(CLEAN)) {
  test(`Menu reader: a menu that already read well still does (${name})`, () => {
    const m = read(name);
    atLeast(m, want.min);
    hasItem(m, want.dish[0], want.dish[1]);
    if (want.sections) assert.strictEqual(m.sections.length, want.sections, sectionNames(m).join(' | '));
    assert.ok(pricedShare(m) >= 0.85);
  });
}

test('Menu reader: other kept layouts (Sprout toast list, C-Lovers platters, Basil & Mint cocktails)', () => {
  const s = read('sprout');
  hasItem(s, 'Avocado Toast', '14');
  hasItem(s, 'Bacon + Eggs', '17');
  const c = read('c-lovers');
  hasItem(c, 'C-Lovers Platter', '31.39');
  hasItem(c, 'Halibut Burger', '14.49');
  const b = read('basil-and-mint');
  hasItem(b, 'Martinis', '16');
  hasItem(b, 'Negroni', '16');
  noSection(b, 'Martinis');
});

// ----- The photo / OCR path: unsure lines are still shown yellow -----
test('Menu reader: low-confidence photo lines are still flagged for checking; clutter rules do not eat dishes', () => {
  const ocr = [
    { text: 'MAINS', conf: 92 }, { text: 'Steak Frites 28', conf: 95 }, { text: 'Fish Tacos 17', conf: 60 },
    { text: 'Fries 6', conf: 95 }, { text: 'Sunday Roast 24', conf: 93 }, { text: 'Get directions', conf: 95 },
  ];
  const m = reader.parseMenuLines(ocr);
  const all = items(m);
  assert.deepStrictEqual(all.map((i) => i.name), ['Steak Frites', 'Fish Tacos', 'Fries', 'Sunday Roast']);
  assert.strictEqual(all.find((i) => i.name === 'Fish Tacos').check, true, 'low-confidence line is yellow');
  assert.strictEqual(all.find((i) => i.name === 'Steak Frites').check, false);
  assert.strictEqual(m.partial, true);
});
