'use strict';
// Homepage polish (2026-11-10): the editorial look on top of home-simple.js. Fraunces headings and Nunito UI (both
// already loaded by the page shell, so no new font requests), bento grids for Editor's Picks, This Weekend, the mood
// tiles and Hidden Gems, "live" Roam Now / Happy Hour blocks, the guide index as town tabs, and soft transitions.
// Every heading, sentence and link is the same as before; only layout and styling change.
const SERIF = "'Fraunces','Fraunces Fallback',Georgia,serif";
const SANS = "'Nunito','Nunito Fallback',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const EASE = 'cubic-bezier(.2,.7,.2,1)';

const css = `
/* ---- type and colour ---- */
#homeSimple{--ink:#14252e;--ink-soft:#56666b;--cream:#faf7f0;--paper:#fffdf8;--line:#e6dfce;--gold:#b08d3c;--gold-soft:#f1dda1;--live:#ff6b57;--radius:22px;--shadow:0 1px 2px #14252e0a,0 10px 28px -14px #14252e3d;--shadow-up:0 2px 4px #14252e0f,0 22px 44px -18px #14252e59;background:var(--cream);color:var(--ink);font-family:${SANS};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
#homeSimple h1,#homeSimple h2{font-family:${SERIF};font-weight:600;letter-spacing:-.018em}
#homeSimple .pill{font-family:${SANS};font-weight:800;transition:transform .25s ${EASE},box-shadow .25s ${EASE},background-color .25s}
#homeSimple .pill:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px #14252e80}

/* ---- hero ---- */
#homeSimple .hero{padding:92px 24px 70px}
#homeSimple .hero:before{background:linear-gradient(180deg,#0e1f2870 0%,#0e1f2826 38%,#0e1f28b8 100%)}
#homeSimple .hero .eyebrow{letter-spacing:.24em;font-size:12px;font-weight:800;color:var(--gold-soft)}
#homeSimple .hero h1{font-size:clamp(44px,5.6vw,76px);line-height:1.02;margin:18px auto 16px;max-width:980px;text-shadow:0 2px 30px #0e1f2866}
#homeSimple .hero p{font-size:19px;line-height:1.55;max-width:600px;color:#fffaf0}
#homeSimple .quick-search{max-width:680px;margin:30px auto 22px;padding:7px;border-radius:999px;background:#fffdf8f2;box-shadow:0 18px 40px -16px #0e1f28b3,0 0 0 1px #ffffff66 inset;transition:box-shadow .3s ${EASE},transform .3s ${EASE}}
#homeSimple .quick-search:focus-within{box-shadow:0 22px 48px -16px #0e1f28cc,0 0 0 3px #f1dda1cc;transform:translateY(-1px)}
#homeSimple .quick-search input{padding:12px 20px;font-size:17px;outline:0}
#homeSimple .quick-search .pill{padding:14px 26px;border-radius:999px}

/* ---- live blocks: Roam Now and Happy Hour Now ---- */
#homeSimple .hero-actions{gap:14px}
#homeSimple .hero-action{position:relative;min-width:290px;padding:16px 20px;gap:14px;border-radius:18px;color:#fff;background:#ffffff24;border:1px solid #ffffff47;box-shadow:0 14px 34px -18px #0e1f28cc;-webkit-backdrop-filter:blur(16px) saturate(150%);backdrop-filter:blur(16px) saturate(150%);transition:transform .35s ${EASE},background-color .35s,border-color .35s,box-shadow .35s ${EASE};will-change:transform}
#homeSimple .hero-action.gold{background:#e6c56b38;border-color:#f1dda180}
#homeSimple .hero-action:hover{transform:translateY(-3px);background:#ffffff38;border-color:#ffffff8c;box-shadow:0 22px 44px -18px #0e1f28e6}
#homeSimple .hero-action.gold:hover{background:#e6c56b57;border-color:#f1dda1cc}
#homeSimple .hero-action .symbol{display:grid;place-items:center;width:44px;height:44px;flex:none;border-radius:50%;font-size:22px;background:#ffffff26;border:1px solid #ffffff40}
#homeSimple .hero-action b{font-size:17px;font-weight:800;display:flex;align-items:center;gap:9px}
#homeSimple .hero-action small{font-size:13px;color:#f4efe2;margin-top:3px}
#homeSimple .hero-action .go{font-size:20px;transition:transform .35s ${EASE}}
#homeSimple .hero-action:hover .go{transform:translateX(5px)}
#homeSimple .live-dot{position:relative;flex:none;width:9px;height:9px;margin:0;border-radius:50%;background:var(--live);box-shadow:0 0 0 3px #ff6b5733}
#homeSimple .hero-action.gold .live-dot{background:#f5cf5e;box-shadow:0 0 0 3px #f5cf5e33}
#homeSimple .live-dot:after{content:'';position:absolute;inset:0;border-radius:50%;background:inherit;animation:homePulse 2s ${EASE} infinite;will-change:transform,opacity}
#homeSimple .hero-action.gold .live-dot:after{animation-delay:1s}
@keyframes homePulse{0%{transform:scale(1);opacity:.75}75%,100%{transform:scale(3.4);opacity:0}}
#homeSimple .hero-note{font-size:13px!important;margin-top:20px!important;opacity:.92}

/* ---- numbers strip ---- */
#homeSimple .proof{background:var(--paper);border-bottom:1px solid var(--line);padding:18px 16px}
#homeSimple .home-stats{gap:0}
#homeSimple .home-stats li{padding:0 28px;border-left:1px solid var(--line)}
#homeSimple .home-stats li:first-child{border-left:0}
#homeSimple .home-stats a{display:flex;align-items:baseline;gap:8px;padding:12px 0;margin:-12px 0;font-size:13px;color:var(--ink-soft);transition:color .2s}
#homeSimple .home-stats a:hover{color:var(--ink)}
#homeSimple .home-stats strong{font-family:${SERIF};font-size:24px;font-weight:600;color:var(--ink);letter-spacing:-.01em}

/* ---- sections ---- */
#homeSimple .section{margin-top:64px}
#homeSimple .heading{margin-bottom:22px}
#homeSimple h2{font-size:38px;line-height:1.1}
#homeSimple .heading .sub{font-size:15px;color:var(--ink-soft);margin-top:8px}
#homeSimple .mini-label{font-size:11px;letter-spacing:.2em;color:var(--gold);font-weight:800;margin-bottom:8px}
#homeSimple .view{font-size:13px;font-weight:800;text-decoration:none;padding:10px 16px;border:1px solid #cdc4ab;border-radius:999px;background:transparent;transition:background-color .25s,color .25s,border-color .25s,transform .25s ${EASE}}
#homeSimple .view:hover{background:var(--ink);border-color:var(--ink);color:#fff;transform:translateY(-1px)}

/* ---- photo tiles (mood, gems, towns) ---- */
#homeSimple .photo{border-radius:var(--radius);box-shadow:var(--shadow);transition:transform .45s ${EASE},box-shadow .45s ${EASE};will-change:transform}
#homeSimple .photo img{transition:transform .9s ${EASE};will-change:transform}
#homeSimple .photo:after{background:linear-gradient(180deg,#0e1f2800 22%,#0e1f2873 56%,#0e1f28eb 100%);transition:opacity .45s}
#homeSimple .photo b,#homeSimple .photo p,#homeSimple .bento .card-body{text-shadow:0 1px 14px #0e1f28b3}
#homeSimple .photo b{font-family:${SERIF};font-weight:600;font-size:19px;letter-spacing:-.01em;transition:transform .45s ${EASE}}
#homeSimple .photo p{transition:transform .45s ${EASE}}
#homeSimple .photo:hover{transform:translateY(-4px);box-shadow:var(--shadow-up)}
#homeSimple .photo:hover img{transform:scale(1.06)}
#homeSimple .photo:hover b,#homeSimple .photo:hover p{transform:translateY(-4px)}

/* ---- cards (More Editor's Picks keeps the plain card) ---- */
#homeSimple .card{border:0;border-radius:var(--radius);background:var(--paper);box-shadow:var(--shadow);transition:transform .45s ${EASE},box-shadow .45s ${EASE};will-change:transform}
#homeSimple .card .home-event-media{display:block;overflow:hidden}
#homeSimple .card img{transition:transform .9s ${EASE};will-change:transform}
#homeSimple .card:hover{transform:translateY(-4px);box-shadow:var(--shadow-up)}
#homeSimple .card:hover img{transform:scale(1.06)}
#homeSimple .home-event-date{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:800}
#homeSimple .home-event-name{font-family:${SERIF};font-weight:600;font-size:20px;line-height:1.2;letter-spacing:-.01em}
#homeSimple .more-picks summary{font-weight:800;border-color:#cdc4ab;transition:background-color .25s,color .25s,border-color .25s}
#homeSimple .more-picks summary:hover{background:var(--ink);border-color:var(--ink);color:#fff}

/* ---- bento grids: Editor's Picks (feature left) and This Weekend (feature right) ---- */
#homeSimple .bento{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:244px;gap:18px}
#homeSimple .bento>.card{position:relative;display:block;overflow:hidden;isolation:isolate;background:#14252e;color:#fff}
#homeSimple .bento>.card .home-event-media{position:absolute;inset:0;z-index:-2}
#homeSimple .bento>.card .home-event-media picture{display:block;width:100%;height:100%}
#homeSimple .bento>.card img{width:100%;height:100%;min-height:0;object-fit:cover}
#homeSimple .bento>.card:after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,#0e1f2800 12%,#0e1f2899 54%,#0e1f28f2 100%)}
#homeSimple .bento>.card .card-body{position:absolute;left:0;right:0;bottom:0;padding:20px 22px;transition:transform .45s ${EASE}}
#homeSimple .bento>.card:hover .card-body{transform:translateY(-6px)}
#homeSimple .bento .home-event-date{color:var(--gold-soft)}
#homeSimple .bento .home-event-name{margin:6px 0 0;font-size:20px;color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#homeSimple .bento .home-event-place{display:none;margin-top:6px;font-size:14px;line-height:1.45;color:#e9ede9}
#homeSimple .bento>.card:nth-child(-n+2) .home-event-place{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#homeSimple .bento>.card:nth-child(1) .card-body{padding:28px 30px}
#homeSimple .bento>.card:nth-child(1) .home-event-name{font-size:34px;line-height:1.08;margin-top:8px}
#homeSimple .bento>.card:nth-child(1) .home-event-place{font-size:16px;max-width:460px;margin-top:10px}
#homeSimple .bento>.card:nth-child(2) .home-event-name{font-size:24px}
#homeSimple .bento-a>.card:nth-child(1){grid-column:1/3;grid-row:1/3}
#homeSimple .bento-a>.card:nth-child(2){grid-column:3/5;grid-row:1}
#homeSimple .bento-b>.card:nth-child(1){grid-column:3/5;grid-row:1/3}
#homeSimple .bento-b>.card:nth-child(2){grid-column:1/3;grid-row:1}
#homeSimple .bento-b>.card:nth-child(3){grid-column:1;grid-row:2}
#homeSimple .bento-b>.card:nth-child(4){grid-column:2;grid-row:2}

/* ---- mood tiles: one large, two wide, three small ---- */
#homeSimple .bento-mood{grid-template-columns:repeat(6,minmax(0,1fr));grid-auto-rows:158px;gap:16px}
#homeSimple .bento-mood .photo{min-height:0;padding:18px 20px}
#homeSimple .bento-mood .photo:nth-child(1){grid-column:1/3;grid-row:1/3}
#homeSimple .bento-mood .photo:nth-child(1) b{font-size:30px}
#homeSimple .bento-mood .photo:nth-child(2){grid-column:3/5}
#homeSimple .bento-mood .photo:nth-child(3){grid-column:5/7}
#homeSimple .bento-mood .photo:nth-child(4){grid-column:3/5}
#homeSimple .bento-mood .photo:nth-child(2) b,#homeSimple .bento-mood .photo:nth-child(3) b,#homeSimple .bento-mood .photo:nth-child(4) b{font-size:22px}

/* ---- hidden gems: three tiles of different widths ---- */
#homeSimple .bento-gems{grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}
#homeSimple .bento-gems .photo{display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;text-align:left;min-height:260px;padding:24px}
#homeSimple .bento-gems .photo:nth-child(1){grid-column:span 5}
#homeSimple .bento-gems .photo:nth-child(2){grid-column:span 4}
#homeSimple .bento-gems .photo:nth-child(3){grid-column:span 3}
#homeSimple .bento-gems b{font-family:${SERIF};font-size:26px;line-height:1.12}
#homeSimple .bento-gems p{font-size:14px;margin-top:6px;color:#eef0ea}

/* ---- towns ---- */
#homeSimple .destination-grid{gap:16px}
#homeSimple .destination-grid .photo{min-height:150px;padding:16px}

/* ---- guide index: town tabs and guide chips ---- */
#homeSimple .guides{margin-top:64px}
#homeSimple .guide-tabs{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 14px;margin:0 -2px;scroll-snap-type:x proximity;scrollbar-width:none;-webkit-overflow-scrolling:touch;-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 48px),transparent);mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 48px),transparent)}
#homeSimple .guide-tabs::-webkit-scrollbar{display:none}
#homeSimple .guide-tab{flex:none;scroll-snap-align:start;border:1px solid #cdc4ab;background:transparent;color:var(--ink);border-radius:999px;padding:10px 18px;min-height:44px;font-weight:800;font-size:14px;white-space:nowrap;transition:background-color .25s,color .25s,border-color .25s,transform .25s ${EASE}}
#homeSimple .guide-tab:hover{border-color:var(--ink);transform:translateY(-1px)}
#homeSimple .guide-tab[aria-selected="true"]{background:var(--ink);border-color:var(--ink);color:#fff}
#homeSimple .guide-tab:last-child{margin-right:48px}
#homeSimple .guide-panel{background:var(--paper);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px 26px;margin-top:10px}
#homeSimple .guide-panel h3{font-family:${SERIF};font-weight:600;font-size:24px;margin:0 0 14px;letter-spacing:-.01em}
#homeSimple .guide-panel h3 a{display:inline-flex;align-items:center;gap:8px;min-height:44px}
#homeSimple .guide-panel h3 a:after{content:'→';font-family:${SANS};font-size:16px;transition:transform .3s ${EASE}}
#homeSimple .guide-panel h3 a:hover:after{transform:translateX(4px)}
#homeSimple .guide-chips{display:flex;flex-wrap:wrap;gap:9px}
#homeSimple .guide-chip{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;min-height:40px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:14px;font-weight:700;transition:background-color .2s,border-color .2s,color .2s,transform .2s ${EASE}}
#homeSimple .guide-chip span{font-size:12px;font-weight:800;color:var(--gold);transition:color .2s}
#homeSimple .guide-chip:hover{background:var(--ink);border-color:var(--ink);color:#fff;transform:translateY(-1px)}
#homeSimple .guide-chip:hover span{color:var(--gold-soft)}
#homeSimple .guides.js-tabs .guide-panel{margin-top:0}
#homeSimple .guides.js-tabs .guide-panel:not(.is-active){display:none}
#homeSimple .guides.js-tabs .guide-panel.is-active{animation:homeFadeUp .35s ${EASE} both}
#homeSimple .guides:not(.js-tabs) .guide-tabs{display:none}
@keyframes homeFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* ---- trip banner ---- */
#homeSimple .trip-banner{margin:64px 0 56px;padding:58px 54px;border-radius:28px;box-shadow:var(--shadow-up)}
#homeSimple .trip-banner h2{font-size:44px;line-height:1.06}
#homeSimple .trip-banner p{font-size:17px;line-height:1.55;margin-top:14px}
#homeSimple .trip-banner .eyebrow{letter-spacing:.2em;font-size:11px;font-weight:800;color:var(--gold-soft);margin-bottom:12px}
#homeSimple .trip-banner .pill{padding:16px 28px;font-size:16px}
#homeSimple .footer .logo{font-family:${SERIF}}

/* ---- dialogs (Contact, the app teaser): the homepage had lost their styles (the form showed bare, with its hidden
   spam-trap field visible), so they are styled here, then fade and rise instead of popping ---- */
#homeSimple dialog.app-teaser-dialog{border:0;padding:0;border-radius:24px;width:min(540px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain;background:#14252e;color:#f5f3ed;box-shadow:0 30px 70px -24px #000000b3;font-family:${SANS}}
#homeSimple dialog.app-teaser-dialog *{box-sizing:border-box}
#homeSimple .app-teaser-dialog-inner{position:relative;padding:36px 32px 30px}
#homeSimple .app-teaser-dialog-eyebrow{display:inline-block;color:var(--gold-soft);font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
#homeSimple .app-teaser-dialog h2{font-size:30px;line-height:1.12;margin:10px 0 12px;color:inherit}
#homeSimple .app-teaser-dialog h2:focus{outline:none}
#homeSimple .app-teaser-dialog p{color:#f5f3edc7;margin:0 0 18px;line-height:1.5;font-size:15px}
#homeSimple .app-teaser-dialog-close{position:absolute;top:12px;right:14px;width:38px;height:38px;border-radius:50%;border:0;background:#fffcf61f;color:inherit;font-size:22px;line-height:1;transition:background-color .2s,transform .3s ${EASE}}
#homeSimple .app-teaser-dialog-close:hover{background:#fffcf638;transform:rotate(90deg)}
#homeSimple .contact-field{margin:0 0 14px}
#homeSimple .contact-field label,#homeSimple .app-teaser-signup label{display:block;font-size:14px;font-weight:700;margin:0 0 6px;color:#f5f3ed}
#homeSimple .app-teaser-dialog input[type="text"],#homeSimple .app-teaser-dialog input[type="email"],#homeSimple .app-teaser-dialog textarea,#homeSimple .app-teaser-dialog select{display:block;width:100%;min-height:46px;padding:11px 14px;font-family:inherit;font-size:16px;line-height:1.4;color:#f5f3ed;background:#fffcf614;border:1px solid #fffcf64d;border-radius:12px;transition:border-color .2s,background-color .2s}
#homeSimple .app-teaser-dialog textarea{min-height:120px;resize:vertical}
#homeSimple .app-teaser-dialog select option{color:#14252e}
#homeSimple .app-teaser-dialog ::placeholder{color:#f5f3ed80}
#homeSimple .app-teaser-dialog input:focus-visible,#homeSimple .app-teaser-dialog textarea:focus-visible,#homeSimple .app-teaser-dialog select:focus-visible{outline:2px solid var(--gold-soft);outline-offset:1px;border-color:transparent;background:#fffcf61f}
#homeSimple .app-teaser-dialog [aria-invalid="true"]{border-color:#ffb4a8}
#homeSimple .app-teaser-dialog .contact-field-error,#homeSimple .app-teaser-dialog .contact-form-error{margin:6px 0 0;font-size:13px;line-height:1.4;color:#ffb4a8}
#homeSimple .app-teaser-dialog .contact-form-error{margin:0 0 14px}
#homeSimple .app-teaser-dialog [hidden]{display:none}
#homeSimple .contact-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
#homeSimple .contact-submit,#homeSimple .app-teaser-signup-row button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 26px;border:0;border-radius:999px;background:#e1c886;color:#14252e;font-size:16px;font-weight:800;transition:transform .25s ${EASE},filter .2s}
#homeSimple .contact-submit:hover,#homeSimple .app-teaser-signup-row button:hover{filter:brightness(1.06);transform:translateY(-1px)}
#homeSimple .contact-submit[disabled]{opacity:.65;cursor:progress}
#homeSimple .contact-topic-hint{margin:-6px 0 14px;font-size:14px;line-height:1.45}
#homeSimple .app-teaser-dialog .contact-alt,#homeSimple .app-teaser-dialog .app-teaser-dialog-note{margin:14px 0 0;font-size:13px;line-height:1.5;color:#f5f3edb3}
#homeSimple dialog.app-teaser-dialog a{color:var(--gold-soft);text-decoration:underline}
#homeSimple .app-teaser-signup{margin:14px 0 6px}
#homeSimple .app-teaser-signup-row{display:flex;gap:10px;flex-wrap:wrap}
#homeSimple .app-teaser-signup-row input{flex:1 1 200px;min-width:0}
@media(max-width:480px){#homeSimple .app-teaser-dialog-inner{padding:32px 20px 24px}#homeSimple .contact-submit{width:100%}#homeSimple .app-teaser-dialog h2{font-size:26px}}
#homeSimple dialog[open]{animation:homeDialogIn .3s ${EASE} both}
#homeSimple dialog::backdrop{background:#0e1f288c}
#homeSimple dialog[open]::backdrop{animation:homeFade .3s ease both}
@keyframes homeDialogIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes homeFade{from{opacity:0}to{opacity:1}}

/* ---- sections ease in as they scroll into view, where the browser supports it ---- */
@supports (animation-timeline:view()){
#homeSimple .wrap>.section,#homeSimple .trip-banner{animation:homeFadeUp linear both;animation-timeline:view();animation-range:entry 0% entry 32%}
}

/* ---- tablet ---- */
@media(max-width:1023px){
#homeSimple .bento{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:220px}
#homeSimple .bento-a>.card:nth-child(n),#homeSimple .bento-b>.card:nth-child(n){grid-column:auto;grid-row:auto}
#homeSimple .bento>.card:nth-child(1){grid-column:1/-1;grid-row:span 1;min-height:320px}
#homeSimple .bento>.card:nth-child(2){grid-column:1/-1}
#homeSimple .bento{grid-auto-rows:minmax(220px,auto)}
#homeSimple .bento-mood{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:150px}
#homeSimple .bento-mood .photo:nth-child(n){grid-column:auto;grid-row:auto}
#homeSimple .bento-mood .photo:nth-child(n) b{font-size:19px}
#homeSimple .bento-gems .photo:nth-child(n){grid-column:span 4;min-height:220px}
#homeSimple .bento-gems b{font-size:22px}
#homeSimple .destination-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}

/* ---- phone ---- */
@media(max-width:700px){
#homeSimple .hero{padding:44px 18px 34px}
#homeSimple .hero h1{font-size:42px;max-width:340px;margin:14px auto 12px}
#homeSimple .hero h1,#homeSimple .hero p{text-wrap:balance}
#homeSimple .hero p{font-size:15px;max-width:320px}
#homeSimple .hero .eyebrow{font-size:10px;letter-spacing:.2em}
#homeSimple .quick-search{margin:24px auto 16px;padding:5px}
#homeSimple .quick-search input{font-size:16px;padding:10px 14px}
#homeSimple .quick-search .pill{padding:13px 18px}
#homeSimple .hero-actions{gap:10px}
#homeSimple .hero-action{min-width:0;flex:1;display:block;text-align:left;padding:14px 14px;border-radius:16px}
#homeSimple .hero-action b{font-size:15px;gap:8px}
#homeSimple .hero-action .symbol,#homeSimple .hero-action .go{display:none}
#homeSimple .hero-action small{font-size:12px;line-height:1.4;margin-top:6px}
#homeSimple .hero-note{font-size:12px!important;margin-top:16px!important}
#homeSimple .proof{padding:14px 10px}
#homeSimple .home-stats li{padding:0 16px}
#homeSimple .home-stats strong{font-size:19px}
#homeSimple .home-stats a{font-size:12px;gap:6px}
#homeSimple .section,#homeSimple .guides{margin-top:44px}
#homeSimple .heading{margin-bottom:16px;align-items:end;flex-wrap:wrap;gap:10px 12px}
#homeSimple .heading h2,#homeSimple h2{font-size:29px}
#homeSimple .heading .sub{font-size:13px;margin-top:6px;max-width:none}
#homeSimple .view{font-size:12px;padding:8px 13px;min-height:36px}
#homeSimple .bento{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(168px,auto);gap:12px}
#homeSimple .bento>.card:nth-child(1){min-height:268px}
#homeSimple .bento>.card:nth-child(2){min-height:176px}
#homeSimple .bento>.card .card-body{padding:14px 15px}
#homeSimple .bento>.card:nth-child(1) .card-body{padding:20px}
#homeSimple .bento>.card:nth-child(1) .home-event-name{font-size:27px}
#homeSimple .bento>.card:nth-child(1) .home-event-place{font-size:14px}
#homeSimple .bento>.card:nth-child(2) .home-event-name{font-size:21px}
#homeSimple .bento .home-event-name{font-size:17px;line-height:1.2;-webkit-line-clamp:3}
#homeSimple .bento .home-event-date{font-size:10px;letter-spacing:.08em}
#homeSimple .bento-mood{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:118px;gap:12px}
#homeSimple .bento-mood .photo:nth-child(1),#homeSimple .bento-mood .photo:nth-child(6){grid-column:1/-1;min-height:150px}
#homeSimple .bento-mood .photo:nth-child(6){min-height:118px}
#homeSimple .bento-mood .photo:nth-child(1) b{font-size:24px}
#homeSimple .bento-mood{grid-auto-rows:minmax(118px,auto)}
#homeSimple .bento-gems{gap:12px}
#homeSimple .bento-gems .photo:nth-child(n){grid-column:1/-1;min-height:150px;padding:18px}
#homeSimple .destination-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
#homeSimple .destination-grid .photo{min-height:112px}
#homeSimple .guide-panel{padding:18px 16px}
#homeSimple .guide-panel h3{font-size:21px;margin-bottom:8px}
#homeSimple .guide-chip{font-size:13px;padding:8px 12px}
#homeSimple .trip-banner{margin:44px 0 36px;padding:32px 24px;border-radius:22px}
#homeSimple .trip-banner h2{font-size:31px}
#homeSimple .trip-banner p{font-size:15px}
}

/* ---- people who ask for less motion get none ---- */
@media(prefers-reduced-motion:reduce){
#homeSimple *,#homeSimple *:before,#homeSimple *:after{animation:none!important;transition:none!important}
#homeSimple .wrap>.section,#homeSimple .trip-banner{opacity:1!important;transform:none!important}
}
`;

