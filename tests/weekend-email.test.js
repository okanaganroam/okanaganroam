// "This weekend" email list (2026-11-16): sign-up box, double opt-in, the Friday-to-Sunday digest from What's On, one-click
// unsubscribe, the admin page and the send (once per weekend per subscriber; refused without a CASL mailing address).
// Runs on a throwaway database (like server.test.js); restore okanagan.db from a copy afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'weekend-email-test-token';
delete process.env.BREVO_API_KEY; delete process.env.NEWSLETTER_MAILING_ADDRESS;
const app = require('../server.js');
const db = require('../db.js');
const wk = app.weekendEmail;
wk.setSendDelay(0);

// The next Thursday after today (Okanagan date), at about 10-11 AM local time, and its weekend.
const TODAY = app.todayLocal();
const wd = new Date(`${TODAY}T12:00:00Z`).getUTCDay();
const THU_DATE = app.addLocalDays(TODAY, ((4 - wd + 7) % 7) || 7);
const [FRI, SAT, SUN] = [1, 2, 3].map((k) => app.addLocalDays(THU_DATE, k));
const NEXT_FRI = app.addLocalDays(FRI, 7);
const at = (d) => new Date(`${d}T18:00:00Z`);
const THU = at(THU_DATE);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (d) => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const meta = { reason: 'weekend email fixture', batch_id: 'test-weekend-email' };
let n = 0;
const mkEvent = (o) => {
  n++;
  const res = app.createEvent({ region: 'kelowna', description: 'A fixture event used only by the weekend email tests.', source_type: 'official_venue', source_name: 'Fixture',
    source_url: `https://example.com/weekend/${n}`, venue_name_text: `Weekend Hall ${n}`, categories: ['arts-culture'], ...o }, meta);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.event;
};
mkEvent({ name: 'Jazz Quartet Evening', occurrences: [{ start_date: FRI, start_time: '19:00', end_time: '21:00' }] });
mkEvent({ name: 'Snowflake Holiday Market', categories: ['holiday-seasonal', 'markets-fairs'], price_kind: 'free', occurrences: [{ start_date: SAT, start_time: '10:00', end_time: '15:00' }, { start_date: SUN, start_time: '10:00', end_time: '15:00' }] });
mkEvent({ name: 'Comedy Improv Showcase', status: 'cancelled', occurrences: [{ start_date: SAT, start_time: '20:00' }] });
mkEvent({ name: 'Pottery Workshop Afternoon', occurrences: [{ start_date: NEXT_FRI, start_time: '19:00' }] });

const sent = [];
const transport = async (m) => { sent.push(m); };

