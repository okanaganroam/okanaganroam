// Tests never reach the network or send real email (2026-11-13). A run of the suite was posting owner-portal notices
// to the live FormSubmit relay (and getting HTTP 429 back). test-network-guard.js now refuses every outbound
// connection from a test process, and from anything it spawns; this file checks that guard and that every test
// file has it on. Only made-up hosts are used here, and none of them is ever contacted.
'use strict';
require('../test-network-guard').install({ quiet: true }); // no real network or email from tests (quiet: this file's blocked requests are on purpose)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { execFile } = require('node:child_process');
const guard = require('../test-network-guard');

const ROOT = path.join(__dirname, '..');
const GUARD = path.join(ROOT, 'test-network-guard.js');
const run = (args, opts = {}) => new Promise((resolve) => {
  execFile(process.execPath, args, { encoding: 'utf8', timeout: 60000, ...opts }, (err, stdout, stderr) => {
    resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr });
  });
});
const errorOf = (emitter) => new Promise((resolve) => emitter.once('error', resolve));

test('guard: on in this test process', () => {
  assert.equal(guard.isInstalled(), true);
  assert.equal(process.env.ROAM_NO_NETWORK, '1');
  assert.ok(String(process.env.NODE_OPTIONS).includes(GUARD), 'spawned node processes load the guard');
});

test('guard: fetch, https, http and raw SMTP sockets to outside hosts are refused before any DNS lookup', async () => {
  guard.takeBlocked();
  await assert.rejects(fetch('https://mail-relay.example.com/ajax/inbox', { method: 'POST', body: '{}' }), (err) => {
    assert.match(String(err.cause && err.cause.message), /test-network-guard/);
    return true;
  });
  assert.equal((await errorOf(https.get('https://api.mail.example.net/v3/smtp/email'))).code, 'ENETUNREACH');
  assert.equal((await errorOf(http.get('http://203.0.113.9/'))).code, 'ENETUNREACH');
  assert.equal((await errorOf(net.connect(587, 'smtp.example.org'))).code, 'ENETUNREACH');
  const hosts = guard.takeBlocked().map((b) => b.host);
  assert.deepEqual(hosts, ['mail-relay.example.com', 'api.mail.example.net', '203.0.113.9', 'smtp.example.org']);
});

test('guard: loopback still works, so tests can call their own server', async () => {
  const srv = http.createServer((req, res) => res.end('ok'));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const { port } = srv.address();
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'ok');
    assert.equal(await (await fetch(`http://localhost:${port}/`)).text(), 'ok');
  } finally { srv.close(); }
  assert.deepEqual(guard.takeBlocked(), []);
  for (const h of ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1', 'app.localhost', '']) assert.equal(guard.isLocalHost(h), true, h);
  for (const h of ['formsubmit.co', 'api.brevo.com', '10.0.0.5', '192.168.1.2', '8.8.8.8', 'localhost.example.com']) assert.equal(guard.isLocalHost(h), false, h);
});

test('guard: a test file that tries an outbound request fails, even when the code swallows the error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roam-no-network-'));
  try {
    const file = path.join(dir, 'leaky.test.js');
    fs.writeFileSync(file, [
      `require(${JSON.stringify(GUARD)}).install();`,
      "require('node:test')('sends a notice and ignores the failure', async () => {",
      "  await fetch('https://notices.example.com/ajax/inbox', { method: 'POST' }).catch(() => {});",
      '});',
    ].join('\n'));
    const env = { ...process.env };
    delete env.NODE_OPTIONS; delete env.ROAM_NO_NETWORK; delete env.NODE_TEST_CONTEXT;
    const r = await run(['--no-warnings', '--test', '--test-concurrency=1', file], { env });
    assert.notEqual(r.code, 0, 'the run fails');
    assert.match(r.stdout + r.stderr, /Blocked socket connection to notices\.example\.com/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('guard: node processes a test spawns are guarded too', async () => {
  const r = await run(['-e', "fetch('https://notices.example.com/').then(() => console.log('REACHED'), (e) => console.log('REFUSED ' + e.cause.code))"]);
  assert.match(r.stdout, /REFUSED ENETUNREACH/);
  assert.doesNotMatch(r.stdout, /REACHED/);
  assert.notEqual(r.code, 0, 'the child exits non-zero after a blocked request');
});

test('guard: server.js turns it on only under node --test, a *.test.js file, NODE_ENV=test or ROAM_NO_NETWORK=1 (never on the live site)', async () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').slice(0, 600), /require\('\.\/test-network-guard'\)\.installIfTesting\(\);/);
  assert.equal(guard.testingEnv({ NODE_TEST_CONTEXT: 'child-v8' }), true);
  assert.equal(guard.testingEnv({ NODE_ENV: 'test' }), true);
  assert.equal(guard.testingEnv({ ROAM_NO_NETWORK: '1' }), true);
  assert.equal(guard.testingEnv({}, ['node', '/app/tests/owner-portal.test.js']), true);
  assert.equal(guard.testingEnv({ NODE_ENV: 'production', RAILWAY_ENVIRONMENT: 'production', PORT: '8080' }, ['node', '/app/server.js']), false);
  assert.equal(guard.testingEnv({}, ['node', '/app/server.js']), false);
  // A plain `node` process (like `npm start`) that loads the guard the way server.js does keeps its network.
  const env = { ...process.env };
  delete env.NODE_OPTIONS; delete env.ROAM_NO_NETWORK; delete env.NODE_TEST_CONTEXT; delete env.NODE_ENV;
  const r = await run(['-e', `const g = require(${JSON.stringify(GUARD)}); console.log(g.installIfTesting() === null, g.isInstalled())`], { env });
  assert.equal(r.stdout.trim(), 'true false');
});

test('guard: every test file loads server.js (which installs it) or installs it itself', () => {
  const dir = path.join(ROOT, 'tests');
  const missing = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).filter((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    return !/require\(\s*['"]\.\.\/server(\.js)?['"]\s*\)/.test(src) && !/require\(\s*['"]\.\.\/test-network-guard(\.js)?['"]\s*\)\.install\(/.test(src);
  });
  assert.deepEqual(missing, [], "add require('../test-network-guard').install(); at the top of these files");
});
