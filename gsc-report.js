'use strict';
// Google Search Console for the owner dashboard (2026-11-06): the words people typed into Google before they landed on
// the site, with clicks, impressions and average position. Read-only. It uses the same Google service account as the
// Analytics report (env GA_SERVICE_ACCOUNT_JSON), which must be added as a user on the site in Search Console and have the
// Search Console API enabled, plus env GSC_SITE_URL (for example "https://okanaganroam.com/" or "sc-domain:okanaganroam.com").
// Google only reports queries with enough searches to protect privacy, and its data runs about two days behind.
// Cached 30 minutes. Without the settings it returns null and the dashboard shows how to connect it.
const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000;
const cache = new Map();
let token = null;

function creds() {
  const raw = (process.env.GA_SERVICE_ACCOUNT_JSON || '').trim();
  const site = (process.env.GSC_SITE_URL || '').trim();
  if (!raw || !site) return null;
  try { const k = JSON.parse(raw); return k.client_email && k.private_key ? { email: k.client_email, key: k.private_key, site } : null; } catch (e) { return null; }
}

async function accessToken(c, now = Date.now()) {
  if (token && token.exp > now + 60000) return token.value;
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const unsigned = `${b({ alg: 'RS256', typ: 'JWT' })}.${b({ iss: c.email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`;
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

const ymd = (d) => d.toISOString().slice(0, 10);
const shape = (rows) => (rows || []).map((r) => ({ key: String((r.keys && r.keys[0]) || ''), clicks: r.clicks || 0, impressions: r.impressions || 0, position: Math.round((r.position || 0) * 10) / 10 }));

async function report(days = 28, now = new Date()) {
  const c = creds();
  if (!c) return null;
  days = [7, 28, 90].includes(Number(days)) ? Number(days) : 28;
  const key = `${c.site}|${days}|${ymd(now)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const t = await accessToken(c);
    const end = new Date(now.getTime() - 2 * 86400000);
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    const q = async (dimensions, rowLimit) => {
      const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.site)}/searchAnalytics/query`, {
        method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions, rowLimit }), signal: AbortSignal.timeout(8000),
      });
      if (r.status === 403) { const e = new Error('forbidden'); e.code = 403; throw e; }
      if (!r.ok) { const e = new Error('http'); e.code = r.status; throw e; }
      return (await r.json()).rows || [];
    };
    const [queries, pages] = await Promise.all([q(['query'], 100), q(['page'], 25)]);
    const data = { days, start: ymd(start), end: ymd(end), queries: shape(queries), pages: shape(pages) };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    return { error: e.code === 403
      ? 'Google says no access yet. In Search Console, add the dashboard’s Google account as a user on this site, and turn on the Search Console API in Google Cloud.'
      : 'Couldn’t read Search Console right now.' };
  }
}

module.exports = { report, creds };
