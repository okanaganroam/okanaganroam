// Disabled unless CLARITY_PROJECT_ID is explicitly supplied by the host.
// Automatic cookieless replay: never grant cookie storage on a visitor's behalf.
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
    // Respect recording refusals made before the automatic mode was introduced.
    if (w.localStorage.getItem(key) === 'denied') return;
    var privacy = w.navigator || {};
    if (privacy.globalPrivacyControl === true || privacy.doNotTrack === '1' || privacy.doNotTrack === 'yes' || w.doNotTrack === '1') return;
  } catch (err) { return; }
  function start() {
    if (loaded || !allowed(w.location) || /(?:^|;\s*)roam_internal=1(?:;|$)/.test(d.cookie)) return;
    loaded = true;
    d.body.setAttribute('data-clarity-mask', 'true');
    w.clarity = w.clarity || function(){ (w.clarity.q = w.clarity.q || []).push(Array.prototype.slice.call(arguments)); };
    w.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
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
    w.addEventListener('storage',function(e){if(e.key===key && e.newValue==='denied' && loaded) w.location.reload();});
    start();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded',boot); else boot();
}
function renderSessionReplayHead(projectId) {
  if (typeof projectId !== 'string' || !/^[a-z0-9]{6,30}$/.test(projectId)) return '';
  return '<script>(' + replayClient.toString() + ')(' + JSON.stringify(projectId) + ');</script>';
}
module.exports = { renderSessionReplayHead };
