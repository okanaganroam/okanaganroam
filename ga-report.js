'use strict';
// Google Analytics traffic for the owner dashboard (Phase 2, 2026-11-05). Read-only: a Google service account with
// Viewer access (env GA_SERVICE_ACCOUNT_JSON, GA_PROPERTY_ID) calls the Analytics Data API. Nothing personal comes back:
// totals, per-day users, top pages, channels, devices. Results are cached 10 minutes. Errors return a short message and
// never include the key. Without the env vars it returns null and the dashboard shows a "not connected" note.
const crypto = require('crypto');

const TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let token = null;

function creds() {
  const raw = (process.env.GA_SERVICE_ACCOUNT_JSON || '').trim();
  const property = (process.env.GA_PROPERTY_ID || '').trim();
  if (!raw || !/^\d+$/.test(property)) return null;
  try { const k = JSON.parse(raw); return k.client_email && k.private_key ? { email: k.client_email, key: k.private_key, property } : null; } catch (e) { return null; }
}

async function accessToken(c, now = Date.now()) {
  if (token && token.exp > now + 60000) return token.value;
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const unsigned = `${b({ alg: 'RS256', typ: 'JWT' })}.${b({ iss: c.email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), c.key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    signal: AbortSignal.timeout(5000),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token');
  token = { value: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 };
  return token.value;
}

const num = (v) => Number(v) || 0;
const rowsOf = (rep, dims) => (rep.rows || []).map((r) => ({ ...Object.fromEntries(dims.map((d, i) => [d, r.dimensionValues[i].value])), values: r.metricValues.map((m) => m.value) }));

function shape(resp, days) {
  const [totals, perDay, pages, channels, devices] = resp.reports || [];
  const t = ((totals && totals.rows && totals.rows[0] && totals.rows[0].metricValues) || []).map((m) => m.value);
  return {
    days,
    users: num(t[0]), new_users: num(t[1]), sessions: num(t[2]), views: num(t[3]),
    engagement_rate: Math.round(num(t[4]) * 1000) / 10, avg_session_seconds: Math.round(num(t[5])),
    users_per_day: rowsOf(perDay || {}, ['d']).map((r) => ({ day: `${r.d.slice(0, 4)}-${r.d.slice(4, 6)}-${r.d.slice(6, 8)}`, n: num(r.values[0]) })),
    top_pages: rowsOf(pages || {}, ['path']).map((r) => ({ path: r.path, views: num(r.values[0]) })),
    channels: rowsOf(channels || {}, ['name']).map((r) => ({ name: r.name, sessions: num(r.values[0]) })),
    devices: rowsOf(devices || {}, ['name']).map((r) => ({ name: r.name, sessions: num(r.values[0]) })),
  };
}

async function report(days = 30, now = Date.now()) {
  const c = creds();
  if (!c) return null;
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const hit = cache.get(days);
  if (hit && hit.exp > now) return hit.value;
  try {
    const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];
    const body = { requests: [
      { dateRanges, metrics: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration'].map((name) => ({ name })) },
      { dateRanges, dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 100 },
      { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10 },
      { dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 },
      { dateRanges, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 5 },
    ] };
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${c.property}:batchRunReports`, {
      method: 'POST', headers: { authorization: `Bearer ${await accessToken(c, now)}`, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    if (r.status !== 200) return { error: r.status === 403 ? 'Google refused access: check the service account is a Viewer on this property.' : `Google Analytics answered ${r.status}.` };
    const value = shape(await r.json(), days);
    cache.set(days, { value, exp: now + TTL_MS });
    return value;
  } catch (e) {
    return { error: 'Couldn’t reach Google Analytics right now.' };
  }
}

// Sessions whose source contains `match` (for example "chatgpt") over the last `days` days. Cached 10 minutes.
async function sourceSessions(match, days = 28, now = Date.now()) {
  const c = creds();
  if (!c) return null;
  const key = `src|${match}|${days}`;
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.value;
  try {
    const body = { dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }], metrics: [{ name: 'sessions' }],
      dimensionFilter: { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: String(match), caseSensitive: false } } } };
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${c.property}:runReport`, {
      method: 'POST', headers: { authorization: `Bearer ${await accessToken(c, now)}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (r.status !== 200) return { error: `Google Analytics answered ${r.status}.` };
    const j = await r.json();
    const value = { days, sessions: num((j.rows && j.rows[0] && j.rows[0].metricValues[0].value) || 0) };
    cache.set(key, { value, exp: now + TTL_MS });
    return value;
  } catch (e) { return { error: 'Couldn’t reach Google Analytics right now.' }; }
}

module.exports = { report, shape, creds, sourceSessions };
