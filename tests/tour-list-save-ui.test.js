// Tour pre-launch 2 (2026-11-22): a tour typed into "Your tours and prices" disappeared when the owner tapped Done and
// left straight away (the save was only scheduled 0.8 s later). These tests go through the real screen in headless
// Chrome, with NO pause between Done and leaving:
//   - "Back to my listing" and an immediate reload, at desktop and phone widths;
//   - the default section and a section the owner added;
//   - the exact name, price, duration and section come back; one submit puts exactly one tour in review;
//   - a save that fails keeps the values and offers "Try again";
//   - the server ignores a save older than the last one it stored.
// The browser tests are skipped where Chrome isn't installed (the server tests still run).
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-list-save-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = Object.fromEntries(DAYS.map((d) => [d, [['09:00', '17:00']]]));
let n = 0;
const mk = () => app.createVenue({ name: `Save Ui Tours ${++n}`, slug: `save-ui-tours-${n}`, region: 'penticton', type: 'tour', latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${700 + n} Main St, Penticton`, phone: '250-555-0199', website: 'https://example.com', hours: JSON.stringify(WK),
  description: 'A fixture used only by the tour list save tests.' });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
const menusOf = (id) => db.prepare('SELECT id, status, data FROM venue_menus WHERE venue_id = ? ORDER BY id').all(id).map((m) => ({ ...m, data: JSON.parse(m.data || '{}') }));

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });

// ---- a very small Chrome DevTools client (no packages) ----
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
const HAVE_BROWSER = !!CHROME && typeof WebSocket === 'function';
let chrome, ws, profile, msgId = 0;
const waiting = new Map(), listeners = new Set();
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject, method }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
async function startBrowser() {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-save-ui-'));
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let buf = ''; const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    chrome.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(timer); resolve(m[1]); } });
    chrome.on('exit', () => reject(new Error('Chrome exited')));
  });
  ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); if (m.error) w.reject(new Error(`${w.method}: ${m.error.message}`)); else w.resolve(m.result); return; }
    for (const fn of listeners) fn(m);
  });
}
async function openPage(width, height, mobile) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }, sessionId);
  const page = {
    sessionId, targetId,
    loaded() { return new Promise((resolve) => { const fn = (m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { listeners.delete(fn); resolve(); } }; listeners.add(fn); }); },
    async goto(url) { const l = page.loaded(); await send('Page.navigate', { url }, sessionId); await l; },
    async run(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text);
      return r.result.value;
    },
    // Runs `expression` (which makes the page leave) and waits for the next page to load.
    async runAndLeave(expression) { const l = page.loaded(); await send('Runtime.evaluate', { expression }, sessionId).catch(() => {}); await l; },
    async waitFor(expression, what) {
      for (let i = 0; i < 100; i++) { if (await page.run(expression).catch(() => false)) return; await new Promise((r) => setTimeout(r, 50)); }
      throw new Error(`timed out waiting for ${what || expression}`);
    },
    close() { return send('Target.closeTarget', { targetId }).catch(() => {}); },
  };
  return page;
}
test.before(async () => { if (HAVE_BROWSER) await startBrowser(); });
test.after(async () => {
  try { if (ws) ws.close(); } catch (e) { /* closing */ }
  if (chrome) { chrome.removeAllListeners('exit'); chrome.kill(); }
  if (srv) srv.close();
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold it for a moment */ } }
});

// In the page: fill the open line, exactly as typing does (an input event per box).
const FILL = `function fill(f, v){ var e = document.querySelector('#mnApp .mn-open [data-f="' + f + '"]'); e.focus(); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }`;
const TOUR = { name: 'QA Sunset Charter', price: '$450 CAD per group', duration: '2 hours' };
const fillTour = `${FILL} fill('name', ${JSON.stringify(TOUR.name)}); fill('price', ${JSON.stringify(TOUR.price)}); fill('duration', ${JSON.stringify(TOUR.duration)});`;
const DONE = `document.querySelector('#mnApp .mn-open [data-act="close"]').click();`;
const BACK = `document.querySelector('#mnApp .mn-back a').click();`;
const RELOAD = 'location.reload();';
// What the reopened editor shows: each section with its lines, read from the screen.
const READ = `JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#mnApp .mn-sec'), function(sec){ return { section: sec.querySelector('[data-sec-name]').value, tours: Array.prototype.map.call(sec.querySelectorAll('button.mn-item'), function(b){ return { name: b.querySelector('.mn-name').textContent, price: b.querySelector('.mn-price').textContent, rest: (b.querySelector('.mn-desc') || {}).textContent || '' }; }) }; }))`;

const SIZES = [['desktop', 1280, 900, false], ['phone', 375, 812, true]];
const LEAVES = [['Back to my listing', BACK], ['an immediate reload', RELOAD]];

for (const [sizeName, w, h, mobile] of SIZES) for (const [leaveName, leave] of LEAVES) {
  test(`Done then ${leaveName}, no pause (${sizeName}): the tour typed in the default section comes back exactly, and one submit sends one tour to review`, { skip: !HAVE_BROWSER && 'Chrome is not installed here' }, async () => {
    const v = mk(), t = tokenFor(v.id), page = await openPage(w, h, mobile);
    try {
      await page.goto(`${base}/owner/${t}/menu`);
      await page.run(`document.querySelector('#mnApp [data-act="type"]').click(); 1`);
      await page.waitFor(`!!document.querySelector('#mnApp .mn-open [data-f="name"]')`, 'the first line to open');
      // Type the tour, tap Done and leave in the same breath.
      await page.runAndLeave(`${fillTour} ${DONE} ${leave}`);
      if (leave === BACK) assert.match(await page.run('location.pathname'), new RegExp(`^/owner/${t}$`), 'Back to my listing went to the listing');
      await page.goto(`${base}/owner/${t}/menu`);
      await page.waitFor(`!!document.querySelector('#mnApp .mn-sec')`, 'the saved list');
      const shown = JSON.parse(await page.run(READ));
      assert.deepEqual(shown, [{ section: 'Tours', tours: [{ name: TOUR.name, price: TOUR.price, rest: TOUR.duration }] }]);
      assert.match(await page.run(`document.getElementById('mnDraft').textContent`), /Saved draft/);
      assert.equal(await page.run('document.documentElement.scrollWidth <= window.innerWidth'), true, 'nothing runs off the side');
      // Stored exactly, in its section.
      const stored = menusOf(v.id);
      assert.equal(stored.length, 1);
      assert.deepEqual(stored[0].data.sections.map((s) => [s.name, s.items.map((i) => [i.name, i.price, i.duration])]), [['Tours', [[TOUR.name, TOUR.price, TOUR.duration]]]]);
      // Submit once: exactly one tour reaches review.
      await page.run(`document.querySelector('#mnApp [data-act="publish"]').click(); 1`);
      await page.waitFor(`!!document.querySelector('#mnApp .mn-done')`, 'the sent screen');
      const after = menusOf(v.id);
      assert.deepEqual(after.map((m) => m.status), ['pending']);
      assert.equal(after[0].data.sections.reduce((k, s) => k + s.items.length, 0), 1);
      assert.equal(after[0].data.sections[0].items[0].name, TOUR.name);
    } finally { await page.close(); }
  });
}

for (const [sizeName, w, h, mobile] of SIZES) {
  test(`a section the owner added (${sizeName}): its name and its tour survive Done then Back to my listing with no pause, beside the first section`, { skip: !HAVE_BROWSER && 'Chrome is not installed here' }, async () => {
    const v = mk(), t = tokenFor(v.id), page = await openPage(w, h, mobile);
    try {
      await page.goto(`${base}/owner/${t}/menu`);
      await page.run(`document.querySelector('#mnApp [data-act="type"]').click(); 1`);
      await page.waitFor(`!!document.querySelector('#mnApp .mn-open [data-f="name"]')`, 'the first line to open');
      await page.run(`${FILL} fill('name', 'Morning paddle'); fill('price', '$95'); fill('duration', '90 minutes'); ${DONE} 1`);
      // A new section, named, with its tour; Done and leave at once.
      await page.runAndLeave(`document.querySelector('#mnApp [data-act="add-sec"]').click();
        var sn = document.querySelector('#mnApp [data-sec-name="1"]'); sn.value = 'Private charters'; sn.dispatchEvent(new Event('input', { bubbles: true }));
        ${fillTour} ${DONE} ${BACK}`);
      await page.goto(`${base}/owner/${t}/menu`);
      await page.waitFor(`document.querySelectorAll('#mnApp .mn-sec').length === 2`, 'both sections');
      assert.deepEqual(JSON.parse(await page.run(READ)), [
        { section: 'Tours', tours: [{ name: 'Morning paddle', price: '$95', rest: '90 minutes' }] },
        { section: 'Private charters', tours: [{ name: TOUR.name, price: TOUR.price, rest: TOUR.duration }] }]);
      // And with a reload straight after a change in the added section.
      await page.run(`document.querySelectorAll('#mnApp button.mn-item')[1].click(); 1`);
      await page.runAndLeave(`${FILL} fill('duration', '3 hours'); ${DONE} ${RELOAD}`);
      await page.waitFor(`document.querySelectorAll('#mnApp .mn-sec').length === 2`, 'both sections after the reload');
      assert.equal(JSON.parse(await page.run(READ))[1].tours[0].rest, '3 hours');
    } finally { await page.close(); }
  });
}

test('a typed list left before anything was saved opens at its first line again (never an empty "Here are your tours")', { skip: !HAVE_BROWSER && 'Chrome is not installed here' }, async () => {
  const v = mk(), t = tokenFor(v.id), page = await openPage(375, 812, true);
  try {
    await page.goto(`${base}/owner/${t}/menu`);
    await page.run(`document.querySelector('#mnApp [data-act="type"]').click(); 1`);
    await page.waitFor(`!!document.querySelector('#mnApp .mn-open [data-f="name"]')`, 'the first line to open');
    await page.goto(`${base}/owner/${t}/menu`);
    await page.waitFor(`!!document.querySelector('#mnApp .mn-open [data-f="name"]')`, 'the first line to open again');
    assert.equal(await page.run(`document.querySelector('#mnApp [data-sec-name="0"]').value`), 'Tours');
    assert.equal(await page.run(`!!document.querySelector('#mnApp [data-act="publish"]') && document.querySelectorAll('#mnApp button.mn-item').length`), 0);
  } finally { await page.close(); }
});

test('a save that fails keeps what was typed, says so and offers Try again; leaving waits for the retry to work', { skip: !HAVE_BROWSER && 'Chrome is not installed here' }, async () => {
  const v = mk(), t = tokenFor(v.id), page = await openPage(375, 812, true);
  try {
    await page.goto(`${base}/owner/${t}/menu`);
    await page.run(`document.querySelector('#mnApp [data-act="type"]').click(); 1`);
    await page.waitFor(`!!document.querySelector('#mnApp .mn-open [data-f="name"]')`, 'the first line to open');
    // The connection drops: every save fails.
    await page.run(`window.realFetch = window.fetch; window.fetch = function(u){ return /\\/save$/.test(String(u)) ? Promise.reject(new Error('offline')) : window.realFetch.apply(this, arguments); }; 1`);
    await page.run(`${fillTour} ${DONE} 1`);
    await page.waitFor(`!!document.querySelector('#mnSaved [data-act="retry-save"]')`, 'the Try again button');
    assert.match(await page.run(`document.getElementById('mnSaved').textContent`), /didn’t save\. What you typed is still here\./);
    assert.deepEqual(JSON.parse(await page.run(READ)), [{ section: 'Tours', tours: [{ name: TOUR.name, price: TOUR.price, rest: TOUR.duration }] }], 'the values are still on the screen');
    // Back to my listing does not leave while the save is failing.
    await page.run(`${BACK} 1`);
    await new Promise((r) => setTimeout(r, 300));
    assert.match(await page.run('location.pathname'), /\/menu$/, 'still on the editor');
    assert.equal(menusOf(v.id)[0].data.sections.length, 0, 'nothing reached the server yet');
    // The connection is back: Try again saves it.
    await page.run(`window.fetch = window.realFetch; document.querySelector('#mnSaved [data-act="retry-save"]').click(); 1`);
    await page.waitFor(`/Saved/.test(document.getElementById('mnSaved').textContent) && !document.querySelector('#mnSaved [data-act="retry-save"]')`, 'Saved');
    assert.deepEqual(menusOf(v.id)[0].data.sections[0].items.map((i) => [i.name, i.price, i.duration]), [[TOUR.name, TOUR.price, TOUR.duration]]);
    await page.runAndLeave(BACK);
    assert.match(await page.run('location.pathname'), new RegExp(`^/owner/${t}$`));
  } finally { await page.close(); }
});

// ---- the server, without a browser ----
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const list = (name) => ({ sections: [{ name: 'Tours', note: '', items: [{ name, description: '', price: '$450', duration: '2 hours', dietary: [], check: false }] }] });

test('the server ignores a save older than the last one it stored (an early or empty save never lands on newer work)', async () => {
  const v = mk(), t = tokenFor(v.id);
  assert.equal((await postJson(`/owner/${t}/menu/manual`, {})).status, 200);
  const newer = await postJson(`/owner/${t}/menu/save`, { data: list('Newer charter'), rev: 2000 });
  assert.equal(newer.body.ok, true); assert.equal(newer.body.saved, true);
  // The older save arrives late, and an empty one with it.
  const older = await postJson(`/owner/${t}/menu/save`, { data: list('Older charter'), rev: 1999 });
  assert.equal(older.status, 200); assert.equal(older.body.stale, true); assert.equal(older.body.saved, false);
  const empty = await postJson(`/owner/${t}/menu/save`, { data: { sections: [] }, rev: 1500 });
  assert.equal(empty.body.stale, true);
  assert.equal(menusOf(v.id)[0].data.sections[0].items[0].name, 'Newer charter');
  // A later one is stored; a save with no number (an older page still open) is stored as before.
  assert.equal((await postJson(`/owner/${t}/menu/save`, { data: list('Newest charter'), rev: 2001 })).body.saved, true);
  assert.equal(menusOf(v.id)[0].data.sections[0].items[0].name, 'Newest charter');
  assert.equal((await postJson(`/owner/${t}/menu/save`, { data: list('Unnumbered charter') })).body.saved, true);
  assert.equal(menusOf(v.id)[0].data.sections[0].items[0].name, 'Unnumbered charter');
  // "Type it in myself" again never empties a list that is there.
  assert.equal((await postJson(`/owner/${t}/menu/manual`, {})).status, 200);
  assert.equal(menusOf(v.id)[0].data.sections[0].items[0].name, 'Unnumbered charter');
});

test('the editor’s script: Done saves at once, saves are keepalive and numbered, leaving sends what is unsaved', async () => {
  const v = mk(), t = tokenFor(v.id), html = await (await fetch(`${base}/owner/${t}/menu`)).text();
  assert.match(html, /if \(ci\) ci\.check = false; openItem = null; pruneBlank\(\); save\(true\); return rerender\(\); \}/);
  assert.match(html, /keepalive: body\.length < 60000/);
  assert.match(html, /var mine = \+\+saveRev, body = JSON\.stringify\(\{ data: data, rev: mine \}\);/);
  assert.match(html, /window\.addEventListener\('pagehide', function\(\)\{ if \(unsaved && !saveFailed\) postSave\(\); \}\);/);
  assert.match(html, /data-act="retry-save"/);
  const fr = await (await fetch(`${base}/fr/owner/${t}/menu`)).text();
  assert.match(fr, /R&eacute;essayer/);
});
