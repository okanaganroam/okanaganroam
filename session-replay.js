// Disabled unless CLARITY_PROJECT_ID is explicitly supplied by the host.
// Automatic cookieless replay: never grant cookie storage on a visitor's behalf.
function replayClient(projectId) {
  var w = window, d = document, key = 'roam_replay_v1', loaded = false, halted = false;
  // Fix (2026-10-19): the loader runs once per page, even if its tag is included twice.
  try { if (w.__roamReplayInit) return; w.__roamReplayInit = true; } catch (err) { return; }
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
    if (loaded || halted || !allowed(w.location) || /(?:^|;\s*)roam_internal=1(?:;|$)/.test(d.cookie)) return;
    loaded = true;
    d.body.setAttribute('data-clarity-mask', 'true');
    w.clarity = w.clarity || function(){ (w.clarity.q = w.clarity.q || []).push(Array.prototype.slice.call(arguments)); };
    w.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.clarity.ms/tag/' + projectId;
    d.head.appendChild(s);
  }
  // Fix (2026-10-18): same-page URL changes (filter chips, sort, ?q=, #main,
  // #venueHours) used to force location.reload(), so every filter tap reloaded
  // the page. The privacy rule is unchanged -- a URL with a query or fragment is
  // never recorded -- but on the same path we now stop the recorder for the rest
  // of this page view instead of reloading. halt() runs before the URL changes
  // (history wrappers) or before Clarity's own listeners (popstate/hashchange).
  function halt() {
    if (halted) return;
    halted = true;
    if (!loaded) return;
    // A running recorder stops synchronously; a queued stub would replay a
    // later "start" from the vendor tag, so the global is replaced with a
    // locked no-op and any queued commands are dropped. Fails closed.
    try { if (typeof w.clarity === 'function') w.clarity('stop'); } catch (err) {}
    // Fix (2026-10-19): the lock is a getter with a setter that ignores writes, not a read-only value. A vendor tag
    // still downloading after an early tap (a filter chip on /browse) assigns window.clarity in strict mode, which
    // threw "Cannot assign to read only property 'clarity'"; now its write is dropped quietly and the global stays
    // the no-op. The no-op's queue (q) is locked the same way, so no queued "start" can be replayed.
    var off = function(){}, ignore = function(){};
    try { Object.defineProperty(off, 'q', { get: function(){ return undefined; }, set: ignore, configurable: false }); } catch (err) {}
    try { Object.defineProperty(w, 'clarity', { get: function(){ return off; }, set: ignore, configurable: false }); }
    catch (err) { try { w.clarity = off; } catch (e) {} }
  }
  function samePath(next) {
    return next.protocol === w.location.protocol && next.hostname === w.location.hostname && next.pathname === w.location.pathname;
  }
  function navigateAway(next) { w.location.assign(next.href); }
  function boot() {
    // Install before the vendor so private SPA destinations on another path
    // trigger a full navigation before their URL or rendered contents enter
    // this document, and same-path query/fragment changes halt the recorder
    // before the vendor's own history hooks see the new URL.
    ['pushState', 'replaceState'].forEach(function(name){
      var original = w.history[name];
      w.history[name] = function(state, unused, destination){
        if (loaded && !halted && destination != null) {
          var next = new URL(destination, w.location.href);
          if (!allowed(next)) {
            if (samePath(next)) halt();
            else { navigateAway(next); return; }
          }
        }
        return original.apply(this, arguments);
      };
    });
    // Back/forward and fragment jumps change the URL without pushState.
    ['popstate', 'hashchange'].forEach(function(type){
      w.addEventListener(type, function(){ if (loaded && !allowed(w.location)) halt(); }, true);
    });
    d.addEventListener('click', function(e){
      if (!loaded || halted || !e.target.closest || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest('a[href]');
      if (!a || (a.target && a.target.toLowerCase() !== '_self') || (a.hasAttribute && a.hasAttribute('download'))) return;
      var next;
      try { next = new URL(a.href, w.location.href); } catch (err) { return; }
      if (next.hostname === w.location.hostname && !allowed(next)) {
        // Same-path links (#main, #venueHours, ?filter=) stay with the browser
        // and page scripts; stop recording first so the new URL is never seen.
        if (samePath(next)) { halt(); return; }
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