async function withServer(fn) {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { return await fn(base); } finally { await new Promise((r) => srv.close(r)); }
}
let ipN = 1;
const signup = (base, body, extra = {}) => fetch(`${base}/api/weekend-email`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': extra.ip || `10.77.0.${ipN++}`, ...(extra.headers || {}) }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json(), robots: r.headers.get('x-robots-tag') }));
const tokenFrom = (m) => (/\/weekend-email\/confirm\/([a-f0-9]{32})/.exec(m.text) || [])[1];

test('the digest: Friday to Sunday from What’s On, grouped by day, no cancelled or later events, holiday market first', () => {
  const dg = wk.buildDigest(THU);
  assert.equal(dg.weekend, FRI);
  assert.equal(dg.from, FRI); assert.equal(dg.to, SUN);
  const names = dg.days.flatMap((d) => d.events.map((e) => e.name));
  assert.ok(names.includes('Jazz Quartet Evening'));
  assert.ok(names.includes('Snowflake Holiday Market'));
  assert.ok(!names.includes('Comedy Improv Showcase'), 'cancelled events are left out');
  assert.ok(!names.includes('Pottery Workshop Afternoon'), 'only this weekend');
  assert.deepEqual(dg.days.map((d) => d.label), [`Friday, ${md(FRI)}`, `Saturday, ${md(SAT)}`]);
  const market = dg.days[1].events.find((e) => e.name === 'Snowflake Holiday Market');
  assert.equal(market.time, '10 am–3 pm'); assert.equal(market.also, 'Also Sun'); assert.equal(market.free, true);
  assert.match(market.place, /Weekend Hall \d+, Kelowna/);
  assert.match(market.url, /^https:\/\/okanaganroam\.com\/kelowna\/events\/[a-z0-9-]+\?utm_source=newsletter&utm_medium=email&utm_campaign=weekend-\d{4}-\d\d-\d\d$/);
  assert.ok(market.url.endsWith(`utm_campaign=weekend-${FRI}`));
  assert.equal(dg.subject, FRI.slice(0, 7) === SUN.slice(0, 7) ? `This weekend in the Okanagan: ${md(FRI)}–${Number(SUN.slice(8))}` : `This weekend in the Okanagan: ${md(FRI)} – ${md(SUN)}`);
  // Sent on the Saturday, it is still the same weekend (one key, so no second email).
  assert.equal(wk.buildDigest(at(SAT)).weekend, FRI);
  // Max 18 events, priority first.
  const ranked = wk.buildDigest(THU).days.flatMap((d) => d.events);
  assert.ok(ranked.length <= 18);
});

test('sign-up → confirmation email → confirm page (button) → confirmed; noindex everywhere', async () => {
  app.setOwnerEmailTransport(transport); sent.length = 0;
  await withServer(async (base) => {
    const r = await signup(base, { email: '  Visitor.One@Example.com ', source: 'whats-on', website: '' });
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.match(r.body.message, /check your inbox/);
    await wk.settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'visitor.one@example.com');
    assert.equal(sent[0].subject, 'Confirm your Okanagan Roam weekend email');
    const row = db.prepare('SELECT * FROM weekend_email_subscribers WHERE email = ?').get('visitor.one@example.com');
    assert.equal(row.source, 'whats-on'); assert.equal(row.confirmed_at, null);
    const token = tokenFrom(sent[0]);
    assert.equal(token, row.confirm_token);
    // GET shows a button and does not confirm (mail scanners open links).
    const g = await fetch(`${base}/weekend-email/confirm/${token}`);
    assert.equal(g.status, 200);
    assert.equal(g.headers.get('x-robots-tag'), 'noindex, nofollow');
    const gh = await g.text();
    assert.match(gh, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(gh, /<form method="post" action="\/weekend-email\/confirm\//);
    assert.equal(db.prepare('SELECT confirmed_at FROM weekend_email_subscribers WHERE id = ?').get(row.id).confirmed_at, null);
    // Another site can't confirm for someone.
    assert.equal((await fetch(`${base}/weekend-email/confirm/${token}`, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
    const p = await fetch(`${base}/weekend-email/confirm/${token}`, { method: 'POST', headers: { Origin: base } });
    assert.equal(p.status, 200); assert.equal(p.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await p.text(), /You’re on the list/);
    assert.ok(db.prepare('SELECT confirmed_at FROM weekend_email_subscribers WHERE id = ?').get(row.id).confirmed_at);
    // The link is used up.
    assert.equal((await fetch(`${base}/weekend-email/confirm/${token}`)).status, 410);

    // Signing up again with a confirmed address says exactly the same and sends nothing.
    sent.length = 0;
    const again = await signup(base, { email: 'visitor.one@example.com', source: 'home' });
    const fresh = await signup(base, { email: 'someone.new@example.com', source: 'home' });
    assert.deepEqual(again.body, fresh.body); assert.equal(again.status, fresh.status);
    await wk.settle();
    assert.deepEqual(sent.map((m) => m.to), ['someone.new@example.com']);
    // A pending address asking again within 10 minutes gets no second email.
    await signup(base, { email: 'someone.new@example.com', source: 'home' });
    await wk.settle();
    assert.equal(sent.length, 1);
  });
});

test('honeypot, bad email, other sites and the per-IP limit', async () => {
  app.setOwnerEmailTransport(transport); sent.length = 0;
  await withServer(async (base) => {
    const bot = await signup(base, { email: 'bot@example.com', website: 'http://spam.example' });
    assert.equal(bot.status, 200); assert.equal(bot.body.ok, true, 'a bot gets the same answer');
    await wk.settle();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM weekend_email_subscribers WHERE email = ?').get('bot@example.com').n, 0);
    assert.equal(sent.length, 0);
    const bad = await signup(base, { email: 'not-an-email' });
    assert.equal(bad.status, 400); assert.match(bad.body.error, /valid email/);
    const fr = await signup(base, { email: 'nope', lang: 'fr' });
    assert.match(fr.body.error, /adresse courriel valide/);
    assert.equal((await signup(base, { email: 'x@example.com' }, { headers: { Origin: 'https://evil.example' } })).status, 403);
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await signup(base, { email: `limit${i}@example.com` }, { ip: '10.88.0.1' })).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
    // Without JavaScript the form posts and gets a small noindex page.
    const form = await fetch(`${base}/api/weekend-email`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Real-IP': '10.89.0.1' }, body: 'email=form.user%40example.com&source=home&website=' });
    assert.equal(form.status, 200); assert.equal(form.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await form.text(), /<meta name="robots" content="noindex, nofollow">[\s\S]*Check your inbox/);
  });
  await wk.settle();
});

test('sending: refused without NEWSLETTER_MAILING_ADDRESS; then once per weekend per subscriber, with unsubscribe headers', async () => {
  app.setOwnerEmailTransport(transport); sent.length = 0;
  const refused = await wk.sendDigest({ now: THU });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /NEWSLETTER_MAILING_ADDRESS is not set/);
  assert.equal(sent.length, 0);
  // The preview still works without it, and says what is missing.
  const dgNoAddr = wk.buildDigest(THU);
  assert.match(wk.digestText(dgNoAddr, 'https://okanaganroam.com/weekend-email/unsubscribe/x'), /Mailing address missing/);

  process.env.NEWSLETTER_MAILING_ADDRESS = 'PO Box 123, Kelowna BC V1Y 0A0';
  try {
    const confirmed = db.prepare('SELECT COUNT(*) AS n FROM weekend_email_subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL').get().n;
    assert.equal(confirmed, 1);
    const r = await wk.sendDigest({ now: THU });
    assert.deepEqual({ ok: r.ok, sent: r.sent, failed: r.failed }, { ok: true, sent: 1, failed: 0 });
    assert.equal(sent.length, 1, 'pending addresses get nothing');
    const m = sent[0];
    assert.equal(m.to, 'visitor.one@example.com');
    assert.equal(m.subject, wk.buildDigest(THU).subject);
    const sub = db.prepare('SELECT * FROM weekend_email_subscribers WHERE email = ?').get('visitor.one@example.com');
    const unsub = `https://okanaganroam.com/weekend-email/unsubscribe/${sub.unsubscribe_token}`;
    assert.equal(m.headers['List-Unsubscribe'], `<${unsub}>, <mailto:info@okanaganroam.com?subject=unsubscribe>`);
    assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    for (const body of [m.text, m.html]) {
      assert.ok(body.includes(unsub)); assert.match(body, /Reply “unsubscribe”|reply “unsubscribe”/i);
      assert.match(body, /PO Box 123, Kelowna BC V1Y 0A0/); assert.match(body, /info@okanaganroam\.com/); assert.match(body, /Okanagan Roam/);
      assert.match(body, /signed up for the Okanagan Roam weekend email/);
      assert.match(body, /Snowflake Holiday Market/);
    }
    assert.ok(sub.last_sent_at); assert.equal(sub.last_sent_weekend, FRI);
    // Pressing Send again the same weekend (even on the Saturday) sends nothing more.
    const again = await wk.sendDigest({ now: at(SAT) });
    assert.equal(again.sent, 0); assert.equal(again.skipped, 1);
    assert.equal(sent.length, 1);
    // A failed send is retried; a sent one never is.
    db.prepare("UPDATE weekend_email_sends SET status = 'failed' WHERE subscriber_id = ?").run(sub.id);
    assert.equal((await wk.sendDigest({ now: THU })).sent, 1);
    assert.equal(sent.length, 2);
  } finally { delete process.env.NEWSLETTER_MAILING_ADDRESS; }
});

test('unsubscribe: the link and the one-click POST; unsubscribed addresses get nothing and must confirm again', async () => {
  app.setOwnerEmailTransport(transport); sent.length = 0;
  const sub = db.prepare('SELECT * FROM weekend_email_subscribers WHERE email = ?').get('visitor.one@example.com');
  await withServer(async (base) => {
    const one = await fetch(`${base}/weekend-email/unsubscribe/${sub.unsubscribe_token}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    assert.equal(one.status, 200);
    assert.ok(db.prepare('SELECT unsubscribed_at FROM weekend_email_subscribers WHERE id = ?').get(sub.id).unsubscribed_at);
    const g = await fetch(`${base}/weekend-email/unsubscribe/${sub.unsubscribe_token}`);
    assert.equal(g.status, 200); assert.equal(g.headers.get('x-robots-tag'), 'noindex, nofollow');
    const gh = await g.text();
    assert.match(gh, /You’re unsubscribed/); assert.match(gh, /<meta name="robots" content="noindex, nofollow">/);
    const unknown = await fetch(`${base}/weekend-email/unsubscribe/${'0'.repeat(32)}`);
    assert.equal(unknown.status, 410); assert.equal(unknown.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await unknown.text(), /reply “unsubscribe”/);
    // Not sent next weekend.
    process.env.NEWSLETTER_MAILING_ADDRESS = 'PO Box 123, Kelowna BC V1Y 0A0';
    try {
      const r = await wk.sendDigest({ now: at(app.addLocalDays(THU_DATE, 7)) });
      assert.equal(r.sent || 0, 0);
    } finally { delete process.env.NEWSLETTER_MAILING_ADDRESS; }
    assert.equal(sent.length, 0);
    // Coming back means a new confirmation, nothing sent until then.
    await signup(base, { email: 'visitor.one@example.com', source: 'whats-on' });
    await wk.settle();
    assert.equal(sent.length, 1); assert.match(sent[0].subject, /Confirm/);
    const back = db.prepare('SELECT * FROM weekend_email_subscribers WHERE id = ?').get(sub.id);
    assert.equal(back.confirmed_at, null); assert.equal(back.unsubscribed_at, null);
  });
});

test('the box on What’s On and the homepage (EN + FR); new pages stay out of the sitemap', async () => {
  await withServer(async (base) => {
    const wo = await (await fetch(`${base}/whats-on`)).text();
    assert.match(wo, /<section class="wk-signup"[\s\S]*Get this weekend’s events every Thursday[\s\S]*We’ll email you once a week\. Unsubscribe anytime\./);
    assert.match(wo, /name="website"/);
    const frWo = await (await fetch(`${base}/fr/whats-on`)).text();
    assert.match(frWo, /Recevez les événements de la fin de semaine chaque jeudi/);
    assert.match(frWo, /Un courriel par semaine\. Désabonnez-vous en tout temps\./);
    const home = await (await fetch(`${base}/`)).text();
    if (/id="thisWeekend"/.test(home)) assert.match(home, /class="wk-signup"[\s\S]*name="source" value="home"/);
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.doesNotMatch(sitemap, /weekend-email/);
    const llms = await fetch(`${base}/llms.txt`);
    if (llms.status === 200) assert.doesNotMatch(await llms.text(), /weekend-email/);
  });
});

test('admin page: sign-in, counts, preview, test send, confirm step, CASL refusal; dashboard count', async () => {
  app.setOwnerEmailTransport(transport); sent.length = 0;
  await withServer(async (base) => {
    const out = await fetch(`${base}/admin/weekend-email`);
    assert.equal(out.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await out.text(), /Admin key/);
    const login = await fetch(`${base}/admin/review/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': '10.90.0.1' }, body: JSON.stringify({ token: 'weekend-email-test-token' }) });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    assert.match(cookie, /^okr_admin=/);
    const page = await (await fetch(`${base}/admin/weekend-email`, { headers: { Cookie: cookie } })).text();
    assert.match(page, /confirmed · <strong>\d+<\/strong> waiting to confirm/);
    assert.match(page, /This weekend in the Okanagan/);
    assert.match(page, /NEWSLETTER_MAILING_ADDRESS is not set/, 'the send button is replaced by the reason');
    const post = (p, body = '') => fetch(`${base}${p}`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    assert.equal((await fetch(`${base}/admin/weekend-email/test`, { method: 'POST', redirect: 'manual', headers: { Origin: base } })).status, 401);
    const t = await post('/admin/weekend-email/test');
    assert.equal(t.status, 303); assert.match(t.headers.get('location'), /notice=test_sent/);
    assert.equal(sent.length, 1); assert.equal(sent[0].to, 'info@okanaganroam.com'); assert.match(sent[0].subject, /^\[Test\]/);
    const weekend = wk.buildDigest().weekend;
    assert.match((await post('/admin/weekend-email/send', `weekend=${weekend}`)).headers.get('location'), /notice=not_confirmed/);
    assert.match((await post('/admin/weekend-email/send', `weekend=${weekend}&confirm=yes`)).headers.get('location'), /notice=blocked/);
    assert.equal(sent.length, 1, 'nothing sent without the mailing address');
    const dash = await (await fetch(`${base}/admin/dashboard`, { headers: { Cookie: cookie } })).text();
    assert.match(dash, /Weekend email[\s\S]*href="\/admin\/weekend-email"/);
  });
});
