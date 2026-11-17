'use strict';
// Email results (2026-11-06): what Brevo knows about mail sent through it (site emails, and Gmail mail sent as info@,
// which relays through Brevo), plus the visits our own tagged email links brought. Read-only totals. Nobody can see inbox
// or spam placement, deletions or ignored mail, so none of that is here. Open counts are a rough guide: mail apps load or
// block the tracking image on their own. Cached 30 minutes. Without BREVO_API_KEY it says so.
const { dayOf } = require('./trip-demand');

const TTL_MS = 30 * 60 * 1000;
const BASE = 'https://api.brevo.com/v3';
const n = (v) => Number(v) || 0;
const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

// The numbers from one Brevo report, with rates. Bounces, blocks and complaints are shares of mail sent.
function shape(r) {
  const sent = n(r.requests); const delivered = n(r.delivered);
  const hard = n(r.hardBounces); const soft = n(r.softBounces); const blocked = n(r.blocked);
  const complaints = n(r.spamReports); const openers = n(r.uniqueOpens); const clickers = n(r.uniqueClicks);
  return {
    sent, delivered, hard_bounces: hard, soft_bounces: soft, blocked, invalid: n(r.invalid), complaints, openers, clickers, unsubscribed: n(r.unsubscribed),
    delivered_rate: pctOf(delivered, sent), bounce_rate: pctOf(hard + soft, sent), complaint_rate: pctOf(complaints, sent), open_rate: pctOf(openers, delivered), click_rate: pctOf(clickers, delivered),
  };
}

// Plain warnings, using the limits mail providers commonly expect.
function warnings(t) {
  const out = [];
  if (t.sent < 20) return out;
  if (t.bounce_rate > 5) out.push(`Bounces are ${t.bounce_rate}% of mail sent. Above about 5% hurts delivery: clean the address list before the next batch.`);
  if (t.complaint_rate > 0.3) out.push(`Spam complaints are ${t.complaint_rate}% of mail sent. Above 0.3% is a serious warning: slow down and review who is being emailed.`);
  if (t.blocked / t.sent > 0.05) out.push(`${t.blocked} emails were blocked by Brevo, usually because the address unsubscribed or bounced before.`);
  return out;
}

function createEmailStats(db, opts = {}) {
  const key = opts.key || (() => String(process.env.BREVO_API_KEY || '').trim().replace(/^(['"])(.*)\1$/, '$2').trim());
  const doFetch = opts.fetch || ((...a) => fetch(...a));
  const cache = new Map();

  async function get(path, k) {
    const res = await doFetch(`${BASE}${path}`, { headers: { 'api-key': k, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Brevo answered ${res.status}`);
    return res.json();
  }

  function fromEmails(days, now) {
    try {
      const since = dayOf(new Date(now.getTime() - (days - 1) * 86400000));
      return db.prepare("SELECT substr(source, 7) AS campaign, SUM(n) AS visits FROM referral_counts WHERE kind = 'visit' AND source LIKE 'email:%' AND day >= ? GROUP BY source ORDER BY visits DESC LIMIT 30").all(since).map((r) => ({ campaign: r.campaign, visits: r.visits }));
    } catch (e) { return []; }
  }

  async function report(days = 30, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const campaigns = fromEmails(days, now);
    const k = key();
    if (!k) return { days, connected: false, error: 'Add BREVO_API_KEY to this site to see delivery numbers.', campaigns };
    const hit = cache.get(days);
    if (hit && now.getTime() - hit.at < TTL_MS) return { ...hit.data, campaigns };
    try {
      const [agg, daily] = await Promise.all([
        get(`/smtp/statistics/aggregatedReport?days=${days}`, k),
        get(`/smtp/statistics/reports?days=${Math.min(days, 30)}&limit=30&sort=asc`, k).catch(() => null),
      ]);
      const totals = shape(agg);
      const data = { days, connected: true, totals, warnings: warnings(totals), per_day: daily && Array.isArray(daily.reports) ? daily.reports.map((r) => ({ day: String(r.date).slice(0, 10), n: n(r.requests) })) : [] };
      cache.set(days, { at: now.getTime(), data });
      return { ...data, campaigns };
    } catch (e) {
      return { days, connected: false, error: e && /^Brevo answered/.test(e.message) ? `${e.message}. The numbers could not be read.` : 'Couldn’t reach Brevo right now.', campaigns };
    }
  }
  return { report };
}

module.exports = { shape, warnings, createEmailStats };
