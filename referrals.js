'use strict';
// How people find us (2026-11-06). Counted on our own server when a page is opened: where the visitor came from
// (an AI assistant, a search engine, social, another site), and which pages AI tools read for people or crawl.
// Daily totals only: a day, a kind, a source name, a page address, a number. No IP, no visitor id, no query words
// (search engines and AI tools do not pass what was typed), no cookies.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');
const { rateLimited } = require('./site-events');

// [host suffix, source name]
const AI_HOSTS = [
  ['chatgpt.com', 'chatgpt'], ['chat.openai.com', 'chatgpt'], ['openai.com', 'chatgpt'], ['perplexity.ai', 'perplexity'],
  ['gemini.google.com', 'gemini'], ['bard.google.com', 'gemini'], ['copilot.microsoft.com', 'copilot'], ['copilot.com', 'copilot'],
  ['claude.ai', 'claude'], ['you.com', 'you_com'], ['poe.com', 'poe'], ['meta.ai', 'meta_ai'], ['grok.com', 'grok'], ['x.ai', 'grok'],
  ['deepseek.com', 'deepseek'], ['phind.com', 'phind'], ['duck.ai', 'duck_ai'], ['chat.mistral.ai', 'le_chat'], ['kimi.com', 'kimi'],
];
const SEARCH_HOSTS = [
  ['google.', 'google'], ['bing.com', 'bing'], ['duckduckgo.com', 'duckduckgo'], ['yahoo.com', 'yahoo'], ['ecosia.org', 'ecosia'],
  ['brave.com', 'brave'], ['startpage.com', 'startpage'], ['yandex.', 'yandex'], ['baidu.com', 'baidu'], ['qwant.com', 'qwant'],
  ['kagi.com', 'kagi'], ['ask.com', 'ask'], ['aol.com', 'aol'], ['naver.com', 'naver'],
];
const SOCIAL_HOSTS = [
  ['facebook.com', 'facebook'], ['fb.com', 'facebook'], ['instagram.com', 'instagram'], ['t.co', 'x_twitter'], ['twitter.com', 'x_twitter'], ['x.com', 'x_twitter'],
  ['pinterest.', 'pinterest'], ['reddit.com', 'reddit'], ['tiktok.com', 'tiktok'], ['youtube.com', 'youtube'], ['linkedin.com', 'linkedin'], ['lnkd.in', 'linkedin'],
];
const OWN_HOSTS = ['okanaganroam.com', 'whistlerroam.com', 'localhost', 'up.railway.app'];

// AI tools that fetch a page because a person asked (kind ai_fetch) and crawlers that read it ahead of time (kind crawl).
const AGENTS = [
  [/ChatGPT-User/i, 'chatgpt', 'ai_fetch'], [/Perplexity-User/i, 'perplexity', 'ai_fetch'], [/Claude-User/i, 'claude', 'ai_fetch'],
  [/MistralAI-User/i, 'le_chat', 'ai_fetch'], [/DuckAssistBot/i, 'duck_ai', 'ai_fetch'], [/meta-externalfetcher/i, 'meta_ai', 'ai_fetch'],
  [/OAI-SearchBot/i, 'chatgpt', 'crawl'], [/GPTBot/i, 'chatgpt', 'crawl'], [/PerplexityBot/i, 'perplexity', 'crawl'],
  [/Claude-SearchBot|ClaudeBot|anthropic-ai/i, 'claude', 'crawl'], [/meta-externalagent|FacebookBot/i, 'meta_ai', 'crawl'],
  [/Bytespider/i, 'bytedance', 'crawl'], [/CCBot/i, 'common_crawl', 'crawl'], [/Amazonbot/i, 'amazon', 'crawl'],
  [/Applebot/i, 'apple', 'crawl'], [/Googlebot/i, 'googlebot', 'crawl'], [/bingbot/i, 'bingbot', 'crawl'],
  [/DuckDuckBot/i, 'duckduckbot', 'crawl'], [/YandexBot/i, 'yandexbot', 'crawl'], [/cohere-ai/i, 'cohere', 'crawl'],
];
const AI_SOURCES = new Set(AI_HOSTS.map((h) => h[1]));

const hostMatches = (host, suffix) => (suffix.endsWith('.') ? (`.${host}.`).includes(`.${suffix}`) : host === suffix || host.endsWith(`.${suffix}`));

