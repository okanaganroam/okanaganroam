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
    { key: 'stays', label: 'Places to stay', href: '/admin/dashboard/stays', ask: 'Are guests scanning the QR cards at hotels?' },
  ] },
  { group: 'Upkeep', items: [
    { key: 'email', label: 'Email results', href: '/admin/dashboard/email', ask: 'Is our email getting through?' },
    { key: 'errors', label: 'Broken pages', href: '/admin/dashboard/errors', ask: 'Is anything broken that needs fixing?' },
  ] },
  { group: 'Help', items: [{ key: 'help', label: 'Learn analytics', href: '/admin/dashboard/help', ask: 'What does this word mean?' }] },
];

// Simple line icons, one per page.
const ICON = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10', search: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z', searches: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  pages: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7', 'roam-now': 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14', funnels: 'M3 5h18l-7 8v6l-4 2v-8z', events: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  business: 'M4 21V9l8-5 8 5v12M9 21v-6h6v6', stays: 'M3 20V10l9-6 9 6v10M3 20h18M8 20v-5h3v5M14 12h3v3h-3z', outbound: 'M7 17L17 7M9 7h8v8', portal: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', email: 'M3 6h18v12H3zM3 7l9 7 9-7', errors: 'M12 3l10 18H2zM12 10v5M12 18v.5', help: 'M4 5h7a2 2 0 012 2v13a3 3 0 00-3-2H4zM20 5h-5a2 2 0 00-2 2v13a3 3 0 013-2h4z',
};
const icon = (k) => (ICON[k] ? `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[k]}"/></svg>` : '');
const groupOf = (active) => { const g = NAV.find((x) => x.items.some((i) => i.key === active)); return g && g.group ? g.group.toLowerCase() : 'home'; };

