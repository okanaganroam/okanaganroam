'use strict';
// The owner dashboard's shared frame (2026-11-06): side menu, page heading, a plain "what this page tells you" box, the
// site switcher and the styles. Written for someone new to analytics: one site at a time, plain words, short lists.
// Private page (noindex, signed-in only). The small script only switches sites and works without storage.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The menu, in the order someone would ask the questions. `ask` is the plain question each page answers.
const NAV = [
  { group: '', items: [{ key: 'home', label: 'Home', href: '/admin/dashboard', ask: 'How are we doing?' }] },
  { group: 'Visitors', items: [
    { key: 'search', label: 'How people find us', href: '/admin/dashboard/search', ask: 'Where do our visitors come from?' },
    { key: 'searches', label: 'What people search for', href: '/admin/dashboard/searches', ask: 'What are people looking for, and what are we missing?' },
    { key: 'pages', label: 'Guides and pages', href: '/admin/dashboard/pages', ask: 'Which pages are working hardest?' },
  ] },
  { group: 'Features', items: [
    { key: 'roam-now', label: 'Roam Now', href: '/admin/dashboard/roam-now', ask: 'How are people using the map?' },
    { key: 'funnels', label: 'Build My Trip and claims', href: '/admin/dashboard/funnels', ask: 'Where do people give up on planning or claiming?' },
    { key: 'events', label: 'Events', href: '/admin/dashboard/events', ask: 'Which events get noticed, and which don’t?' },
  ] },
  { group: 'Businesses', items: [
    { key: 'business', label: 'Look up a business', href: '/admin/dashboard/business', ask: 'How is one business doing?' },
    { key: 'outbound', label: 'Clicks to businesses', href: '/admin/dashboard/outbound', ask: 'Which businesses are we sending customers to?' },
    { key: 'portal', label: 'Business portal', href: '/admin/dashboard/portal', ask: 'Are owners logging in and using it?' },
  ] },
  { group: 'Upkeep', items: [
    { key: 'email', label: 'Email results', href: '/admin/dashboard/email', ask: 'Is our email getting through?' },
    { key: 'errors', label: 'Broken pages', href: '/admin/dashboard/errors', ask: 'Is anything broken that needs fixing?' },
  ] },
  { group: 'Help', items: [{ key: 'help', label: 'What the words mean', href: '/admin/dashboard/help', ask: 'What does this word mean?' }] },
];

function navHtml(active, clarityId) {
  const groups = NAV.map((g) => `<div class="nav-group">${g.group ? `<p class="nav-h">${esc(g.group)}</p>` : ''}${g.items.map((i) => `<a class="nav-a${i.key === active ? ' on' : ''}" href="${i.href}"${i.key === active ? ' aria-current="page"' : ''}>${esc(i.label)}</a>`).join('')}</div>`).join('');
  const out = [
    '<a class="nav-a" href="/admin/review">Review inbox</a>',
    `<a class="nav-a${active === 'all' ? ' on' : ''}" href="/admin/dashboard?view=all">All the numbers</a>`,
    '<a class="nav-a" href="https://analytics.google.com/" target="_blank" rel="noopener">Google Analytics ↗</a>',
    clarityId ? `<a class="nav-a" href="https://clarity.microsoft.com/projects/view/${esc(clarityId)}/dashboard" target="_blank" rel="noopener">Screen recordings ↗</a>` : '',
  ].join('');
  return `${groups}<div class="nav-group"><p class="nav-h">More</p>${out}</div>`;
}