// { group: 'ai'|'search'|'social'|'other', source } for a visit that arrived from elsewhere, or null (direct, or from us).
function classifyVisit(referer, utmSource) {
  const utm = String(utmSource || '').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 40);
  if (utm) {
    for (const [h, name] of AI_HOSTS) if (utm === h || utm === h.split('.')[0]) return { group: 'ai', source: name };
  }
  let host = '';
  try { host = new URL(String(referer || '')).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return null; }
  if (!host || OWN_HOSTS.some((o) => hostMatches(host, o))) return null;
  for (const [h, name] of AI_HOSTS) if (hostMatches(host, h)) return { group: 'ai', source: name };
  for (const [h, name] of SEARCH_HOSTS) if (hostMatches(host, h)) return { group: 'search', source: name };
  for (const [h, name] of SOCIAL_HOSTS) if (hostMatches(host, h)) return { group: 'social', source: name };
  if (!/^[a-z0-9][a-z0-9.-]{2,60}$/.test(host)) return null;
  return { group: 'other', source: host };
}
function classifyAgent(ua) {
  const u = String(ua || '');
  for (const [re, source, kind] of AGENTS) if (re.test(u)) return { source, kind };
  return null;
}
const pageOf = (url) => {
  const p = String(url || '').split(/[?#]/)[0];
  return /^\/[A-Za-z0-9._~\/%-]{0,118}$/.test(p) ? p.replace(/(.)\/$/, '$1') : null;
};
const SKIP = /^\/(?:api|admin|owner|claim|images|styles|scripts|healthz|share|fonts|assets)(?:\/|$)|\.(?:js|css|png|jpe?g|webp|gif|svg|ico|json|xml|txt|webmanifest|woff2?|mp4|pdf)$/i;

function createReferralCounter(db) {
  const up = db.prepare('INSERT INTO referral_counts (day, kind, source, page, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(day, kind, source, page) DO UPDATE SET n = n + 1');
  const otherToday = new Map();
  function bump(day, kind, source, page) { up.run(day, kind, source, page); }

  // Called for each page request; counts once the answer is known to be a normal page (200, HTML).
  function watch(req, res, ip, now = () => new Date()) {
    if (req.method !== 'GET') return;
    const u = String(req.url || '');
    const page = pageOf(u);
    if (!page || SKIP.test(page)) return;
    res.on('finish', () => {
      try {
        if (res.statusCode !== 200 || !/content-type:\s*text\/html/i.test(`content-type: ${res.getHeader('Content-Type') || ''}\n${res._header || ''}`) || !demandEnabled()) return;
        const day = dayOf(now());
        const agent = classifyAgent(req.headers['user-agent']);
        if (agent) { if (!rateLimited(ip)) bump(day, agent.kind, agent.source, agent.kind === 'ai_fetch' ? page : ''); return; }
        if (isBot(req) || isInternal(req) || rateLimited(ip)) return;
        let utm = null; try { utm = new URL(u, 'http://x').searchParams.get('utm_source'); } catch (e) { /* ignore */ }
        const v = classifyVisit(req.headers.referer || req.headers.referrer, utm);
        if (!v) return;
        let source = v.source;
        if (v.group === 'other') {
          const key = `${day}|${source}`;
          if (!otherToday.has(key)) { if (otherToday.size > 400) otherToday.clear(); otherToday.set(key, 1); }
          if (otherToday.size > 300) source = 'other_sites';
        }
        bump(day, 'visit', `${v.group}:${source}`, page);
      } catch (e) { /* counting must never break the site */ }
    });
  }

  function report(days = 30, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const list = []; for (let i = days - 1; i >= 0; i -= 1) list.push(dayOf(new Date(now.getTime() - i * 86400000)));
    const rows = db.prepare('SELECT day, kind, source, page, n FROM referral_counts WHERE day >= ?').all(list[0]);
    const sources = new Map(); const landing = { ai: new Map(), search: new Map(), social: new Map(), other: new Map() };
    const fetched = new Map(); const crawls = new Map(); const perDay = { ai: new Map(), search: new Map() };
    const totals = { ai: 0, search: 0, social: 0, other: 0 };
    for (const r of rows) {
      if (r.kind === 'visit') {
        const [group, source] = r.source.split(':');
        totals[group] = (totals[group] || 0) + r.n;
        sources.set(r.source, (sources.get(r.source) || 0) + r.n);
        const l = landing[group] || landing.other; l.set(`${source}|${r.page}`, (l.get(`${source}|${r.page}`) || 0) + r.n);
        if (perDay[group]) perDay[group].set(r.day, (perDay[group].get(r.day) || 0) + r.n);
      } else if (r.kind === 'ai_fetch') fetched.set(`${r.source}|${r.page}`, (fetched.get(`${r.source}|${r.page}`) || 0) + r.n);
      else if (r.kind === 'crawl') crawls.set(r.source, (crawls.get(r.source) || 0) + r.n);
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    const split = ([k, n]) => { const i = k.indexOf('|'); return { source: k.slice(0, i), page: k.slice(i + 1), n }; };
    const first = db.prepare('SELECT MIN(day) AS d FROM referral_counts').get().d;
    return {
      days, since: list[0], counting_since: first || null, totals,
      sources: top(sources, 60).map(([k, n]) => { const [group, source] = k.split(':'); return { group, source, n }; }),
      landing_ai: top(landing.ai, 40).map(split), landing_search: top(landing.search, 40).map(split),
      landing_social: top(landing.social, 20).map(split), landing_other: top(landing.other, 20).map(split),
      ai_fetched: top(fetched, 40).map(split),
      crawlers: top(crawls, 30).map(([source, n]) => ({ source, n, ai: AI_SOURCES.has(source) })),
      ai_per_day: list.map((day) => ({ day, n: perDay.ai.get(day) || 0 })),
      search_per_day: list.map((day) => ({ day, n: perDay.search.get(day) || 0 })),
    };
  }
  return { watch, report, bump };
}

module.exports = { classifyVisit, classifyAgent, pageOf, createReferralCounter };
