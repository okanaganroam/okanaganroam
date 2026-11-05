'use strict';
// Cloudflare R2 (S3-compatible) signing, with no dependencies: short-lived presigned URLs for the browser to upload
// a video straight to the bucket (and for Dayton to watch it), plus signed HEAD and DELETE from the server.
// Configured by four environment variables; when any is missing, `configured()` is false and the video feature stays off:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
const crypto = require('crypto');

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
// RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone).
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p) => p.split('/').map(enc).join('/');

function stamp(now) {
  const iso = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, date: iso.slice(0, 8) };
}

function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), 'aws4_request');
}

// A presigned URL (query-string SigV4, only the host header signed, payload unsigned).
function presignUrl({ method, host, path, accessKeyId, secretAccessKey, region = 'auto', service = 's3', expires = 900, now = Date.now(), query = {} }) {
  const { amzDate, date } = stamp(now);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const params = Object.assign({}, query, {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalQuery = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
  const canonicalRequest = [method, encPath(path), canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(secretAccessKey, date, region, service)).update(toSign).digest('hex');
  return `https://${host}${encPath(path)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function config(env = process.env) {
  const accountId = String(env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(env.R2_BUCKET || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !accessKeyId || !secretAccessKey || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, host: `${accountId}.r2.cloudflarestorage.com` };
}

const configured = (env = process.env) => !!config(env);

function url(method, key, { expires = 900, query = {}, now, env } = {}) {
  const c = config(env);
  if (!c) throw new Error('R2 is not configured');
  return presignUrl({ method, host: c.host, path: `/${c.bucket}/${key}`, accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, expires, query, now });
}

// What the bucket has for a key: { size, type } or null. Used to confirm a browser upload really finished.
async function head(key, env) {
  const res = await fetch(url('HEAD', key, { env, expires: 60 }), { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${res.status}`);
  return { size: Number(res.headers.get('content-length')) || 0, type: res.headers.get('content-type') || '' };
}

async function remove(key, env) {
  const res = await fetch(url('DELETE', key, { env, expires: 60 }), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`);
  return true;
}

module.exports = { presignUrl, config, configured, url, head, remove };
