// Presentation only: the existing map owns filtering, GPS, routes and voice guidance.
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Only a fresh discovery visit gets the default; explicit links keep their intent.
function roamOpenByDefault(search,hash){
  const q=new URLSearchParams(search);
  return hash!=='#events'&&!['f','q','show','directions'].some(k=>q.has(k));
}
function roamRouteLocationMessage(reason,destination,lang='en'){
  const fr=lang==='fr';
  const causes=fr?{blocked:'La position est bloquée dans votre navigateur.',failed:'Votre position est introuvable.',outside:'Votre position est hors de l’Okanagan.',unsupported:'Ce navigateur ne peut pas partager votre position.'}:{blocked:'Location is blocked in your browser.',failed:'Couldn’t find your location.',outside:'Your location is outside the Okanagan.',unsupported:'This browser cannot share your location.'};
  return (fr?'Vers ':'To ')+destination+'. '+(causes[reason]?causes[reason]+' ':'')+(fr?'Utilisez votre position pour le guidage en direct, ou choisissez le départ sur la carte pour un aperçu.':'Use your location for live guidance, or choose a start on the map for a route preview.');
}
function renderRoamFilterGroups({must,diet,lang='en'}) {
  const translations={'Dietary':'Régimes alimentaires','Patios, music, views & sports':'Terrasses, musique, vues et sports','Dogs, kids & groups':'Chiens, enfants et groupes','Right now':'En ce moment','More options':'Autres options'};
  const titleLabel=t=>lang==='fr'?(translations[t]||t):t;
  const chips=items=>items.map(f=>`<button type="button" class="pm-chip" data-pm-feat="${esc(f.key)}" aria-pressed="false">${f.icon?'<span aria-hidden="true">'+f.icon+'</span> ':''}${esc(f.label)}</button>`).join('');
  const groupEmoji = {
    Dietary: '🥗',
    'Patios, music, views & sports': '🎶',
    'Dogs, kids & groups': '🐾',
    'Right now': '⏰',
    'More options': '✨',
  };
  const group=(title,content)=>`<details class="rn-filter-group"><summary><span class="rn-filter-emoji" aria-hidden="true">${groupEmoji[title]}</span> ${titleLabel(title)}<span data-rn-count></span></summary><div class="pm-chips" role="group" aria-label="${titleLabel(title)}">${content}</div></details>`;
  return group('Dietary',chips(diet))+group('Patios, music, views & sports',chips(must.filter(f=>['patio','heated','music','lake','sports'].includes(f.key))))+group('Dogs, kids & groups',chips(must.filter(f=>['dogs','kids','groups'].includes(f.key))))+group('Right now','<button type="button" class="pm-chip" data-pm-open aria-pressed="false">'+(lang==='fr'?'Ouvert maintenant':'Open now')+'</button>'+chips(must.filter(f=>['happy','specials','nights'].includes(f.key))))+group('More options',chips(must.filter(f=>['late','early','nonalc','free','access','booking','takeout','localdrinks','ownlocal','games','localbeer','fireplace','beachaccess'].includes(f.key))))+'<button type="button" class="pm-chip" data-pm-top aria-pressed="false">'+(lang==='fr'?'Les mieux notés':'Top rated')+'</button>';
}
const ROAM_LAYOUT_STYLE=`<style id="roam-now-layout">
body.map-page{background:#f6f3eb}body.map-page .pm-stage{height:auto;min-height:900px;overflow:visible;max-width:1500px;margin:auto;padding:24px;--pm-sheet-h:0px}
body.map-page .pm-float{position:relative;inset:auto;width:auto;pointer-events:auto;margin-bottom:20px;z-index:660}
body.map-page .rn-intro{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}body.map-page .rn-intro h1{font:700 34px/1.15 Georgia,serif;margin:0 0 6px}body.map-page .rn-intro p{margin:0;font-size:14px;color:#5e6e6d}
body.map-page .rn-location{display:flex;align-items:center;gap:10px;background:#fffdf8;border:1px solid #d8dbd2;border-radius:12px;padding:12px 16px;min-height:48px;font:inherit;cursor:pointer;color:#1b303c}body.map-page .rn-location small{display:block;font-size:11px;text-align:left}body.map-page .pm-searchbar{box-shadow:none;border:1px solid #d8dbd2;max-width:900px}body.map-page .pm-filters-btn{width:auto;gap:7px;border-radius:24px;padding:0 16px;font-weight:800}body.map-page .pm-badge{position:static;background:#a48945}
body.map-page .pm-quick{margin:12px 0 0;padding:0;overflow:visible;flex-wrap:wrap;gap:8px}body.map-page .pm-quick .pm-chip{display:none;box-shadow:none;border-color:#d8dbd2}body.map-page .pm-quick [data-pm-kind],body.map-page .pm-quick [data-pm-open],body.map-page .pm-quick [aria-pressed="true"],body.map-page .pm-quick .pm-quick-clear:not([hidden]),body.map-page .pm-tagchip{display:inline-flex}body.map-page .pm-quick .pm-chip{font-size:13px;min-height:44px}body.map-page .pm-quick .pm-tagchips{display:contents}
body.map-page .pm-sheet,body.map-page .pm-sheet[data-state]{position:relative;inset:auto;width:51%;height:720px;max-height:none;border-radius:14px;background:transparent;box-shadow:none;transition:none}body.map-page .pm-sheet-head{padding:0 0 14px;touch-action:auto}body.map-page .pm-sheet-body{padding:0 10px 14px 0}body.map-page .pm-handle{display:none}body.map-page .pm-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}body.map-page .pm-item{border:1px solid #deded2;border-radius:13px;background:#fffdfa;margin:0;overflow:hidden}body.map-page .pm-item-main{padding:0 14px 14px;width:100%;text-align:left}body.map-page .rn-photo{display:block;width:calc(100% + 28px);max-width:none;height:178px;object-fit:cover;margin:0 -14px 14px}body.map-page .rn-no-photo{display:flex;align-items:center;justify-content:center;height:90px;background:#e9e7dc;color:#5b6b64;font-size:12px;margin:0 -14px 14px}body.map-page .pm-name{font-size:19px;line-height:1.25}body.map-page .pm-meta{font-size:12px;margin:6px 0}body.map-page .pm-acts{flex-direction:row-reverse;padding:0 12px 14px}body.map-page .pm-dir,body.map-page .pm-link{justify-content:center;flex:1;padding:0 10px;font-size:13px}body.map-page .pm-dir,body.map-page .pm-panel-done{background:#1b303c}body.map-page .pm-empty,body.map-page .pm-group{grid-column:1/-1}
body.map-page #okMap{top:var(--pm-float-h,240px);left:54%;right:24px;bottom:24px;width:auto;height:720px;border:1px solid #d6dccc;border-radius:14px;overflow:hidden}body.map-page .pm-locate{top:calc(var(--pm-float-h,240px) + 15px);bottom:auto;right:38px}body.map-page .pm-pinbtn{top:calc(var(--pm-float-h,240px) + 80px);bottom:auto;right:42px}
body.map-page .rn-views{display:none}body.map-page .rn-backdrop{position:fixed;inset:0;background:#10252c70;z-index:999}body.map-page .rn-backdrop[hidden]{display:none}body.map-page .rn-categories summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:700}body.map-page .rn-needs-title{order:1;flex-basis:100%;text-transform:uppercase;font-size:11px;font-weight:800;color:#5e716b;margin-top:4px}body.map-page .pm-quick .pm-chip{order:2;min-height:44px}body.map-page .pm-quick [data-pm-kind]{order:0}body.map-page .pm-panel{position:fixed;inset:5vh auto 5vh 50%;transform:translateX(-50%);width:460px;max-width:calc(100vw - 24px);border:1px solid #d8dbd2;border-radius:18px;box-shadow:0 12px 50px #10252c30;z-index:1000;background:#fffdf8}body.map-page .pm-panel-head{background:#fffdf8}body.map-page .pm-panel .pm-chips{display:grid;grid-template-columns:1fr 1fr}body.map-page .pm-panel .pm-chip{white-space:normal;text-align:left;min-height:44px;font-size:14px}body.map-page .pm-panel-done{font-size:13px;padding:0 16px}body.map-page .rn-clear{min-height:44px;background:none;border:0;text-decoration:underline;font:inherit;cursor:pointer}body.map-page .rn-panel-footer{position:sticky;bottom:-24px;background:#fffdf8;border-top:1px solid #d8dbd2;margin:16px -16px -24px;padding:12px 16px}
body.map-page .pm-stage.is-route{min-height:800px}body.map-page .pm-stage.is-nav .rn-intro,body.map-page .pm-stage.is-nav .rn-views{display:none}body.map-page .pm-stage.is-nav .pm-float{width:50%}body.map-page .pm-stage.is-nav #okMap{top:24px}
@media(max-width:899px){body.map-page .pm-stage{padding:18px 16px;min-height:650px}body.map-page .rn-intro{display:block}body.map-page .rn-intro h1{font-size:29px}body.map-page .rn-location{margin-top:14px;width:100%;text-align:left}body.map-page .rn-views{display:flex;gap:4px;margin-top:14px;background:#e8e7de;border-radius:24px;padding:4px;width:166px}body.map-page .rn-views button{flex:1;min-height:40px;border:0;border-radius:20px;background:transparent;font:inherit;font-size:13px;cursor:pointer}body.map-page .rn-views [aria-pressed=true]{background:#1b303c;color:white}body.map-page .pm-quick [data-pm-kind]{display:none}body.map-page .pm-quick [data-pm-kind="coffee"],body.map-page .pm-quick [data-pm-kind="food"],body.map-page .pm-quick [data-pm-kind="drinks"],body.map-page .pm-quick [data-pm-kind="do"],body.map-page .pm-quick [aria-pressed="true"]{display:inline-flex}body.map-page .pm-quick .pm-chip{font-size:12px;padding:0 11px}body.map-page .pm-sheet,body.map-page .pm-sheet[data-state]{width:100%;height:auto}body.map-page .pm-sheet-body{overflow:visible;padding:0}body.map-page .pm-list{grid-template-columns:1fr}body.map-page .rn-photo{height:195px}body.map-page .pm-sheet-head{gap:8px}body.map-page .pm-count{font-size:16px;display:block}body.map-page .pm-filters-btn{padding:0 12px}body.map-page #okMap{left:16px;right:16px;top:var(--pm-float-h,330px);height:430px}body.map-page .pm-list-view #okMap{visibility:hidden;pointer-events:none}body.map-page .pm-list-view .pm-locate,body.map-page .pm-list-view .pm-pinbtn{display:none}body.map-page .pm-map-view{height:calc(100dvh - var(--pm-top,72px));min-height:760px;overflow:hidden}body.map-page .pm-map-view #okMap{height:auto;bottom:0}body.map-page .pm-map-view .pm-sheet,body.map-page .pm-map-view .pm-sheet[data-state]{position:absolute;left:16px;right:16px;bottom:8px;width:auto;height:190px;background:#fffdf8;z-index:650;padding:12px;border-radius:14px}body.map-page .pm-map-view .pm-sheet-body{overflow:auto}body.map-page .pm-map-view .rn-photo{height:110px}body.map-page .pm-locate{right:26px;top:calc(var(--pm-float-h,330px) + 10px)}body.map-page .pm-pinbtn{right:30px;top:calc(var(--pm-float-h,330px) + 75px)}body.map-page .pm-panel{inset:3dvh 8px;width:auto;max-width:none;transform:none;border-radius:18px}body.map-page .pm-stage.is-route{min-height:820px}body.map-page .pm-stage.is-route .rn-intro,body.map-page .pm-stage.is-route .pm-searchbar,body.map-page .pm-stage.is-route .pm-quick{display:none}body.map-page .pm-stage.is-route .pm-sheet,body.map-page .pm-stage.is-route .pm-sheet[data-state]{height:280px}body.map-page .pm-stage.is-nav .pm-float{width:auto}body.map-page .pm-stage.is-nav #okMap{top:var(--pm-float-h,130px)}body.map-page .pm-stage.is-route .rn-views{margin-top:0}body.map-page .pm-stage.is-route .rn-views button:first-child{display:none}}
@media(max-width:899px){body.map-page .pm-quick [data-pm-kind]{flex:0 0 calc(25% - 6px);justify-content:center;padding:0 3px;font-size:12px}body.map-page .pm-quick [data-pm-kind] svg{display:none}body.map-page .rn-location b{font-size:14px}body.map-page .pm-map-view{height:calc(100dvh - var(--pm-top,72px));min-height:610px}body.map-page .pm-map-view .rn-intro{display:none}body.map-page .pm-map-view .pm-quick [data-pm-kind]:not([aria-pressed=true]){display:none}body.map-page .pm-map-view .rn-needs-title{display:none}body.map-page .pm-map-view .pm-sheet,body.map-page .pm-map-view .pm-sheet[data-state]{height:200px}body.map-page .pm-map-view.is-route .pm-sheet,body.map-page .pm-map-view.is-route .pm-sheet[data-state]{height:280px}}
body.map-page .rn-search-area{position:absolute;z-index:660;top:calc(var(--pm-float-h,240px) + 16px);left:calc(54% + 14px);box-shadow:0 2px 8px #10252c20}body.map-page .rn-search-area[hidden]{display:none}@media(max-width:899px){body.map-page .rn-search-area{left:28px;top:calc(var(--pm-float-h,240px) + 16px)}body.map-page .pm-list-view .rn-search-area{display:none}}
@media(max-width:899px){body.map-page .pm-stage.is-route{height:calc(100dvh - var(--pm-top,72px));min-height:620px}body.map-page .pm-stage.is-route .rn-views{display:none}}
body.map-page .rn-location-help{background:#edf0e8;border:1px solid #ccd5c6;border-radius:12px;padding:12px 14px;margin-top:12px;font-size:13px;color:#1b303c}body.map-page .rn-location-help[hidden]{display:none}body.map-page .rn-location-help p{margin:0 0 8px}body.map-page .rn-location-help>div{display:flex;flex-wrap:wrap;gap:8px}body.map-page .rn-location-help button{min-height:44px;padding:0 12px;border:1px solid #c5cfc3;border-radius:22px;background:#fffdf8;font:inherit;font-weight:700;cursor:pointer}body.map-page .pm-panel #rnPanelPin{margin-top:8px}
@media(max-width:899px){body.map-page .pm-stage{padding:12px 16px}body.map-page .rn-intro{margin-bottom:10px}body.map-page .rn-intro h1{font-size:23px;margin-bottom:3px}body.map-page .rn-intro p{font-size:12px;line-height:1.4}body.map-page .rn-location{margin-top:9px;min-height:44px;padding:8px 12px}body.map-page .rn-location small{display:none}body.map-page .rn-location b{font-size:13px}body.map-page .pm-searchbar{height:46px}body.map-page .pm-quick{margin-top:9px;gap:6px 8px}body.map-page .pm-quick [data-pm-kind]{min-width:0;font-size:11.5px;white-space:normal;text-align:center;line-height:1.15}body.map-page .rn-needs-title{display:none}body.map-page .pm-quick .pm-quick-clear:not([hidden]){display:none}body.map-page .rn-views{margin-top:10px}body.map-page .pm-float{margin-bottom:12px}body.map-page .pm-sheet-head{padding-bottom:10px}body.map-page .rn-location-help{font-size:12px;padding:10px;margin-top:10px}body.map-page .rn-location-help p{margin-bottom:6px}body.map-page .rn-location-help button{padding:0 10px;font-size:12px}body.map-page .pm-map-view.is-route .pm-sheet-head{display:none}body.map-page .pm-map-view.is-route .pm-sheet-body{height:100%}body.map-page .pm-map-view.is-route .pm-route{margin-bottom:0}body.map-page .pm-map-view.is-route .pm-route-head h2{font-size:17px}}
body.map-page .pm-panel{display:flex;flex-direction:column;overflow:hidden;padding:0}body.map-page .pm-panel[hidden]{display:none}body.map-page .pm-panel-head{position:relative;top:auto;flex-shrink:0;margin:0;padding:12px 16px}body.map-page .rn-panel-body{overflow-y:auto;overscroll-behavior:contain;min-height:0;padding:0 16px 16px;flex:1}body.map-page .rn-panel-footer{position:relative;bottom:auto;flex-shrink:0;margin:0;padding:12px 16px max(12px,env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;gap:12px}body.map-page .rn-filter-group{border-bottom:1px solid #d8dbd2;margin-bottom:4px}body.map-page .rn-filter-group summary{min-height:48px;cursor:pointer;font-weight:800;display:list-item;padding:12px 4px;box-sizing:border-box}body.map-page .rn-filter-group [data-rn-count]{font-size:12px;color:#5e716b;margin-left:8px}body.map-page .rn-filter-group .pm-chips{padding-bottom:12px}body.map-page .rn-panel-note{font-size:13px;line-height:1.5;color:#5e716b}body.map-page .rn-route-preview{padding:10px 12px;background:#edf0e8;border-radius:10px;font-size:13px;line-height:1.5}
@media(max-width:899px){body.map-page .pm-map-view.is-route:not(.is-nav){min-height:0}body.map-page .pm-map-view.is-route:not(.is-nav) .pm-sheet,body.map-page .pm-map-view.is-route:not(.is-nav) .pm-sheet[data-state]{height:min(56dvh,500px,calc(100% - 160px))}body.map-page .pm-map-view.is-route:not(.is-nav) .pm-route-head{margin-bottom:8px}body.map-page .pm-map-view.is-route:not(.is-nav) .pm-route-sum{margin:8px 0}body.map-page .pm-map-view.is-route:not(.is-nav) .pm-steps{margin-top:8px}}
html:has(body.pm-app-page), body.pm-app-page {
  overflow: hidden;
  overscroll-behavior: none;
}
body.pm-app-page .pm-stage,
body.pm-app-page .pm-stage.is-route {
  height: calc(100dvh - var(--pm-top, 72px));
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
body.pm-app-page .pm-float {
  flex: 0 1 auto;
  max-height: 62%;
  overflow-y: auto;
  overscroll-behavior: contain;
}
body.pm-app-page .pm-sheet-body {
  overflow-y: auto;
  overscroll-behavior: contain;
}
body.pm-app-page .pm-item-main {
  text-decoration: none;
}
@media (min-width: 900px) {
  body.pm-app-page .pm-sheet, body.pm-app-page .pm-sheet[data-state] {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
  }
  body.pm-app-page #okMap { height: auto; }
}
@media (max-width: 899px) {
  body.pm-app-page .pm-list-view .pm-sheet,
  body.pm-app-page .pm-list-view .pm-sheet[data-state] {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
  }
}
body.pm-app-page .rn-route-origin-heading { display: none; }
body.pm-app-page .is-route-origin .rn-route-origin-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
body.pm-app-page .rn-route-origin-heading h2 {
  font: 700 19px/1.2 Georgia, serif;
  margin: 0;
}
body.pm-app-page .is-route-origin .rn-intro,
body.pm-app-page .is-route-origin .pm-tabs,
body.pm-app-page .is-route-origin .pm-searchbar,
body.pm-app-page .is-route-origin .pm-quick,
body.pm-app-page .is-route-origin .rn-views,
body.pm-app-page .is-route-origin .rn-search-area,
body.pm-app-page .is-route-origin .pm-sheet,
body.pm-app-page .is-route-origin .pm-pinbtn,
body.pm-app-page .is-route-origin .pm-locate { display: none; }
body.pm-app-page .is-route-origin #okMap { left: 16px; right: 16px; }
body.pm-app-page .rn-route-pin-hint { display: none; }
body.pm-app-page .is-route-origin.is-pinning .rn-route-pin-hint {
  display: block;
  margin: 8px 0 0;
  font-size: 14px;
}
body.pm-app-page .is-route-origin .leaflet-marker-pane .leaflet-interactive {
  pointer-events: none;
}
body.pm-app-page .rn-intro h1 { color: #573b32; }
body.pm-app-page .rn-location {
  background: #fff4df;
  border-color: #e8cf9e;
  border-radius: 16px;
}
body.pm-app-page .rn-location > span:first-child {
  background: #f5dfb3;
  border-radius: 50%;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
}
body.pm-app-page .pm-quick [data-pm-kind="drinks"]:not([aria-pressed="true"]) { background: #f4e8f3; }
body.pm-app-page .pm-quick [data-pm-kind="food"]:not([aria-pressed="true"]) { background: #fae8df; }
body.pm-app-page .pm-quick [data-pm-kind="coffee"]:not([aria-pressed="true"]) { background: #fff0d2; }
body.pm-app-page .pm-quick [data-pm-kind="do"]:not([aria-pressed="true"]) { background: #e6eee3; }
body.pm-app-page .pm-item { border-radius: 18px; }
body.pm-app-page .pm-name { color: #253b43; }
body.pm-app-page .rn-filter-group summary::marker { color: #986540; }
body.pm-app-page #okMap {
  background: #f3eee4;
  border: 1px solid #ded2bd;
  border-radius: 18px;
}
body.pm-app-page #okMap .leaflet-tile-pane {
  filter: sepia(15%) saturate(78%) contrast(96%);
}
body.pm-app-page #okMap .pm-pin:not(.pm-pin-event) span {
  border-radius: 50% 50% 50% 18%;
  transform: rotate(-45deg);
  box-shadow: 0 2px 5px #253b4355;
}
body.pm-app-page #okMap .pm-pin:not(.pm-pin-event) span::after {
  content: '';
  display: block;
  width: 5px;
  height: 5px;
  margin: 4px auto;
  border-radius: 50%;
  background: #fff;
}
body.pm-app-page #okMap .marker-cluster,
body.pm-app-page #okMap .marker-cluster div { background: #f5dfb3; }
body.pm-app-page #okMap .marker-cluster:not(:focus-visible) {
  outline: 2px solid #fffdf8;
  box-shadow: 0 2px 8px #253b4344;
}
body.pm-app-page #okMap .marker-cluster div {
  color: #573b32;
  font-weight: 800;
}
body.pm-app-page .rn-event-filters .pm-chip { display: inline-flex; }
body.pm-app-page [data-event-filter="today"]:not([aria-pressed="true"]) { background: #fff0d2; }
body.pm-app-page [data-event-filter="weekend"]:not([aria-pressed="true"]) { background: #f4e8f3; }
body.pm-app-page [data-event-filter="free"]:not([aria-pressed="true"]) { background: #e6eee3; }
@media (max-width: 899px) {
  body.pm-app-page .pm-quick [data-pm-kind="indoor"] {
    display: inline-flex;
    flex: 0 0 auto;
    padding-inline: 10px;
  }
  body.pm-app-page .pm-quick [data-pm-kind="indoor"]:not([aria-pressed="true"]) { background: #e5edf7; }
}
body.pm-app-page .rn-filter-emoji { margin-inline-end: 3px; }
body.pm-app-page .rn-outdoor-shortcuts { display: none; }
body.pm-app-page .pm-quick:has([data-pm-kind="do"][aria-pressed="true"]) .rn-outdoor-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-basis: 100%;
  order: 3;
}
body.pm-app-page .rn-outdoor-shortcuts .pm-chip {
  display: inline-flex;
  background: #e6eee3;
}
body.pm-app-page .rn-more-activities { flex-basis: 100%; }
body.pm-app-page .rn-more-activities summary {
  cursor: pointer;
  min-height: 44px;
  line-height: 44px;
  font-size: 13px;
  font-weight: 700;
}
body.pm-app-page .rn-more-activity-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
body.pm-app-page .rn-happy-copy,
body.pm-app-page .rn-happy-entry .rn-general-copy { display: none; }
body.pm-app-page .rn-happy-entry:not(.rn-events-mode) .rn-happy-copy { display: block; }
body.pm-app-page .rn-happy-entry .pm-count { font-weight: 800; }
body.pm-app-page .rn-event-copy,
body.pm-app-page .rn-events-mode .rn-place-copy { display: none; }
body.pm-app-page .rn-events-mode .rn-event-copy { display: block; }
body.pm-app-page .rn-place-options { display: contents; }
body.pm-app-page .rn-events-mode .rn-place-options { display: none; }
body.pm-app-page .rn-map-picker-heading { display: none; }
body.pm-app-page .is-map-picker .rn-map-picker-heading { display: block; }
body.pm-app-page .rn-map-picker-heading p { margin: 8px 0 0; }
body.pm-app-page .is-map-picker .pm-float > :not(.rn-map-picker-heading),
body.pm-app-page .is-map-picker .pm-sheet,
body.pm-app-page .is-map-picker .rn-search-area,
body.pm-app-page .is-map-picker .pm-pinbtn,
body.pm-app-page .is-map-picker .pm-locate { display: none; }
body.pm-app-page .is-map-picker #okMap {
  left: 0;
  right: 0;
  bottom: 0;
  height: auto;
}
body.pm-app-page .is-map-picker .leaflet-marker-pane .leaflet-interactive {
  pointer-events: none;
}
body.pm-app-page .rn-results-toolbar,
body.pm-app-page #rnEditSearch { display: none; }
body.pm-app-page .is-route .rn-search-area,
body.pm-app-page .is-route .pm-pinbtn { display: none; }
body.pm-app-page .rn-route-start { margin: 0 0 8px; }
body.pm-app-page .rn-location small { display: block; font-size: 13px; font-weight: 700; }
body.pm-app-page #rnApplyFilters,
body.pm-app-page #rnShowResults,
body.pm-app-page #rnStartRoute { min-height: 48px; font-size: 15px; }
body.pm-app-page #rnShowResults {
  background: #1b303c;
  border-color: #1b303c;
  color: #fff;
  font-weight: 800;
}
body.pm-app-page #rnShowResults,
body.pm-app-page #rnApplyFilters {
  justify-content: center;
  text-align: center;
}
body.pm-app-page .pm-float:has(.rn-open-badge:not([hidden])) #pmPlaceFilters [data-pm-open] {
  display: none;
}
body.pm-app-page #rnShowResults:hover { background: #284858; }
@media (max-width: 899px) {
  body.pm-app-page .pm-filters-btn:has(.rn-open-badge:not([hidden])) {
    flex-direction: column-reverse;
    gap: 0;
  }
  body.pm-app-page .rn-open-badge {
    background: transparent;
    height: auto;
    padding: 0;
    line-height: 1.2;
  }
  body.pm-app-page .pm-item:not(.pm-event) .pm-item-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  body.pm-app-page .pm-item:not(.pm-event) .pm-name {
    order: -1;
    margin: 12px 0 8px;
  }
  body.pm-app-page .pm-item:not(.pm-event) .rn-photo,
  body.pm-app-page .pm-item:not(.pm-event) .rn-no-photo { align-self: stretch; }
  body.pm-app-page .pm-searchbar { padding-left: 12px; gap: 2px; }
  body.pm-app-page .pm-searchbar .pm-search-icon,
  body.pm-app-page .pm-searchbar .pm-filters-btn svg { display: none; }
  body.pm-app-page .pm-searchbar .pm-search { padding: 0 2px; }
  body.pm-app-page .pm-list-view:not(.is-route):not(.is-route-origin) .rn-results-toolbar {
    display: flex;
    margin-top: 6px;
  }
  body.pm-app-page .pm-list-view:not(.rn-results-compact):not(.is-route):not(.is-route-origin) .pm-sheet,
  body.pm-app-page .pm-list-view:not(.rn-results-compact):not(.is-route):not(.is-route-origin) .rn-views {
    display: none;
  }
  body.pm-app-page .pm-list-view:not(.rn-results-compact, .is-route, .is-route-origin, .is-map-picker) .pm-float {
    max-height: 100%;
    padding-bottom: calc(72px + env(safe-area-inset-bottom));
  }
  body.pm-app-page .pm-list-view:not(.rn-results-compact, .is-route, .is-route-origin, .is-map-picker) .rn-results-toolbar {
    position: fixed;
    inset: auto 0 0;
    margin: 0;
    z-index: 1;
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
    background: #f6f3eb;
  }
  body.pm-app-page .rn-panel-footer {
    flex-direction: column;
    gap: 4px;
  }
  body.pm-app-page .rn-panel-footer .rn-clear { min-height: 32px; }
  body.pm-app-page #rnShowResults,
  body.pm-app-page #rnApplyFilters {
    width: 100%;
    min-height: 56px;
    font-size: 17px;
  }
  body.pm-app-page .pm-map-view:not(.is-route):not(.is-route-origin):not(.is-map-picker) .pm-float > :not(.rn-views):not(.pm-toast):not(.rn-location-help),
  body.pm-app-page .pm-map-view:not(.is-route):not(.is-route-origin):not(.is-map-picker) .pm-sheet {
    display: none;
  }
  body.pm-app-page .pm-map-view:not(.is-route):not(.is-route-origin):not(.is-map-picker) .rn-views {
    margin-top: 0;
  }
  body.pm-app-page .rn-results-compact.pm-list-view .pm-float {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  body.pm-app-page .rn-results-compact.pm-list-view .rn-results-toolbar {
    flex: 1;
    order: -1;
    margin: 0;
  }
  body.pm-app-page .rn-results-compact.pm-list-view .rn-views {
    width: auto;
    margin: 0;
  }
  body.pm-app-page .rn-results-compact.pm-list-view #rnMap { padding: 0 14px; }
  body.pm-app-page .rn-results-compact.pm-list-view #rnEditSearch { display: inline-flex; }
  body.pm-app-page .rn-results-compact.pm-list-view .pm-tabs,
  body.pm-app-page .rn-results-compact.pm-list-view #rnList,
  body.pm-app-page .rn-results-compact.pm-list-view #rnShowResults,
  body.pm-app-page .rn-results-compact.pm-list-view .rn-intro,
  body.pm-app-page .rn-results-compact.pm-list-view .pm-searchbar,
  body.pm-app-page .rn-results-compact.pm-list-view .pm-quick { display: none; }
  body.pm-app-page .rn-results-compact.pm-list-view .rn-location-help { flex-basis: 100%; margin-top: 0; }
}
@media (min-width: 900px) {
  body.pm-app-page .pm-stage:not(.is-route, .is-route-origin, .is-map-picker) {
    padding-block: 16px;
  }
  body.pm-app-page .pm-stage:not(.is-route, .is-route-origin, .is-map-picker) .pm-float {
    width: 51%;
    max-height: 44%;
    margin-bottom: 12px;
    padding: 1px 4px 6px 0;
    box-sizing: border-box;
    scrollbar-width: thin;
  }
  body.pm-app-page .pm-stage:not(.is-route, .is-route-origin, .is-map-picker) #okMap {
    top: 16px;
    bottom: 16px;
    box-shadow: 0 6px 18px #253b4315;
  }
  body.pm-app-page .pm-stage:not(.is-route, .is-route-origin, .is-map-picker) .pm-locate { top: 30px; }
  body.pm-app-page .pm-stage:not(.is-route, .is-route-origin, .is-map-picker) .pm-pinbtn { top: 95px; }
  body.pm-app-page .pm-stage:not(.is-route, .is-route-origin, .is-map-picker) .rn-search-area { top: 30px; }
  body.pm-app-page .rn-intro { gap: 10px; margin-bottom: 8px; }
  body.pm-app-page .rn-intro h1 { font-size: clamp(21px, 2vw, 29px); }
  body.pm-app-page .rn-location { padding: 7px 10px; text-align: left; }
  body.pm-app-page .rn-location small { font-size: 11px; }
  body.pm-app-page .pm-searchbar { margin-top: 6px; }
  body.pm-app-page .pm-search { min-width: 0; }
  body.pm-app-page .pm-quick { gap: 5px; margin-top: 8px; }
  body.pm-app-page .pm-quick .pm-chip { min-height: 36px; padding-inline: 9px; }
  body.pm-app-page .pm-quick [data-pm-kind]:not([aria-pressed="true"]):not([data-pm-kind="drinks"], [data-pm-kind="food"], [data-pm-kind="coffee"], [data-pm-kind="indoor"], [data-pm-kind="do"]),
  body.pm-app-page .rn-needs-title { display: none; }
  body.pm-app-page .pm-quick [data-pm-kind="indoor"]:not([aria-pressed="true"]) { background: #e5edf7; }
  body.pm-app-page .pm-sheet-head { padding: 0 0 8px; }
  body.pm-app-page .pm-sheet-body { scrollbar-width: thin; }
  body.pm-app-page .pm-list { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  body.pm-app-page .pm-item {
    box-shadow: 0 2px 6px #253b4310;
    border-radius: 16px;
  }
  body.pm-app-page .pm-item-main {
    display: flow-root;
    box-sizing: border-box;
    padding: 11px 12px 8px;
  }
  body.pm-app-page .pm-item .rn-photo,
  body.pm-app-page .pm-item .rn-no-photo {
    float: right;
    width: 30%;
    height: 90px;
    margin: 0 0 5px 10px;
    border-radius: 10px;
  }
  body.pm-app-page .pm-item .pm-name { display: block; }
  body.pm-app-page .pm-item .pm-acts { padding-bottom: 10px; }
}
@media (min-width: 900px) and (max-height: 680px) {
  body.pm-app-page .pm-stage:not(.is-route, .is-route-origin, .is-map-picker) .pm-float { max-height: 40%; }
}

/* Keep the search context visible and the active navigation map spacious. */
body.pm-app-page .rn-location-note { font-size: 13px; color: #52665e; margin: 0 0 8px; }
body.pm-app-page .rn-result-filters { display: none; }
body.pm-app-page .pm-event .pm-item-main { display: flow-root; box-sizing: border-box; padding: 12px 14px 10px; }
body.pm-app-page .pm-event .pm-when, body.pm-app-page .pm-event .pm-meta { display: block; }
body.pm-app-page .rn-event-photo { float: right; width: 30%; max-width: 150px; height: 86px; margin: 0 0 5px 12px; border-radius: 11px; object-fit: cover; }
body.pm-app-page .pm-event .pm-name { display: block; overflow-wrap: anywhere; }
body.pm-app-page .pm-stage.is-nav .rn-intro,
body.pm-app-page .pm-stage.is-nav .rn-event-filters,
body.pm-app-page .pm-stage.is-nav .pm-sheet-head { display: none; }
body.pm-app-page .rn-nav-actions { display: flex; align-items: center; gap: 8px; }
body.pm-app-page .rn-nav-actions .pm-nav-voice { margin: 0; }
body.pm-app-page .rn-nav-actions #pmNavEnd { width: auto; min-height: 44px; height: auto; padding: 8px 14px; border-radius: 999px; font: 800 13px Nunito, sans-serif; }
body.pm-app-page .rn-all-steps summary { cursor: pointer; padding: 10px 4px; min-height: 44px; box-sizing: border-box; color: #28675e; font-weight: 800; }
body.pm-app-page .pm-stage.is-nav .pm-route { margin: 0; padding: 0 12px; }
@media(max-width:899px) {
  body.pm-app-page .rn-results-compact.pm-list-view .rn-result-filters:not([hidden]) { display: block; margin: 4px 0 0; color: #52665e; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  body.pm-app-page .rn-event-photo { height: 78px; max-width: 105px; }
  body.pm-app-page .pm-stage.is-nav .pm-navbar { display: grid; grid-template-columns: 34px minmax(0,1fr); gap: 6px 10px; }
  body.pm-app-page .pm-stage.is-nav .pm-nav-arrow { width: 34px; }
  body.pm-app-page .rn-nav-actions { grid-column: 2; justify-content: flex-end; }
  body.pm-app-page .pm-stage.is-nav .pm-sheet,
  body.pm-app-page .pm-stage.is-nav .pm-sheet[data-state] { height: auto; max-height: min(40dvh, 340px); padding: 6px 10px; }
  body.pm-app-page .pm-stage.is-nav .pm-sheet-body { height: auto; min-height: 0; padding: 0; }
  body.pm-app-page .pm-stage.is-nav .pm-route { background: transparent; box-shadow: none; }
}
</style>`;
module.exports={ROAM_LAYOUT_STYLE,renderRoamFilterGroups,roamOpenByDefault,roamRouteLocationMessage};

