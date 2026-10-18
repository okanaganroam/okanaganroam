// Disabled unless CLARITY_PROJECT_ID is explicitly supplied by the host.
// Do not load Clarity's cookieless mode before a visitor opts in.
function replayClient(projectId) {
  var w = window, d = document, key = 'roam_replay_v1', loaded = false;
  function allowed(u) {
    var p = u.pathname.replace(/^\/fr(?=\/|$)/, '') || '/';
    return u.protocol === 'https:' && u.hostname === 'okanaganroam.com' && !u.search && !u.hash &&
      (p === '/' || /^\/(?:outdoors|food-drink|wineries|indoor|tours|sports|golf|beaches|things-to-do|whats-on|hidden-gems|browse)(?:\/[-a-z0-9]+)*\/?$/.test(p) ||
       /^\/(?:kelowna|west-kelowna|lake-country|peachland|summerland|penticton|naramata|oliver|osoyoos|vernon|armstrong|enderby|coldstream|lumby|kaleden|okanagan-falls|apex|big-white|silverstar|baldy)\/(?:outdoors|restaurants|cafes|wineries|breweries|distilleries|cocktail-lounges|pubs|indoor|beaches|parks|golf|tours|sports)(?:\/[-a-z0-9]+)*\/?$/.test(p));
  }
  try {
    if (!allowed(w.location) || /(?:^|;\s*)roam_internal=1(?:;|$)/.test(d.cookie)) return;
    // A full referrer URL can contain a private search or token. Fail closed.
    if (d.referrer) { var ref = new URL(d.referrer); if (ref.search || ref.hash) return; }
    var choice = w.localStorage.getItem(key);
    // Check writes as well as reads before offering consent.
    w.localStorage.setItem(key, choice || 'unset');
  } catch (err) { return; }
  var fr = /^\/fr(?:\/|$)/.test(w.location.pathname);
  function start() {
    if (loaded || !allowed(w.location) || /(?:^|;\s*)roam_internal=1(?:;|$)/.test(d.cookie)) return;
    loaded = true;
    d.body.setAttribute('data-clarity-mask', 'true');
    w.clarity = w.clarity || function(){ (w.clarity.q = w.clarity.q || []).push(Array.prototype.slice.call(arguments)); };
    w.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.clarity.ms/tag/' + projectId;
    d.head.appendChild(s);
  }
  function navigateAway(next) {
    var sameDocument = next.hostname === w.location.hostname && next.pathname === w.location.pathname && next.search === w.location.search;
    w.location.assign(next.href);
    // Fragment-only navigation does not unload the recorder on its own.
    if (sameDocument) w.location.reload();
  }
  function boot() {
    // Install before the vendor so private SPA destinations trigger a full
    // navigation before their URL or rendered contents enter this document.
    ['pushState', 'replaceState'].forEach(function(name){
      var original = w.history[name];
      w.history[name] = function(state, unused, destination){
        if (loaded && destination != null) {
          var next = new URL(destination, w.location.href);
          if (!allowed(next)) { navigateAway(next); return; }
        }
        return original.apply(this, arguments);
      };
    });
    d.addEventListener('click', function(e){
      if (!loaded || !e.target.closest || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest('a[href]');
      if (!a || (a.target && a.target.toLowerCase() !== '_self') || (a.hasAttribute && a.hasAttribute('download'))) return;
      var next;
      try { next = new URL(a.href, w.location.href); } catch (err) { return; }
      if (next.hostname === w.location.hostname && !allowed(next)) {
        e.preventDefault(); e.stopImmediatePropagation(); navigateAway(next);
      }
    }, true);
    var panel = d.createElement('section');
    panel.setAttribute('aria-label', fr ? 'Enregistrements de session' : 'Session recordings');
    panel.setAttribute('data-clarity-mask', 'true');
    panel.style.cssText = 'position:fixed;bottom:56px;left:16px;right:16px;max-width:560px;z-index:2147483646;background:#f5f3ed;color:#1b2b3a;border:1px solid #1b2b3a;border-radius:12px;padding:18px;box-shadow:0 8px 30px #0003;font:16px/1.5 system-ui;';
    var text = d.createElement('p');
    text.textContent = fr ? 'Autoriser les enregistrements de session masqués de Microsoft Clarity pour améliorer le site? Le texte et les champs sont masqués. Votre choix est facultatif et modifiable.' : 'Allow Microsoft Clarity to record masked visits to help improve the site? Text and form fields are hidden. This is optional, and you can change your choice.';
    panel.appendChild(text);
    var link = d.createElement('a'); link.href = fr ? '/fr/privacy' : '/privacy'; link.textContent = fr ? 'Confidentialité' : 'Privacy details'; panel.appendChild(link);
    var preferences = d.createElement('button'); preferences.type = 'button';
    preferences.textContent = fr ? 'Préférences d’enregistrement' : 'Recording preferences';
    preferences.style.cssText = 'position:fixed;bottom:10px;left:16px;z-index:2147483646;background:#f5f3ed;color:#1b2b3a;border:1px solid #1b2b3a;border-radius:8px;padding:10px;font:14px system-ui;cursor:pointer;';
    preferences.addEventListener('click',function(){panel.hidden=false;});
    function decide(value) {
      try { w.localStorage.setItem(key, value); } catch(err) { return; }
      choice = value; panel.hidden = true;
      if (value === 'granted') start();
      else if (loaded) {
        w.clarity('consentv2', {ad_Storage:'denied',analytics_Storage:'denied'});
        // Denial alone leaves cookieless collection active. Unload the page.
        w.location.reload();
      }
    }
    [['granted',fr ? 'Autoriser' : 'Allow recordings'],['denied',fr ? 'Refuser' : 'Decline']].forEach(function(item){
      var b=d.createElement('button');b.type='button';b.textContent=item[1];
      b.style.cssText='margin:12px 8px 0 0;padding:10px 16px;background:#fff;color:#1b2b3a;border:1px solid #1b2b3a;border-radius:8px;font:inherit;cursor:pointer;';
      b.addEventListener('click',function(){decide(item[0]);});panel.appendChild(b);
    });
    d.body.appendChild(panel);d.body.appendChild(preferences);
    panel.hidden = choice === 'granted' || choice === 'denied';
    if (choice === 'granted') start();
    w.addEventListener('storage',function(e){if(e.key===key && e.newValue!=='granted' && loaded) w.location.reload();});
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded',boot); else boot();
}
function renderSessionReplayHead(projectId) {
  if (typeof projectId !== 'string' || !/^[a-z0-9]{6,30}$/.test(projectId)) return '';
  return '<script>(' + replayClient.toString() + ')(' + JSON.stringify(projectId) + ');</script>';
}
module.exports = { renderSessionReplayHead };
