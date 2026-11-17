'use strict';
// Test network guard (2026-11-13). Tests must never send real email (FormSubmit, Brevo, SMTP) or reach the internet.
// Once installed, every outbound connection to a host that is not this machine is refused at the socket layer
// (net.Socket#connect), which global fetch, http(s), tls and SMTP clients all go through. Loopback
// (localhost, 127.x, ::1) and unix sockets still work, so tests can talk to their own server.
//
// It is switched on by:
//   - server.js, but only when it runs under `node --test` (NODE_TEST_CONTEXT), from a *.test.js file, or with
//     NODE_ENV=test or ROAM_NO_NETWORK=1.
//     None of these is ever set on the live site, so the real site behaves exactly as before.
//   - every test file that does not load server.js: `require('../test-network-guard').install();`
//     (tests/no-network.test.js checks that each test file does one or the other).
// Once on, it also sets ROAM_NO_NETWORK=1 and adds itself to NODE_OPTIONS, so node processes a test spawns
// (child servers, scripts) are guarded too.
//
// A blocked attempt fails like a network error, is printed with a short stack, and makes the process exit with
// code 1, so a test file that tries to reach the network fails instead of passing quietly.

const net = require('net');

const STATE_KEY = Symbol.for('okanaganroam.testNetworkGuard');

function isLocalHost(host) {
  let h = String(host == null ? '' : host).trim().toLowerCase();
  if (!h) return true; // node's default host is localhost
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.startsWith('::ffff:')) h = h.slice(7);
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true;
  if (net.isIPv4(h) && h.startsWith('127.')) return true;
  return false;
}

// Also true when a test file is run directly (`node tests/x.test.js`, no --test flag).
function testingEnv(env = process.env, argv = process.argv) {
  return Boolean(env.NODE_TEST_CONTEXT) || env.NODE_ENV === 'test' || env.ROAM_NO_NETWORK === '1'
    || /\.test\.[cm]?js$/.test(String((argv && argv[1]) || ''));
}

function state() { return globalThis[STATE_KEY]; }

function record(host, how) {
  const s = state();
  const stack = String(new Error().stack || '').split('\n').slice(3, 9).join('\n');
  const entry = { host: String(host), how, stack };
  s.blocked.push(entry);
  if (!s.quiet) console.error(`[test-network-guard] Blocked ${how} to ${host}: tests must not reach the network or send real email.\n${stack}`);
  return entry;
}

// Host of a net.Socket#connect call: (options[, cb]), (port[, host][, cb]) or (path[, cb]); also the internal
// normalized [options, cb] array form.
function connectTarget(args) {
  let a0 = args[0];
  if (Array.isArray(a0)) a0 = a0[0];
  if (a0 && typeof a0 === 'object') return a0.path ? null : (a0.host || 'localhost');
  if (typeof a0 === 'number' || (typeof a0 === 'string' && /^\d+$/.test(a0))) return typeof args[1] === 'string' ? args[1] : 'localhost';
  return null; // a unix socket / pipe path
}

function install({ exitOnLeak = true, quiet = false } = {}) {
  if (state()) return api;
  globalThis[STATE_KEY] = { blocked: [], quiet, exitOnLeak };

  // The socket layer: http, https, tls, undici (fetch), SMTP clients and anything else end up here.
  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const host = connectTarget(args);
    if (host !== null && !isLocalHost(host)) {
      record(host, 'socket connection');
      const err = new Error(`[test-network-guard] connection to ${host} blocked (tests must not reach the network)`);
      err.code = 'ENETUNREACH';
      process.nextTick(() => this.destroy(err));
      return this;
    }
    return origConnect.apply(this, args);
  };

  // fetch needs no wrapper of its own: it runs on the same sockets, and a test that swaps globalThis.fetch for a
  // stub (before or after this runs) keeps its stub.

  // Node processes this one spawns (child servers, scripts) inherit the guard.
  process.env.ROAM_NO_NETWORK = '1';
  const self = `--require ${JSON.stringify(__filename)}`;
  if (!String(process.env.NODE_OPTIONS || '').includes(__filename)) {
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} ${self}`.trim();
  }

  process.on('exit', () => {
    const s = state();
    if (!s.exitOnLeak || !s.blocked.length) return;
    const hosts = [...new Set(s.blocked.map((b) => b.host))].join(', ');
    console.error(`[test-network-guard] ${s.blocked.length} outbound request(s) were attempted (${hosts}). Stub the transport in the test (setVenueSubmissionTransport, setContactTransport, setOwnerEmailTransport, setMenuImportNetwork).`);
    process.exitCode = 1;
  });
  return api;
}

function installIfTesting(env = process.env, argv = process.argv) {
  return testingEnv(env, argv) ? install() : null;
}

// For tests of the guard itself: the attempts so far (and clear them, so they do not fail the run at exit).
function takeBlocked() {
  const s = state();
  if (!s) return [];
  const out = s.blocked.slice();
  s.blocked.length = 0;
  return out;
}

const api = { install, installIfTesting, isInstalled: () => Boolean(state()), takeBlocked, isLocalHost, testingEnv };
module.exports = api;

// Loaded through NODE_OPTIONS=--require in a spawned child: switch on at once.
if (process.env.ROAM_NO_NETWORK === '1' && require.main !== module) install();