function roamDirectionsHref(path,lang='en'){
  if(!/^\/(?:fr\/)?[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(String(path)))return null;
  return (lang==='fr'?'/fr/map':'/map')+'?directions='+encodeURIComponent(path.replace(/^\/fr\//,'/'))+'#near-me';
}
// Only a visitor arriving from a Roam Now detail link sees this return action.
// The context is per tab and contains filters/scroll position, never GPS coordinates.
const ROAM_RETURN_SCRIPT=`<script>(function(){try{
 var c=JSON.parse(sessionStorage.getItem('roamReturn')||'null');
 if(!c||c.target!==location.pathname||!/^\\/(?:fr\\/)?map(?:[?#]|$)/.test(c.url))return;
 var main=document.querySelector('main');if(!main)return;
 var a=document.createElement('a');a.id='rnBackToResults';a.href=c.url;a.textContent=document.documentElement.lang==='fr'?'← Retour à vos résultats':'← Back to your results';
 a.style.cssText='display:inline-flex;align-items:center;min-height:44px;margin:10px 16px;padding:0 16px;border:1px solid #cbd3ce;border-radius:24px;color:#1b303c;background:#fffdf8;font-weight:800;text-decoration:none';main.insertBefore(a,main.firstChild);
 document.querySelectorAll('[data-roam-directions]').forEach(function(link){var u=new URL(link.href,location.href),back=new URL(c.url,location.origin);['f','q','r'].forEach(function(k){if(back.searchParams.has(k))u.searchParams.set(k,back.searchParams.get(k))});u.hash=back.hash==='#events'?'#events':'#near-me';link.href=u.pathname+u.search+u.hash});
}catch(e){}})();</script>`;
module.exports.roamDirectionsHref=roamDirectionsHref;
module.exports.ROAM_RETURN_SCRIPT=ROAM_RETURN_SCRIPT;
