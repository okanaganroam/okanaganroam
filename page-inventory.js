'use strict';
// Page inventory (2026-11-05): reads a page's HTML and lists every clickable thing on it, grouped by the same click
// items the page script counts (click-labels.js). The dashboard uses it so a business's sheet shows what THAT page
// has (a Buy tickets button, a Menu button, no gallery...) and not one fixed list. Pure text in, list out; no network.
const { LABELS } = require('./click-labels');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'template', 'textarea']);

// Small HTML tree: tag, attrs, parent, and where the element's inner HTML sits in the source (for its text).
function parse(html) {
  const root = { tag: '#root', attrs: {}, parent: null, kids: [] };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) { n.innerEnd = m.index; cur = n.parent; }
      continue;
    }
    const attrs = {};
    const ar = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a;
    while ((a = ar.exec(m[3]))) attrs[a[1].toLowerCase()] = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
    const node = { tag, attrs, parent: cur, kids: [], innerStart: re.lastIndex, innerEnd: re.lastIndex };
    cur.kids.push(node);
    if (m[3].trim().endsWith('/') || VOID.has(tag)) continue;
    if (RAW.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      if (close === -1) { re.lastIndex = html.length; continue; }
      node.innerEnd = close;
      re.lastIndex = close + tag.length + 3;
      const gt = html.indexOf('>', re.lastIndex - 1);
      re.lastIndex = gt === -1 ? html.length : gt + 1;
      continue;
    }
    cur = node;
  }
  return root;
}

// ---- A selector matcher for the small CSS subset click-labels.js uses -------------------------------------------
function parseCompound(s) {
  const c = { tag: null, id: null, classes: [], attrs: [], notClasses: [], notTags: [] };
  const re = /^([a-zA-Z][a-zA-Z0-9-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([~^$*|]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]|:not\(([^)]*)\)/y;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1]) c.tag = m[1].toLowerCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4]) c.attrs.push({ name: m[4].toLowerCase(), op: m[5] || null, val: m[6] !== undefined ? m[6] : m[7] !== undefined ? m[7] : m[8] });
    else if (m[9]) { const inner = m[9].trim(); if (inner.startsWith('.')) c.notClasses.push(inner.slice(1)); else c.notTags.push(inner.toLowerCase()); }
  }
  if (re.lastIndex !== s.length) throw new Error(`Unsupported selector part: ${s}`);
  return c;
}
function parseSelector(sel) {
  return sel.split(',').map((part) => part.trim().split(/\s+/).map(parseCompound));
}
function matchCompound(n, c) {
  if (!n || !n.tag || n.tag === '#root') return false;
  if (c.tag && n.tag !== c.tag) return false;
  if (c.id && n.attrs.id !== c.id) return false;
  const cls = (n.attrs.class || '').split(/\s+/);
  for (const k of c.classes) if (!cls.includes(k)) return false;
  for (const k of c.notClasses) if (cls.includes(k)) return false;
  for (const t of c.notTags) if (n.tag === t) return false;
  for (const a of c.attrs) {
    const v = n.attrs[a.name];
    if (v === undefined) return false;
    if (!a.op) continue;
    if (a.op === '=' && v !== a.val) return false;
    if (a.op === '^=' && !v.startsWith(a.val)) return false;
    if (a.op === '$=' && !v.endsWith(a.val)) return false;
    if (a.op === '*=' && !v.includes(a.val)) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(a.val)) return false;
    if (a.op === '|=' && v !== a.val && !v.startsWith(`${a.val}-`)) return false;
  }
  return true;
}
function matches(node, parsed) {
  return parsed.some((chain) => {
    if (!matchCompound(node, chain[chain.length - 1])) return false;
    let n = node.parent;
    for (let i = chain.length - 2; i >= 0; i -= 1) {
      while (n && !matchCompound(n, chain[i])) n = n.parent;
      if (!n) return false;
      n = n.parent;
    }
    return true;
  });
}

const RULES = LABELS.map((l) => ({ ...l, parsed: parseSelector(l.sel) }));
const CLICKABLE = parseSelector('a[href], button, summary, [data-vg-open]');
const textOf = (html, n) => html.slice(n.innerStart, n.innerEnd).replace(/<[^>]*>/g, ' ').replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

// Clickable things on a page of kind 'venue' or 'event', one entry per click item that the page has:
// { key, text, group, on_page, examples: [first few link texts] }.
function inventory(html, kind) {
  const root = parse(String(html || ''));
  const found = new Map();
  (function walk(n) {
    for (const k of n.kids) {
      if (matches(k, CLICKABLE)) {
        const rule = RULES.find((r) => r.pages.includes(kind) && matches(k, r.parsed));
        if (rule) {
          const e = found.get(rule.key) || { key: rule.key, text: rule.text, group: rule.group, on_page: 0, examples: [] };
          e.on_page += 1;
          const t = textOf(html, k);
          if (t && t.length <= 60 && e.examples.length < 3 && !e.examples.includes(t)) e.examples.push(t);
          found.set(rule.key, e);
        }
      }
      walk(k);
    }
  })(root);
  return RULES.filter((r) => found.has(r.key)).map((r) => found.get(r.key));
}

module.exports = { parse, parseSelector, matches, inventory };
