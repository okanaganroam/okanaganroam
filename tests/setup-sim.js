// A small stand-in browser for the easy-setup page (tour test 16, 2026-11-18). It loads the real setup page from the test
// server, runs its real SETUP_CFG and client script in a vm with a tiny DOM, and sends its saves to the same server. Tests
// press the buttons the screen really drew (their data-act / data-chip / data-* handlers, wired by the client's own wire()),
// type into the boxes the screen really has, and then check what the server stored and what the page shows.
// Not a test file itself (no .test.js): required by the tour tests. Plain DOM only: no CSS, no layout.
'use strict';
const vm = require('node:vm');

const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g;
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'wbr']);

function makeDom() {
  const byId = new Map();
  const mk = (tag, attrs = {}) => {
    const el = {
      tagName: String(tag).toUpperCase(), attrs: { ...attrs }, kids: [], parentNode: null, listeners: {}, style: {}, _html: '', _text: '',
      value: attrs.value != null ? attrs.value : '', checked: 'checked' in attrs, disabled: 'disabled' in attrs, hidden: 'hidden' in attrs, files: [], maxLength: attrs.maxlength ? +attrs.maxlength : -1,
      selectionStart: null, selectionEnd: null, onclick: null, options: [], selectedIndex: 0,
      get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); },
      get id() { return this.attrs.id || ''; }, set id(v) { this.attrs.id = v; byId.set(v, this); },
      get className() { return this.attrs.class || ''; }, set className(v) { this.attrs.class = v; },
      get innerHTML() { return this._html; },
      set innerHTML(h) { for (const k of this.all()) if (k.attrs.id && byId.get(k.attrs.id) === k) byId.delete(k.attrs.id); this._html = String(h); this.kids = parse(this._html, this); },
      get textContent() { return this._text || this._html.replace(/<[^>]+>/g, ''); }, set textContent(t) { this._text = String(t); this._html = ''; this.kids = []; },
      get innerText() { return this.textContent; },
      get firstChild() { return this.kids[0] || null; },
      get children() { return this.kids; },
      classList: null,
      getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
      setAttribute(n, v) { this.attrs[n] = String(v); if (n === 'id') byId.set(String(v), this); },
      removeAttribute(n) { delete this.attrs[n]; },
      hasAttribute(n) { return n in this.attrs; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); },
      fire(t, ev = {}) { const e = { type: t, target: ev.target || this, preventDefault() {}, stopPropagation() {}, key: ev.key }; for (let n = this; n; n = n.parentNode) for (const f of (n.listeners[t] || [])) f.call(n, e); },
      appendChild(c) { c.parentNode = this; this.kids.push(c); if (c.attrs.id) byId.set(c.attrs.id, c); return c; },
      insertBefore(c) { return this.appendChild(c); },
      removeChild(c) { this.kids = this.kids.filter((x) => x !== c); return c; },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      all() { const out = []; const walk = (n) => { for (const k of n.kids) { out.push(k); walk(k); } }; walk(this); return out; },
      querySelectorAll(sel) { return this.all().filter((e) => matches(e, sel)); },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      closest(sel) { for (let n = this; n; n = n.parentNode) if (n.attrs && matches(n, sel)) return n; return null; },
      contains(o) { for (let n = o; n; n = n.parentNode) if (n === this) return true; return false; },
      matches(sel) { return matches(this, sel); },
      focus() { doc.activeElement = this; }, blur() {}, select() {}, scrollIntoView() {}, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
      click() { if (this.onclick) this.onclick({ preventDefault() {}, target: this }); this.fire('click'); },
      getBoundingClientRect() { return { top: 0, left: 0, right: 360, bottom: 40, width: 360, height: 40 }; },
      get offsetHeight() { return 40; }, get scrollHeight() { return 40; },
    };
    el.classList = {
      list: () => (el.attrs.class || '').split(/\s+/).filter(Boolean),
      contains: (c) => el.classList.list().includes(c),
      add: (...c) => { el.attrs.class = [...new Set([...el.classList.list(), ...c])].join(' '); },
      remove: (...c) => { el.attrs.class = el.classList.list().filter((x) => !c.includes(x)).join(' '); },
      toggle: (c, on) => { const has = el.classList.contains(c); if (on === undefined ? !has : on) el.classList.add(c); else el.classList.remove(c); return !has; },
    };
    el.defaultValue = el.value;
    if (attrs.id) byId.set(attrs.id, el);
    return el;
  };
  // A forgiving HTML reader: elements with their attributes and nesting, textarea text as its value.
  function parse(html, parent) {
    const top = [], stack = [{ kids: top, tag: '#root' }];
    const re = /<!--[\s\S]*?-->|<\/(\w+)\s*>|<(\w+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g;
    let m, last = 0;
    const textTo = (i) => { const t = html.slice(last, i); const cur = stack[stack.length - 1]; if (cur.el) cur.el._own = (cur.el._own || '') + t; };
    while ((m = re.exec(html))) {
      textTo(m.index); last = re.lastIndex;
      if (m[0].startsWith('<!--')) continue;
      if (m[1]) { const t = m[1].toLowerCase(); for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === t) { const done = stack.splice(i); for (const d of done) d.el._html = html.slice(d.from, d === done[0] ? m.index : d.from); break; } continue; }
      const tag = m[2].toLowerCase(), attrs = {};
      let a; ATTR_RE.lastIndex = 0; const as = m[3] || '';
      while ((a = ATTR_RE.exec(as))) { if (!a[1]) continue; attrs[a[1].toLowerCase()] = unesc(a[2] != null ? a[2] : a[3] != null ? a[3] : ''); }
      const e = mk(tag, attrs), cur = stack[stack.length - 1];
      e.parentNode = cur.el || parent; cur.kids.push(e);
      if (tag === 'textarea') { const end = html.indexOf('</textarea>', last); e.value = e.defaultValue = unesc(html.slice(last, end < 0 ? html.length : end)); e._html = html.slice(last, end); last = end < 0 ? html.length : end + 11; re.lastIndex = last; continue; }
      if (!VOID.has(tag) && !m[0].endsWith('/>')) stack.push({ el: e, kids: e.kids, tag, from: last });
    }
    for (const d of stack.slice(1)) d.el._html = html.slice(d.from);
    return top;
  }
  function matches(e, sel) {
    return String(sel).split(/,(?![^\[]*\])/).some((one) => {
      const s = (/(?:^|\s)([a-z]*(?:[#.][\w-]+|\[[^\]]*\])*)$/i.exec(one.trim()) || [, ''])[1]; // descendant selectors: the last part only
      const m = /^([a-z]*)((?:[#.][\w-]+|\[[^\]]+\])*)$/i.exec(s); if (!m) return false;
      if (m[1] && e.tagName !== m[1].toUpperCase()) return false;
      const parts = m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) || [];
      return parts.every((p) => {
        if (p[0] === '#') return e.attrs.id === p.slice(1);
        if (p[0] === '.') return (e.attrs.class || '').split(/\s+/).includes(p.slice(1));
        const q = /^\[([\w-]+)(?:([\^$*]?=)"?([^"\]]*)"?)?\]$/.exec(p); if (!q) return false;
        const v = e.attrs[q[1]]; if (v == null) return false; if (!q[2]) return true;
        return q[2] === '=' ? v === q[3] : q[2] === '^=' ? v.startsWith(q[3]) : q[2] === '$=' ? v.endsWith(q[3]) : v.includes(q[3]);
      });
    });
  }
  const body = mk('body'), docEl = mk('html');
  const doc = {
    body, documentElement: docEl, activeElement: body, listeners: {}, title: '',
    getElementById: (id) => byId.get(id) || null,
    createElement: (t) => mk(t),
    createTextNode: (t) => ({ textContent: t, attrs: {}, kids: [] }),
    querySelector: (s) => body.querySelector(s), querySelectorAll: (s) => body.querySelectorAll(s),
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, removeEventListener() {},
  };
  return { doc, body, mk, parse };
}

// Opens /owner/<token>/setup (or /fr/...) like a phone would. -> { click, type, screen, text, settle, window }
// fine: true is a computer with a mouse (matchMedia('(pointer:fine)') matches), as on a desktop.
// Sport test 14: `session` (a storage from an earlier openSetup, sim.session) is this tab's sessionStorage again: the same
// tab coming back after an interruption.
// Sport test 15: `local` (sim.local from an earlier openSetup) is this device's localStorage again: a new tab on the same phone.
async function openSetup(base, token, { lang = 'en', hash = '', fine = false, session = null, local = null } = {}) {
  const url = `${lang === 'fr' ? '/fr' : ''}/owner/${token}/setup`;
  const html = await fetch(base + url, { headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then((r) => r.text());
  const cfgM = /<script>window\.SETUP_CFG = ([\s\S]*?);<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  if (!cfgM) throw new Error('no setup script on ' + url);
  const { doc, body, mk } = makeDom();
  // The page's own static parts the script looks for.
  const main = body.appendChild(mk('main'));
  const wrap = main.appendChild(mk('div'));
  wrap.appendChild(mk('button', { id: 'suBack', hidden: '' }));
  const prog = wrap.appendChild(mk('div', { id: 'suProg', hidden: '' })); prog.appendChild(mk('small', { id: 'suProgText' })); prog.appendChild(mk('i', { id: 'suProgBar' }));
  wrap.appendChild(mk('div', { id: 'suScreen' }));
  body.appendChild(mk('a', { id: 'suExit', href: '#' }));
  for (const id of ['suPick', 'suTake', 'suMenuCam', 'suMenuFile', 'suSheetFile', 'suSheetCam', 'suDoorCam', 'suDoorPick']) body.appendChild(mk('input', { id, type: 'file' }));
  let inflight = 0; const errors = [];
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const win = {
    document: doc, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A156W) Mobile', maxTouchPoints: 5, onLine: true },
    location: { pathname: url, search: '', hash: hash ? '#' + hash : '', href: base + url, origin: base },
    history: { state: null, length: 1, pushState(s) { this.state = s; }, replaceState(s) { this.state = s; }, back() {} },
    sessionStorage: session || store(), localStorage: local || store(), innerWidth: 360, innerHeight: 780, scrollY: 0, pageYOffset: 0,
    matchMedia: (q) => ({ matches: !!fine && /pointer:\s*fine|hover:\s*hover/.test(String(q)), addEventListener() {}, addListener() {} }),
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, scrollBy() {}, requestAnimationFrame: (f) => setTimeout(f, 0), getComputedStyle: () => ({}),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, console, JSON, Date, Math, Promise, URL, URLSearchParams, FormData: class { append() {} }, Blob: class {}, Intl,
    alert() {}, confirm: () => true,
    fetch: (u, o) => { inflight++; const full = /^https?:/.test(u) ? u : base + u; const headers = { ...(o && o.headers), Origin: base, 'User-Agent': 'whistlerroam-check/1.0' };
      return fetch(full, { ...o, headers }).finally(() => { inflight--; }); },
  };
  win.window = win; win.self = win;
  const ctx = vm.createContext(win);
  try { vm.runInContext(`window.SETUP_CFG = ${cfgM[1]};`, ctx); vm.runInContext(cfgM[2], ctx, { filename: 'owner-setup-client.js' }); } catch (e) { errors.push(e); throw e; }
  const screenEl = () => doc.getElementById('suScreen');
  const settle = async () => { let quiet = 0; for (let i = 0; i < 400 && quiet < 4; i++) { await new Promise((r) => setTimeout(r, 15)); quiet = inflight ? 0 : quiet + 1; } await new Promise((r) => setTimeout(r, 90)); };
  const find = (sel) => screenEl().querySelector(sel);
  const sim = {
    window: win, doc, cfg: win.SETUP_CFG, settle, session: win.sessionStorage, local: win.localStorage,
    screen: () => screenEl().innerHTML,
    text: () => screenEl().innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    toast: () => (doc.getElementById('suToast') || { textContent: '' }).textContent,
    // Every data-act on the screen right now.
    acts: () => screenEl().querySelectorAll('[data-act]').map((b) => b.getAttribute('data-act')),
    has: (sel) => !!find(sel),
    // Presses a button the screen drew: a data-act value, or any selector. Throws when it isn't there.
    async click(what) {
      const b = /^[\[#.]/.test(what) ? find(what) : find(`[data-act="${what}"]`);
      if (!b) throw new Error(`no ${what} on the screen; it has: ${sim.acts().join(' | ')}`);
      b.click(); await settle(); return sim;
    },
    async type(id, value) { const e = doc.getElementById(id); if (!e) throw new Error(`no #${id} on the screen`); e.value = value; e.fire('input'); e.fire('change'); return sim; },
  };
  await settle();
  return sim;
}

module.exports = { openSetup, makeDom };
