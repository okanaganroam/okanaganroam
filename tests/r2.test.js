require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const r2 = require('../r2');

test('presignUrl matches the AWS documented SigV4 query-string example', () => {
  const u = r2.presignUrl({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', expires: 86400, now: Date.UTC(2013, 4, 24, 0, 0, 0) });
  assert.match(u, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
  assert.match(u, /^https:\/\/examplebucket\.s3\.amazonaws\.com\/test\.txt\?/);
});

test('config needs all four settings and a valid account id and bucket name', () => {
  const good = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'okr-videos' };
  assert.equal(r2.configured(good), true);
  assert.equal(r2.configured({}), false);
  for (const k of Object.keys(good)) assert.equal(r2.configured({ ...good, [k]: '' }), false, k);
  assert.equal(r2.configured({ ...good, R2_ACCOUNT_ID: 'short' }), false);
  assert.equal(r2.configured({ ...good, R2_BUCKET: 'Bad Name' }), false);
});

test('url() builds a path-style R2 URL for a key, never signing a key outside the bucket path', () => {
  const env = { R2_ACCOUNT_ID: 'b'.repeat(32), R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'okr-videos' };
  const u = r2.url('PUT', 'videos/12/abc.mp4', { env, now: Date.UTC(2026, 10, 5) });
  assert.match(u, new RegExp(`^https://${'b'.repeat(32)}\\.r2\\.cloudflarestorage\\.com/okr-videos/videos/12/abc\\.mp4\\?X-Amz-Algorithm=AWS4-HMAC-SHA256`));
  assert.match(u, /X-Amz-Expires=900/);
  assert.throws(() => r2.url('PUT', 'x', { env: {} }), /not configured/);
});
