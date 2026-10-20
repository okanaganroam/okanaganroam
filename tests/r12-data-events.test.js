// Round 12 (2026-10-20): data/french/events-2026-10-20-r12.json gives French to the event descriptions the round 12
// events data pass rewrites (prices, times, sold out) and to the per-date notes that showed in English on French event
// pages ("2-for-1 tastings, live music 4:45–7 pm" at Sandhill, "Shows at 2 pm and 7 pm" at the Nutcracker...).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const { FR_TEXT } = require('../french-text.js');
const R12 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'events-2026-10-20-r12.json'), 'utf8'));

test('r12 events French: every entry is loaded and none is shadowed by an earlier file', () => {
  assert.ok(Object.keys(R12).length >= 40);
  for (const [en, fr] of Object.entries(R12)) assert.equal(FR_TEXT[en], fr, en);
});

test('r12 events French: Canadian French typography (curly apostrophes, no space before ; ? !)', () => {
  for (const fr of Object.values(R12)) {
    assert.ok(!fr.includes("'"), fr);
    assert.ok(!/ [;?!]/.test(fr), fr);
    assert.ok(!/\$\d/.test(fr), `dollar sign after the amount: ${fr}`);
  }
});

test('r12 events French: per-date notes on a French event page read French', () => {
  const li = (label) => `<li class="event-date"><span class="event-date-when">Friday, November 27, 2026</span> <span class="event-date-label">${label}</span></li>`;
  const en = `<!DOCTYPE html><html lang="en"><head>\n<title>T</title>\n<link rel="canonical" href="https://okanaganroam.com/kelowna">\n</head><body><main><ul>${
    [li('2-for-1 tastings, live music 4:45–7 pm'), li('Shows at 2 pm and 7 pm'), li('New Year&#39;s Eve show'), li('Holiday Wreaths with Gems &amp; Stems ($85)')].join('')}</ul></main></body></html>`;
  const fr = app.frenchTwinHtml(en, '/kelowna');
  for (const want of ['Dégustations 2 pour 1, musique live de 16 h 45 à 19 h', 'Représentations à 14 h et à 19 h',
    'Spectacle du réveillon du Nouvel An', 'Couronnes des Fêtes avec Gems &amp; Stems (85 $)']) assert.ok(fr.includes(want), want);
  assert.ok(!fr.includes('2-for-1 tastings'));
});