const STYLE = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Nunito:wght@400;600;700;800&display=swap">
<style>
:root{--bg:#f5f2ea;--card:#fffdf8;--ink:#1b303c;--mute:#5d6b70;--line:#e4dfd2;--accent:#1f6b52;--accent-soft:#e3f0ea;--bar:#2f7d63;--warn:#a8460f;--warn-soft:#fbeadd;--good:#1a7a4c;--good-soft:#e1f3e8;--bad:#b42318;--gold:#d9962b;--side:#1b303c;--side-ink:#dfe7e6;--side-mute:#93a6a8;--hero:#1b303c;--hero-ink:#fffdf8}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#12191d;--card:#1b2429;--ink:#e9eeee;--mute:#a0adb0;--line:#2c383e;--accent:#7fd0ae;--accent-soft:#1f3a31;--bar:#5db38f;--warn:#f2ab7c;--warn-soft:#3f2a1c;--good:#7fd0ae;--good-soft:#1f3a31;--bad:#f59a8f;--gold:#eab35a;--side:#0e1417;--hero:#1f3a44}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 Nunito,system-ui,-apple-system,Segoe UI,sans-serif}
a{color:var(--accent)}h1,h2,.quote{font-family:Fraunces,Georgia,serif;font-weight:600}
.frame{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
.side{background:var(--side);color:var(--side-ink);padding:20px 12px;position:sticky;top:0;height:100vh;overflow-y:auto}
.brand{display:block;font-family:Fraunces,Georgia,serif;font-size:1.15rem;color:#fff;text-decoration:none;padding:2px 12px 14px}
.brand small{display:block;font:600 .74rem Nunito,system-ui,sans-serif;color:var(--side-mute)}
.menu-btn{display:none}
.nav-group{margin-bottom:12px}.nav-h{margin:0 0 3px;padding:0 12px;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--side-mute)}
.nav-a{display:block;padding:7px 12px;border-radius:8px;color:var(--side-ink);text-decoration:none;font-weight:600;font-size:.93rem}
.nav-a:hover{background:rgba(255,255,255,.08)}.nav-a.on{background:#fffdf8;color:#1b303c}
.content{padding:26px 32px 56px;max-width:1120px;width:100%}
.ph h1{margin:0 0 4px;font-size:1.9rem;line-height:1.2}.ph .ask{margin:0 0 14px;color:var(--mute);font-size:1.05rem}
.explain{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:4px 26px;background:var(--accent-soft);border-radius:14px;padding:14px 18px;margin:0 0 16px}
.explain p{margin:0 0 6px;font-size:.95rem}.explain b{display:block;font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:var(--accent)}
.bar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:0 0 16px}.tabs{display:flex;flex-wrap:wrap;gap:6px}
.tab,.seg button{padding:7px 14px;border:1px solid var(--line);border-radius:99px;color:var(--ink);text-decoration:none;background:var(--card);font:700 .88rem Nunito,system-ui,sans-serif;cursor:pointer}
.tab.on,.seg button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.seg{display:flex;flex-wrap:wrap;gap:6px}
main{display:block}.col{min-width:0}.col h2{font-size:1.25rem;margin:0 0 10px}.col h2 small{font:600 .82rem Nunito,system-ui,sans-serif;color:var(--mute);margin-left:6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}.card h3{margin:0 0 10px;font-size:1.08rem}.card h3 small{font-weight:600;color:var(--mute)}
.card h4{margin:22px 0 6px;font-size:1rem;font-weight:800}.card h4:first-child{margin-top:0}.card h4 small{display:block;font-weight:600;font-size:.84rem;color:var(--mute)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}.stat .v{font:600 1.8rem/1.15 Fraunces,Georgia,serif;color:var(--accent)}.stat .l{font-size:.86rem;font-weight:600}.stat .n{font-size:.76rem;color:var(--mute)}
.spark{margin:14px 0 0}.spark svg{width:100%;height:48px;fill:var(--bar)}.spark figcaption{font-size:.8rem;color:var(--mute)}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:7px 10px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mute);font-weight:700;font-size:.8rem}td small{color:var(--mute)}
details.more{margin-top:6px}details.more summary,details.fold summary{cursor:pointer;color:var(--accent);font-weight:700;font-size:.9rem;padding:6px 0}
.empty{color:var(--mute);margin:4px 0;font-size:.9rem}.warn{color:var(--warn)}.foot{color:var(--mute);font-size:.8rem;margin-top:18px}
input[name=q]{font:inherit;color:var(--ink);background:var(--card)}button[type=submit]{font:700 .9rem Nunito,system-ui,sans-serif;padding:9px 16px;border-radius:99px;border:0;background:var(--ink);color:var(--bg);cursor:pointer}
.hero{background:var(--hero);color:var(--hero-ink);border-radius:18px;padding:26px 30px;margin-bottom:18px;position:relative;overflow:hidden}
.hero .hi{margin:0 0 10px;font-weight:700;font-size:.92rem;opacity:.8}.hero .quote{margin:0;font-size:clamp(1.4rem,3vw,2rem);line-height:1.25;max-width:24em}
.hero .impact{margin:14px 0 0;font-size:.98rem;color:#f4cf8c;font-weight:700}
.status{display:flex;align-items:center;gap:8px;font-weight:700;font-size:.92rem;margin:0 0 12px}.dot{width:10px;height:10px;border-radius:50%;background:var(--good);flex:none}.status.bad{color:var(--warn)}.status.bad .dot{background:var(--gold)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px;margin-bottom:14px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;text-decoration:none;color:inherit;display:block}a.tile:hover{border-color:var(--accent)}
.tile .t{font-size:.9rem;font-weight:800;margin:0}.tile .big{font:600 2.3rem/1.15 Fraunces,Georgia,serif;margin:4px 0 2px}.tile .why{font-size:.84rem;color:var(--mute);margin:6px 0 0}
.chip{display:inline-block;font-size:.78rem;font-weight:800;border-radius:99px;padding:2px 9px;background:var(--line);color:var(--mute)}.chip.up{background:var(--good-soft);color:var(--good)}.chip.down{background:var(--warn-soft);color:var(--warn)}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px}.two .card{margin-bottom:14px}
.list{list-style:none;margin:0;padding:0}.list li{padding:8px 0;border-bottom:1px solid var(--line);font-size:.93rem}.list li:last-child{border:0}
.todo{display:flex;justify-content:space-between;gap:10px;text-decoration:none;color:inherit;font-weight:700}.todo b{color:var(--warn)}
.sec{font-size:1.25rem;margin:26px 0 10px}.sec small{font:600 .85rem Nunito,system-ui,sans-serif;color:var(--mute);margin-left:6px}
.goal{padding:12px 0;border-bottom:1px solid var(--line)}.goal:last-child{border:0}.goal-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}.goal-t{font-weight:800;font-size:.95rem}.goal-n{font-size:.9rem;color:var(--mute)}.goal-n b{color:var(--ink);font-size:1rem}
.track{position:relative;height:10px;border-radius:99px;background:var(--line);margin:7px 0 5px}.fill{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:var(--good)}.fill.behind{background:var(--gold)}.mark{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink)}
.go{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}.go a{display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;text-decoration:none;color:inherit}.go a:hover{border-color:var(--accent)}.go b{display:block;font-size:.95rem}.go span{font-size:.84rem;color:var(--mute)}
.glossary dt{font-weight:800;margin-top:12px}.glossary dd{margin:0;color:var(--mute);font-size:.95rem}
@media (max-width:860px){.frame{display:block}.side{position:static;height:auto;padding:10px 12px}.brand{padding:4px 4px 8px}.menu-btn{display:block;width:100%;padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:700 .92rem Nunito,system-ui,sans-serif;text-align:left;cursor:pointer}.navs{display:none;margin-top:10px}.navs.open{display:block}.content{padding:16px 16px 44px}.ph h1{font-size:1.55rem}.hero{padding:20px}}
</style>`;

const SCRIPT = `<script>(function(){
  var cols=[].slice.call(document.querySelectorAll('main>section.col'));
  var btn=document.querySelector('.menu-btn'),nav=document.querySelector('.navs');
  if(btn&&nav)btn.addEventListener('click',function(){var o=nav.classList.toggle('open');btn.setAttribute('aria-expanded',o?'true':'false');});
  var hi=document.getElementById('hi'),hr=new Date().getHours();if(hi)hi.textContent=(hr<12?'Good morning':hr<18?'Good afternoon':'Good evening')+', Dayton';
  var host=document.getElementById('siteSwitch');
  if(!host||cols.length<2)return;
  function name(c){var h=c.querySelector('h2');return h?h.firstChild.textContent.trim():'Site';}
  var saved=null;try{saved=localStorage.getItem('dashSite');}catch(e){}
  function show(n){cols.forEach(function(c){c.hidden=name(c)!==n;});[].forEach.call(host.children,function(b){b.setAttribute('aria-pressed',b.textContent===n?'true':'false');});try{localStorage.setItem('dashSite',n);}catch(e){}}
  cols.forEach(function(c){var b=document.createElement('button');b.type='button';b.textContent=name(c);b.addEventListener('click',function(){show(b.textContent);});host.appendChild(b);});
  var names=cols.map(name);show(names.indexOf(saved)>-1?saved:names[0]);
})();</script>`;

// A full page. `tells` = what the page tells you; `use` = what to do with it. `range` = the time buttons, if any.
function layout({ active, title, ask = '', tells = '', use = '', range = '', top = '', body = '', clarityId = process.env.CLARITY_PROJECT_ID || '', foot = '' }) {
  const nice = String(range).replace(/>(\d+)d</g, '>Last $1 days<');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body><div class="frame">
<aside class="side"><a class="brand" href="/admin/dashboard">Roam Dashboard<small>Okanagan Roam and Whistler Roam</small></a>
<button class="menu-btn" type="button" aria-expanded="false">☰ Menu</button><nav class="navs" aria-label="Dashboard pages">${navHtml(active, clarityId)}</nav></aside>
<div class="content">${top}
<header class="ph"><h1>${esc(title)}</h1>${ask ? `<p class="ask">${esc(ask)}</p>` : ''}</header>
${tells || use ? `<div class="explain">${tells ? `<p><b>What this tells you</b>${esc(tells)}</p>` : ''}${use ? `<p><b>What to do with it</b>${esc(use)}</p>` : ''}</div>` : ''}
<div class="bar"><div class="seg" id="siteSwitch" aria-label="Choose a site"></div>${nice ? `<div class="tabs">${nice}</div>` : ''}</div>
<main>${body}</main>${foot ? `<p class="foot">${foot}</p>` : ''}
</div></div>${SCRIPT}</body></html>`;
}

const askFor = (key) => { for (const g of NAV) for (const i of g.items) if (i.key === key) return i.ask; return ''; };

module.exports = { layout, askFor, esc, NAV, STYLE };