// Switching EN / FR loads the other page; where the browser supports it the two pages cross-fade instead of flashing.
const viewTransition = `@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.32s;animation-timing-function:${EASE}}
@media(prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}
`;

// The guide index (server.js renderGuideFooterHTML: one line of links per town) as a tab per town with a chip per
// guide. Every town and guide link stays in the page; without scripting all the towns are listed one after another.
function guidesSection(indexHtml, bi) {
  const towns = [...String(indexHtml || '').matchAll(/<div class="og-guide-region"><strong><a href="([^"]+)">([^<]+)<\/a>:<\/strong>([\s\S]*?)<\/div>/g)]
    .map((m) => ({ href: m[1], name: m[2], links: [...m[3].matchAll(/<a href="([^"]+)">([^<]*?)(?: \((\d+)\))?<\/a>/g)].map((a) => ({ href: a[1], label: a[2], count: a[3] })) }))
    .filter((t) => t.links.length);
  if (!towns.length) return '';
  const id = (t) => `guides-${t.href.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
  const tabs = towns.map((t, i) => `<button type="button" class="guide-tab" role="tab" id="${id(t)}-tab" aria-controls="${id(t)}" aria-selected="${i === 0 ? 'true' : 'false'}"${i === 0 ? '' : ' tabindex="-1"'}>${t.name}</button>`).join('');
  const panels = towns.map((t, i) => `<div class="guide-panel${i === 0 ? ' is-active' : ''}" role="tabpanel" id="${id(t)}" aria-labelledby="${id(t)}-tab"><h3><a href="${t.href}">${t.name}</a></h3><div class="guide-chips">${t.links.map((l) => `<a class="guide-chip" href="${l.href}">${l.label}${l.count ? ` <span>${l.count}</span>` : ''}</a>`).join('')}</div></div>`).join('');
  return `<section class="guides" id="og-guides"><div class="heading"><div><div class="mini-label">${bi('Every town. Every kind of day.', 'Chaque ville. Chaque envie.')}</div><h2>${bi('Browse by guide', 'Explorer par guide')}</h2></div></div><div class="guide-tabs" role="tablist" aria-label="Towns">${tabs}</div>${panels}</section>`;
}
const guidesScript = `<script id="home-guide-tabs">(function(){var s=document.getElementById('og-guides');if(!s)return;var tabs=[].slice.call(s.querySelectorAll('.guide-tab'));if(!tabs.length)return;s.classList.add('js-tabs');function pick(t,focus){tabs.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on?'true':'false');x.tabIndex=on?0:-1;var p=document.getElementById(x.getAttribute('aria-controls'));if(p)p.classList.toggle('is-active',on)});if(focus){t.focus();if(t.scrollIntoView)t.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})}}s.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('.guide-tab');if(t)pick(t,false)});s.addEventListener('keydown',function(e){var i=tabs.indexOf(document.activeElement);if(i<0)return;var n=-1;if(e.key==='ArrowRight')n=(i+1)%tabs.length;else if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;if(n>=0){e.preventDefault();pick(tabs[n],true)}})})();</script>`;

// The first (largest) bento card asks for a photo big enough for its size.
function featureSizes(cards) {
  return cards.map((c, i) => (i < 2 ? c.replace(/sizes="[^"]*"/g, 'sizes="(max-width: 1023px) 94vw, 640px"') : c));
}

module.exports = { css, viewTransition, guidesSection, guidesScript, featureSizes };
