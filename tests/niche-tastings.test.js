const test = require('node:test');
const assert = require('node:assert/strict');
const { nicheTastingsHtml } = require('../niche-tastings');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
test('Niche tasting options retain recorded prices and durations, including decimal prices', () => {
  const html = nicheTastingsHtml({ rows:[{label:'Tastings',text:'Splash & Dash: guided tasting of 4 wines, $15.50, 30 min. Tarot tasting $17.25. Book online.'},{label:'Vineyard walk',text:'Vineyard walk, $35, 60 min, Fri-Sun.'}] },esc);
  assert.match(html, /\$15\.50/); assert.match(html, /\$17\.25/); assert.match(html, /\$35/);
  assert.match(html, /30 min/); assert.match(html, /60 min/);
  assert.equal((html.match(/fd-tasting-option/g)||[]).length,3);
});
test('A different recorded tasting is preserved without invented price cards', () => {
  const html = nicheTastingsHtml({ rows:[{label:'Tastings',text:'Tastings by appointment.'}] },esc);
  assert.match(html,/Tastings by appointment/); assert.doesNotMatch(html,/\$/);
  assert.equal(nicheTastingsHtml({rows:[]},esc),'');
});
test('Tasting text is escaped and missing durations remain absent', () => {
  const html = nicheTastingsHtml({rows:[{label:'Tastings',text:'Splash & Dash: <script>alert(1)</script>, $15. Tarot tasting $17.'}]},esc);
  assert.doesNotMatch(html,/<script>/); assert.match(html,/&lt;script&gt;/); assert.doesNotMatch(html,/🕒/);
});

test('Verified Niche prices show the per-person basis and correct the old tarot price', () => {
  const prices = require('../data/niche-tasting-prices.json');
  const info = {checked_at:'2026-10-29',rows:[{label:'Tastings',text:'Splash & Dash: guided tasting of 4 wines, $15, 30 min. Tarot tasting $17. Book online.'},{label:'Vineyard walk',text:'Vineyard walk, $35, 60 min, Fri-Sun.'}]};
  const html = nicheTastingsHtml(info,esc,prices);
  assert.equal((html.match(/class="fd-tasting-basis">per person/g)||[]).length,3);
  assert.match(html, /\$18<\/strong>/); assert.doesNotMatch(html,/\$17/);
  const { nicheVisitInfoWithPrices } = require('../niche-tastings');
  const revised = nicheVisitInfoWithPrices(info,prices);
  assert.match(revised.rows[0].text,/\$15 per person/);
  assert.match(revised.rows[0].text,/Tarot tasting \$18 per person/);
  assert.match(revised.rows[1].text,/\$35 per person/);
  assert.match(info.rows[0].text,/Tarot tasting \$17/,'original record stays intact');
});
test('A newer unverified price is preserved instead of overwritten by the verification snapshot', () => {
  const prices = require('../data/niche-tasting-prices.json');
  const info = {rows:[{label:'Tastings',text:'Splash & Dash: guided tasting, $25, 30 min.'}]};
  const html = nicheTastingsHtml(info,esc,prices);
  assert.match(html,/\$25/); assert.doesNotMatch(html,/per person/); assert.doesNotMatch(html,/\$15/);
});