function navHtml(active, clarityId) {
  const groups = NAV.map((g) => `<div class="nav-group">${g.group ? `<p class="nav-h">${esc(g.group)}</p>` : ''}${g.items.map((i) => `<a class="nav-a${i.key === active ? ' on' : ''}" href="${i.href}"${i.key === active ? ' aria-current="page"' : ''}>${icon(i.key)}${esc(i.label)}</a>`).join('')}</div>`).join('');
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
:root{--g1:#0f7a6b;--g2:#1fb58f;--c1:#0fa38a;--c2:#e8912d;--c3:#e4506b;--c4:#6b5be6}
.t-visitors{--g1:#1d5fd1;--g2:#17a9c9}.t-features{--g1:#6b3fe0;--g2:#c44fd8}.t-businesses{--g1:#d9682a;--g2:#f0a92e}.t-upkeep{--g1:#c23a6a;--g2:#ee6f57}.t-help{--g1:#0f7a6b;--g2:#7ac74f}
.ico{width:18px;height:18px;flex:none}.nav-a{display:flex;align-items:center;gap:10px}
.side{background:linear-gradient(180deg,#14262f,#1b3a44 60%,#17333a)}.nav-a.on{box-shadow:0 6px 18px rgba(0,0,0,.25)}
.ph{background:linear-gradient(120deg,var(--g1),var(--g2));color:#fff;border-radius:18px;padding:22px 26px;margin-bottom:14px;box-shadow:0 12px 30px -14px var(--g1)}.ph .ask{color:rgba(255,255,255,.88);margin:0}
.explain{background:none;padding:0;gap:12px}.explain p{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0}.explain b{color:var(--g1);margin-bottom:2px}
.card{box-shadow:0 6px 20px -14px rgba(27,48,60,.35)}.card h4{padding-left:10px;border-left:3px solid var(--g2)}
.stat{background:linear-gradient(135deg,rgba(127,127,127,.07),transparent);border-radius:12px;padding:10px 12px}.stat .v{color:var(--g1)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .stat .v,:root:not([data-theme=light]) .explain b{color:var(--g2)}}
.spark svg{fill:var(--g2)}.tab.on,.seg button[aria-pressed=true]{background:linear-gradient(120deg,var(--g1),var(--g2));color:#fff;border-color:transparent;box-shadow:0 6px 14px -8px var(--g1)}
.hero{background:linear-gradient(120deg,#0e2a3a,#135a63 42%,#2a7d6c 70%,#d98a33 118%);background-size:180% 180%;animation:drift 18s ease-in-out infinite alternate;padding:30px 34px 74px;box-shadow:0 18px 40px -20px #0e2a3a}
.hero .peaks{position:absolute;left:0;right:0;bottom:-1px;width:100%;height:96px;pointer-events:none}
.hero .hi,.hero .quote,.hero .impact{position:relative;z-index:1}.hero .quote{font-size:clamp(1.55rem,3.4vw,2.35rem);max-width:22em}
@keyframes drift{from{background-position:0 40%}to{background-position:100% 60%}}
.home .ph{background:none;box-shadow:none;color:inherit;padding:0;margin:0 0 10px}.home .ph .ask{color:var(--mute)}
.tile{position:relative;overflow:hidden;border:0;color:#fff;box-shadow:0 14px 26px -16px rgba(0,0,0,.5);transition:transform .18s ease,box-shadow .18s ease}a.tile:hover{transform:translateY(-3px);box-shadow:0 18px 30px -14px rgba(0,0,0,.55)}
.tile:nth-child(1){background:linear-gradient(135deg,#0d8f7c,#21c29a)}.tile:nth-child(2){background:linear-gradient(135deg,#d9682a,#f3ac36)}.tile:nth-child(3){background:linear-gradient(135deg,#c93a6b,#ef6f5c)}.tile:nth-child(4){background:linear-gradient(135deg,#5a45dc,#2d9be0)}
.tile .big{font-size:2.7rem}.tile .why{color:rgba(255,255,255,.9)}.tile .chip,.tile .chip.up,.tile .chip.down{background:rgba(255,255,255,.22);color:#fff}
.mission{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(120deg,#1b303c,#2a4a58);color:#fff;border-radius:16px;padding:16px 20px;margin-bottom:14px}.mission p{margin:0}.mission .m-t{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#f4cf8c}.mission .m-d{font:600 1.1rem Fraunces,Georgia,serif}.mission a{background:#f4b64a;color:#1b303c;font-weight:800;text-decoration:none;padding:9px 16px;border-radius:99px;white-space:nowrap}
.learn{border:2px solid var(--c1);margin-top:18px}.learn-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.learn-head h2{margin:0;font-size:1.3rem}.learn-p{font-size:.85rem;font-weight:700;color:var(--mute);min-width:170px}
.lesson-n{margin:0;font-size:.74rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--c1)}.lesson h3{font:600 1.25rem Fraunces,Georgia,serif;margin:2px 0 6px}.lesson p{margin:0 0 8px}.lesson-mine{font-weight:800;color:var(--c2)}
.quiz{background:rgba(15,163,138,.09);border-radius:12px;padding:14px;margin-top:10px}.quiz-q{font-weight:800}.quiz-a{display:block;width:100%;text-align:left;padding:10px 13px;margin-top:7px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 .93rem Nunito,system-ui,sans-serif;cursor:pointer;transition:transform .12s ease}.quiz-a:hover:not(:disabled){transform:translateX(3px);border-color:var(--c1)}.quiz-a.yes{background:var(--good-soft);border-color:var(--good);color:var(--good)}.quiz-a.no{background:var(--warn-soft);border-color:var(--warn);color:var(--warn)}.quiz-r{font-weight:800;margin:10px 0 0}
.next-lesson{margin-top:12px;padding:9px 16px;border-radius:99px;border:0;background:var(--c1);color:#fff;font:800 .9rem Nunito,system-ui,sans-serif;cursor:pointer}.lesson-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:22px}
.wins{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px}.win{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:3px;font-size:.84rem;color:var(--mute)}.win b{color:var(--ink);font-size:.98rem}.win em{font-style:normal;font-weight:800;font-size:.78rem;margin-top:3px}.win-i{font-size:1.4rem;line-height:1;color:var(--line)}.win.on{background:linear-gradient(135deg,#fff3d6,#ffe0a3);border-color:#efc15f;color:#6c4a10}.win.on b{color:#4b3208}.win.on .win-i{color:#d9962b}.win.on em{color:#8a5a06}
.go a{transition:transform .15s ease,border-color .15s ease}.go a:hover{transform:translateY(-2px)}
@media (prefers-reduced-motion:no-preference){.tile,.mission{animation:rise .5s ease both}.tile:nth-child(2){animation-delay:.06s}.tile:nth-child(3){animation-delay:.12s}.tile:nth-child(4){animation-delay:.18s}}
@keyframes rise{from{transform:translateY(10px)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.hero{animation:none}}
.glossary dt{font-weight:800;margin-top:12px}.glossary dd{margin:0;color:var(--mute);font-size:.95rem}
@media (max-width:860px){.frame{display:block}.side{position:static;height:auto;padding:10px 12px}.brand{padding:4px 4px 8px}.menu-btn{display:block;width:100%;padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:700 .92rem Nunito,system-ui,sans-serif;text-align:left;cursor:pointer}.navs{display:none;margin-top:10px}.navs.open{display:block}.content{padding:16px 16px 44px}.ph h1{font-size:1.55rem}.hero{padding:20px}}
</style>`;

const SCRIPT = `<script>(function(){
  var cols=[].slice.call(document.querySelectorAll('main>section.col'));
  var btn=document.querySelector('.menu-btn'),nav=document.querySelector('.navs');
  if(btn&&nav)btn.addEventListener('click',function(){var o=nav.classList.toggle('open');btn.setAttribute('aria-expanded',o?'true':'false');});
  var calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Big numbers count up as the page opens.
  if(!calm)[].forEach.call(document.querySelectorAll('.big,.stat .v'),function(el){var t=el.textContent.trim();if(!/^[\d,]+$/.test(t))return;var n=+t.replace(/,/g,'');if(!n)return;var s=null;function f(ts){s=s||ts;var p=Math.min(1,(ts-s)/900),e=1-Math.pow(1-p,3);el.textContent=Math.round(n*e).toLocaleString('en-CA');if(p<1)requestAnimationFrame(f);else el.textContent=t;}requestAnimationFrame(f);});
  // Lessons: answer a question, see why, and keep a tally in this browser.
  var learned=[];try{learned=JSON.parse(localStorage.getItem('dashLearned')||'[]');}catch(e){}
  var cnt=document.getElementById('learnCount'),bar=document.getElementById('learnBar'),total=document.querySelectorAll('[data-lesson]').length;
  function tally(){if(cnt)cnt.textContent=learned.length;if(bar)bar.style.width=Math.min(100,learned.length/total*100)+'%';}tally();
  [].forEach.call(document.querySelectorAll('.quiz'),function(q){var r=q.querySelector('.quiz-r'),id=q.closest('[data-lesson]').getAttribute('data-lesson');[].forEach.call(q.querySelectorAll('.quiz-a'),function(b){b.addEventListener('click',function(){var ok=b.getAttribute('data-right')==='1';[].forEach.call(q.querySelectorAll('.quiz-a'),function(x){x.disabled=true;if(x.getAttribute('data-right')==='1')x.classList.add('yes');});if(!ok)b.classList.add('no');r.textContent=r.getAttribute(ok?'data-yes':'data-no');r.hidden=false;if(ok&&learned.indexOf(id)<0){learned.push(id);try{localStorage.setItem('dashLearned',JSON.stringify(learned));}catch(e){}tally();}});});});
  var nx=document.getElementById('nextLesson');if(nx)nx.addEventListener('click',function(){var ls=[].slice.call(document.querySelectorAll('[data-lesson]')),i=ls.findIndex(function(l){return !l.hidden;});ls[i].hidden=true;ls[(i+1)%ls.length].hidden=false;});
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
</head><body class="t-${groupOf(active)}${active === 'home' ? ' home' : ''}"><div class="frame">
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
