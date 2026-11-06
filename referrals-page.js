'use strict';
// Owner dashboard: how people find us (AI assistants, search engines, social, other sites, and Google's own search words).
const { esc, num, bars, stat, table, STYLE } = require('./dashboard-page');

const NAMES = {
  chatgpt: 'ChatGPT', perplexity: 'Perplexity', gemini: 'Gemini', copilot: 'Copilot', claude: 'Claude', you_com: 'You.com', poe: 'Poe', meta_ai: 'Meta AI',
  grok: 'Grok', deepseek: 'DeepSeek', phind: 'Phind', duck_ai: 'Duck.ai', le_chat: 'Le Chat', kimi: 'Kimi', google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo',
  yahoo: 'Yahoo', ecosia: 'Ecosia', brave: 'Brave', startpage: 'Startpage', yandex: 'Yandex', baidu: 'Baidu', qwant: 'Qwant', kagi: 'Kagi', ask: 'Ask', aol: 'AOL', naver: 'Naver',
  facebook: 'Facebook', instagram: 'Instagram', x_twitter: 'X / Twitter', pinterest: 'Pinterest', reddit: 'Reddit', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn',
  bytedance: 'ByteDance', common_crawl: 'Common Crawl', amazon: 'Amazon', apple: 'Apple', googlebot: 'Googlebot', bingbot: 'Bingbot', duckduckbot: 'DuckDuckBot', yandexbot: 'YandexBot', cohere: 'Cohere', other_sites: 'Other sites (many)',
};
const GROUPS = { ai: 'AI assistants', search: 'Search engines', social: 'Social', email: 'Our emails (campaign)', other: 'Other sites' };
const name = (s) => NAMES[s] || s;
const pageLink = (p) => `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p)}</a>`;

function searchConsoleHtml(sc) {
  if (sc === null || sc === undefined) return `<h4>What people typed into Google</h4><p class="empty">Not connected yet. Google Search Console is the only place that shows the words people typed into Google. To turn it on: in Search Console open Settings → Users and permissions, add the dashboard’s Google account (the same one used for Analytics) as a user, turn on the “Search Console API” in Google Cloud, then set GSC_SITE_URL on this site.</p>`;
  if (sc.error) return `<h4>What people typed into Google</h4><p class="warn">${esc(sc.error)}</p>`;
  return `<h4>What people typed into Google <small>${esc(sc.start)} to ${esc(sc.end)}, from Search Console</small></h4>
    ${table(['Search words', 'Clicks', 'Shown', 'Avg. position'], sc.queries.map((r) => [esc(r.key), r.clicks ? `<b>${num(r.clicks)}</b>` : '0', num(r.impressions), String(r.position)]))}
    <h4>Pages Google sent people to</h4>
    ${table(['Page', 'Clicks', 'Shown', 'Avg. position'], sc.pages.map((r) => [pageLink(r.key.replace(/^https?:\/\/[^/]+/, '') || '/'), r.clicks ? `<b>${num(r.clicks)}</b>` : '0', num(r.impressions), String(r.position)]))}
    <p class="empty">Google hides rare searches to protect privacy, and its numbers run about two days behind.</p>`;
}

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data.referrals; const sc = g.data.search_console;
  const tot = d.totals;
  const bySource = (grp) => d.sources.filter((s) => s.group === grp);
  const landing = (list) => table(['Source', 'Page they landed on', 'Visits'], list.map((r) => [esc(name(r.source)), pageLink(r.page), `<b>${num(r.n)}</b>`]));
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(tot.ai, 'from AI assistants')}${stat(tot.search, 'from search engines')}${stat(tot.social, 'from social')}${stat(tot.email, 'from our emails')}${stat(tot.other, 'from other sites')}</div>
    ${bars(d.ai_per_day, 'Visits from AI assistants per day')}${bars(d.search_per_day, 'Visits from search engines per day')}
    <h4>Where visitors came from</h4>
    ${table(['Type', 'Source', 'Visits'], Object.keys(GROUPS).flatMap((grp) => bySource(grp).map((s) => [esc(GROUPS[grp]), esc(name(s.source)), `<b>${num(s.n)}</b>`])))}
    <h4>Pages AI assistants sent people to</h4>${landing(d.landing_ai)}
    <h4>Pages search engines sent people to</h4>${landing(d.landing_search)}
    <h4>Pages an AI tool read because someone asked it <small>ChatGPT, Perplexity, Claude fetching a page for a person</small></h4>
    ${table(['AI tool', 'Page', 'Times'], d.ai_fetched.map((r) => [esc(name(r.source)), pageLink(r.page), `<b>${num(r.n)}</b>`]))}
    <h4>Crawlers that read the site <small>how often each looked</small></h4>
    ${table(['Crawler', 'Type', 'Page loads'], d.crawlers.map((r) => [esc(name(r.source)), r.ai ? 'AI' : 'Search', num(r.n)]))}
    ${searchConsoleHtml(sc)}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. Totals only; nothing about individual visitors is kept. Search engines and AI assistants do not pass along what someone typed, so the words come only from Google Search Console. Your own visits (internal cookie) are left out.</p></div></section>`;
}

function renderReferralsPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/search?days=${n}">${n}d</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>How people find us – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>How people find us</h1><p class="sub">Visits from AI assistants (ChatGPT, Perplexity, Gemini, Copilot, Claude…) and search engines, the pages they landed on, which pages AI tools read for people, and the words typed into Google.</p>
<div class="bar"><div class="tabs">${range}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></div></header>
<main>${sites.map((g) => siteCard(g, days)).join('')}</main>
</body></html>`;
}

module.exports = { renderReferralsPage, searchConsoleHtml };
