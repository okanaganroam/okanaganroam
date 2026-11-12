'use strict';
// Storefront arrival points (2026-11-06): an owner stands outside, takes a photo of the storefront, and the phone's
// location is saved with it. Roam Now can then show "Look for this" and route to that spot. This is separate from the
// listing's map pin, which is never changed here. Location is read only after the owner taps, and the photo keeps no
// hidden data. A point goes live straight away only when a signed-in owner's phone gave a good reading near the
// listing; anything else waits in the review inbox.
const crypto = require('node:crypto');

const LIMITS = { near_pin_m: 150, accuracy_m: 40, nudge_m: 50, too_far_m: 3000, min_edge: 800, max_edge: 2400, max_bytes: 3 * 1024 * 1024, max_body: 5 * 1024 * 1024 };
const KEYS = new Set(['image', 'lat', 'lng', 'device_lat', 'device_lng', 'accuracy', 'rights', 'company_website']);

// Metres between two points.
function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const validPoint = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// Live or review, with the plain reasons Dayton sees. point = the final spot; device = the phone's own reading, if any.
function decide({ point, device, accuracy, pin, signedIn }) {
  const reasons = [];
  const distance = pin ? Math.round(distanceMeters(pin, point)) : null;
  const nudged = device ? Math.round(distanceMeters(device, point)) : null;
  if (!signedIn) reasons.push('Sent from an edit link, not a login');
  if (!device) reasons.push('The phone gave no location, so the spot was picked on the map');
  else if (!Number.isFinite(accuracy) || accuracy > LIMITS.accuracy_m) reasons.push(`Rough phone reading (${Number.isFinite(accuracy) ? `about ${Math.round(accuracy)} m` : 'unknown'})`);
  if (nudged !== null && nudged > LIMITS.nudge_m) reasons.push(`Pin moved ${nudged} m from the phone’s reading`);
  if (distance === null) reasons.push('The listing has no map pin to compare with');
  else if (distance > LIMITS.near_pin_m) reasons.push(`${distance} m from the listing’s map pin`);
  return { status: reasons.length ? 'pending' : 'approved', reasons, distance, nudged };
}

const ERR = {
  en: { generic: 'Sorry, something went wrong. Please try again.', photo: 'That photo could not be read. Please take it again.', small: 'That photo is too small. Please take it again with your phone’s camera.', rights: 'Please confirm you took this photo or have permission to share it.', spot: 'We need a spot on the map. Please try again.', far: 'That spot is too far from your listing. Please stand outside your business and try again.', rate: 'Too many tries. Please wait a while and try again.', gone: 'This link is not valid any more.' },
  fr: { generic: 'Désolé, une erreur est survenue. Veuillez réessayer.', photo: 'Cette photo est illisible. Veuillez la reprendre.', small: 'Cette photo est trop petite. Veuillez la reprendre avec l’appareil photo de votre téléphone.', rights: 'Veuillez confirmer que vous avez pris cette photo ou que vous avez la permission de la partager.', spot: 'Il nous faut un endroit sur la carte. Veuillez réessayer.', far: 'Cet endroit est trop loin de votre fiche. Placez-vous devant votre commerce et réessayez.', rate: 'Trop d’essais. Veuillez patienter un moment et réessayer.', gone: 'Ce lien n’est plus valide.' },
};

// A drawn example of a good storefront photo: the whole front and the sign, seen from across the sidewalk.
const EXAMPLE = `<svg viewBox="0 0 420 240" role="img" aria-label="Drawing of a storefront seen from the sidewalk, with the whole front and sign in view" style="display:block;width:100%;height:auto;border-radius:12px"><rect width="420" height="165" fill="#bfdcec"/><rect y="165" width="420" height="38" fill="#c9c5ba"/><rect y="203" width="420" height="37" fill="#6d7075"/><rect x="62" y="48" width="296" height="117" fill="#8a5a3c"/><rect x="62" y="48" width="296" height="34" fill="#1b303c"/><text x="210" y="71" text-anchor="middle" font-family="Georgia,serif" font-size="19" font-weight="700" fill="#fffdf8">YOUR BUSINESS</text><path d="M62 82h296l14 18H48z" fill="#d9962b"/><rect x="84" y="106" width="86" height="59" fill="#d9ecf4"/><rect x="250" y="106" width="86" height="59" fill="#d9ecf4"/><rect x="186" y="104" width="48" height="61" fill="#3f2a1e"/><circle cx="226" cy="136" r="2.5" fill="#f4cf8c"/><rect x="20" y="118" width="7" height="48" fill="#6b4a33"/><circle cx="24" cy="104" r="22" fill="#4f8f5f"/><rect x="393" y="118" width="7" height="48" fill="#6b4a33"/><circle cx="396" cy="104" r="22" fill="#4f8f5f"/><rect y="218" width="60" height="4" fill="#e9e6dd"/><rect x="120" y="218" width="60" height="4" fill="#e9e6dd"/><rect x="240" y="218" width="60" height="4" fill="#e9e6dd"/><rect x="360" y="218" width="60" height="4" fill="#e9e6dd"/></svg>`;

const CLIENT = `(function(){
  var box=document.getElementById('arrivalBox');if(!box)return;var T=JSON.parse(box.getAttribute('data-t')),pin=JSON.parse(box.getAttribute('data-pin')||'null');
  var file=document.getElementById('arFile'),step=document.getElementById('arStep2'),img=document.getElementById('arPreview'),msg=document.getElementById('arGps'),send=document.getElementById('arSend'),err=document.getElementById('arError'),rights=document.getElementById('arRights'),done=document.getElementById('arDone'),mapEl=document.getElementById('arMap');
  var best=null,watch=null,photo=null,map=null,marker=null,spot=null,noLoc=false;
  function say(t){msg.textContent=t;}
  function stop(){if(watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watch);watch=null;}
  function gps(){if(!navigator.geolocation){noLoc=true;return;}if(watch!==null||noLoc)return;watch=navigator.geolocation.watchPosition(function(p){var c=p.coords;if(!best||c.accuracy<best.accuracy){best={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy};show();}},function(){if(!best){stop();noLoc=true;say(T.noGps);show();}},{enableHighAccuracy:true,maximumAge:0,timeout:20000});}
  function leaflet(cb){var base='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/',go=function(){L.Icon.Default.imagePath=base+'images/';cb();};if(window.L)return go();var l=document.createElement('link'),s=document.createElement('script');l.rel='stylesheet';l.href=base+'leaflet.min.css';s.src=base+'leaflet.min.js';s.onload=go;s.onerror=function(){mapEl.hidden=true;};var add=function(){document.head.appendChild(s);};l.onload=add;l.onerror=add;document.head.appendChild(l);}
  function show(){if(!photo)return;var at=best||pin;if(best)say(best.accuracy<=40?T.good.replace('{m}',Math.round(best.accuracy)):T.rough.replace('{m}',Math.round(best.accuracy)));if(!at)return;spot=spot&&marker?spot:{lat:at.lat,lng:at.lng};leaflet(function(){if(!map){mapEl.hidden=false;map=L.map(mapEl,{zoomControl:true}).setView([at.lat,at.lng],19);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'origin',attribution:'&copy; OpenStreetMap contributors'}).addTo(map);marker=L.marker([at.lat,at.lng],{draggable:true,autoPan:true}).addTo(map);marker.on('dragend',function(){var m=marker.getLatLng();spot={lat:m.lat,lng:m.lng,moved:true};});}else if(!spot.moved){marker.setLatLng([at.lat,at.lng]);map.setView([at.lat,at.lng]);}});}
  function shrink(f,cb){var u=URL.createObjectURL(f),i=new Image();i.onload=function(){var k=Math.min(1,1600/Math.max(i.naturalWidth,i.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(i.naturalWidth*k);c.height=Math.round(i.naturalHeight*k);c.getContext('2d').drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(u);cb(c.toDataURL('image/jpeg',0.85));};i.onerror=function(){URL.revokeObjectURL(u);cb(null);};i.src=u;}
  document.getElementById('arTake').addEventListener('click',gps);
  file.addEventListener('change',function(){var f=file.files&&file.files[0];if(!f)return;err.hidden=true;gps();say(noLoc&&!best?T.noGps:T.finding);shrink(f,function(d){if(!d){err.textContent=T.bad;err.hidden=false;return;}photo=d;img.src=d;step.hidden=false;show();setTimeout(stop,15000);step.scrollIntoView({block:'start'});});});
  send.addEventListener('click',function(){err.hidden=true;if(!rights.checked){err.textContent=T.needRights;err.hidden=false;return;}if(!spot){err.textContent=T.needSpot;err.hidden=false;return;}stop();send.disabled=true;send.textContent=T.sending;
    var body={image:photo,lat:spot.lat,lng:spot.lng,rights:true};if(best){body.device_lat=best.lat;body.device_lng=best.lng;body.accuracy=best.accuracy;}
    fetch(location.pathname+'/arrival',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){return {ok:r.ok,j:j};});}).then(function(x){if(x.ok&&x.j.ok){step.hidden=true;document.getElementById('arStart').hidden=true;done.textContent=x.j.live?T.live:T.review;done.hidden=false;return;}send.disabled=false;send.textContent=T.send;err.textContent=x.j.error||T.bad;err.hidden=false;}).catch(function(){send.disabled=false;send.textContent=T.send;err.textContent=T.bad;err.hidden=false;});});
})();`;

// deps: db, write(buf) -> file name, remove(file), strip, dimensions, respond, sameOrigin, readJson, rateLimited, clientIp
function createArrivalPoints(deps) {
  const { db } = deps;
  const latest = (venueId, status) => db.prepare('SELECT * FROM venue_arrival_points WHERE venue_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(venueId, status) || null;
  function retire(venueId, keepId) {
    for (const r of db.prepare("SELECT id, file FROM venue_arrival_points WHERE venue_id = ? AND id != ? AND status IN ('pending', 'approved')").all(venueId, keepId)) {
      db.prepare("UPDATE venue_arrival_points SET status = 'replaced', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").run(r.id);
      deps.remove(r.file);
    }
  }

  async function submit(req, res, token, lang = 'en') {
    const E = ERR[lang === 'fr' ? 'fr' : 'en'];
    if (!deps.sameOrigin(req)) return deps.respond(res, 403, { ok: false, error: E.generic });
    const ip = deps.clientIp(req);
    if (deps.rateLimited(ip)) return deps.respond(res, 429, { ok: false, error: E.rate });
    const signedIn = typeof token === 'function';
    const found = signedIn ? token() : deps.venueForToken(token);
    if (!found) return deps.respond(res, 404, { ok: false, error: E.gone });
    let body;
    try { body = await deps.readJson(req, LIMITS.max_body); } catch (e) { return deps.respond(res, e.status === 413 ? 413 : 400, { ok: false, error: E.photo }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !KEYS.has(k))) return deps.respond(res, 400, { ok: false, error: E.generic });
    if (typeof body.company_website === 'string' && body.company_website.trim()) return deps.respond(res, 201, { ok: true });
    if (body.rights !== true) return deps.respond(res, 400, { ok: false, error: E.rights });
    const point = { lat: Number(body.lat), lng: Number(body.lng) };
    if (!validPoint(point.lat, point.lng)) return deps.respond(res, 400, { ok: false, error: E.spot });
    const dLat = Number(body.device_lat); const dLng = Number(body.device_lng);
    const device = body.device_lat != null && validPoint(dLat, dLng) ? { lat: dLat, lng: dLng } : null;
    const accuracy = device ? Number(body.accuracy) : NaN;
    const m = typeof body.image === 'string' ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
    const raw = m ? Buffer.from(m[1], 'base64') : null;
    const dims = raw ? deps.dimensions(raw) : null;
    if (!raw || !dims || raw.length > LIMITS.max_bytes) return deps.respond(res, 400, { ok: false, error: E.photo });
    const edge = Math.max(dims.width, dims.height);
    if (edge < LIMITS.min_edge) return deps.respond(res, 400, { ok: false, error: E.small });
    if (edge > LIMITS.max_edge) return deps.respond(res, 400, { ok: false, error: E.photo });
    const { venue } = found;
    const pin = venue.latitude != null && validPoint(Number(venue.latitude), Number(venue.longitude)) ? { lat: Number(venue.latitude), lng: Number(venue.longitude) } : null;
    const d = decide({ point, device, accuracy, pin, signedIn });
    if (d.distance !== null && d.distance > LIMITS.too_far_m) return deps.respond(res, 400, { ok: false, error: E.far });
    let file;
    try { file = deps.write(deps.strip(raw) || raw); } catch (e) { return deps.respond(res, 500, { ok: false, error: E.generic }); }
    const key = crypto.randomBytes(18).toString('base64url');
    const id = Number(db.prepare(`INSERT INTO venue_arrival_points (venue_id, file, preview_key, lat, lng, device_lat, device_lng, accuracy_m, distance_m, status, review_reasons, submitted_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(venue.id, file, key, point.lat, point.lng, device ? device.lat : null, device ? device.lng : null, Number.isFinite(accuracy) ? accuracy : null, d.distance, d.status, d.reasons.join('; ') || null, signedIn && found.account ? found.account.email : null).lastInsertRowid);
    if (d.status === 'approved') { db.prepare("UPDATE venue_arrival_points SET reviewed_at = CURRENT_TIMESTAMP, reviewed_by = 'automatic' WHERE id = ?").run(id); retire(venue.id, id); } else {
      for (const r of db.prepare("SELECT id, file FROM venue_arrival_points WHERE venue_id = ? AND id != ? AND status = 'pending'").all(venue.id, id)) { db.prepare("UPDATE venue_arrival_points SET status = 'replaced' WHERE id = ?").run(r.id); deps.remove(r.file); }
    }
    return deps.respond(res, 201, { ok: true, id, live: d.status === 'approved' });
  }

  // The portal section. L(en, fr) is the page's own language helper. Portal pages send no referrer, and the map tiles refuse
  // requests without one (a blocked image instead of a map), so the tiles ask for the site's name to be sent.
  function sectionHtml(venue, L, esc, siteName) {
    // Winery test 1 (2026-11-12): a winery has a tasting room door, not a storefront (the same words, swapped).
    if (venue && venue.type === 'winery') {
      const L0 = L;
      const en = (x) => String(x).replace(/storefront spot/g, 'tasting room door').replace(/storefront/g, 'tasting room door');
      const fr = (x) => String(x).replace(/ma devanture/g, 'la porte de ma salle de dégustation').replace(/l’emplacement de votre devanture/g, 'la porte de votre salle de dégustation').replace(/votre devanture/g, 'la porte de votre salle de dégustation').replace(/la devanture/g, 'la porte de la salle de dégustation');
      L = (e, f) => L0(en(e), fr(f));
    }
    const live = latest(venue.id, 'approved'); const waiting = latest(venue.id, 'pending');
    const now = waiting || live;
    const T = { noGps: L('We couldn’t get your location. Drag the pin to your storefront, and we’ll check it.', 'Impossible d’obtenir votre position. Glissez l’épingle sur votre devanture, et nous la vérifierons.'), finding: L('Finding your location…', 'Recherche de votre position…'), good: L('Location saved, accurate to about {m} m. Drag the pin if it’s a little off.', 'Position enregistrée, précise à environ {m} m. Glissez l’épingle si elle est un peu décalée.'), rough: L('Your location is only accurate to about {m} m. Drag the pin to the right spot, and we’ll check it.', 'Votre position est précise à environ {m} m seulement. Glissez l’épingle au bon endroit, et nous la vérifierons.'), bad: L('That didn’t work. Please try again.', 'Cela n’a pas fonctionné. Veuillez réessayer.'), needRights: L('Please tick the box to confirm you can share this photo.', 'Veuillez cocher la case pour confirmer que vous pouvez partager cette photo.'), needSpot: L('Please wait for the map, or drag the pin to your storefront.', 'Veuillez attendre la carte, ou glisser l’épingle sur votre devanture.'), sending: L('Sending…', 'Envoi…'), send: L('Save my storefront', 'Enregistrer ma devanture'), live: L('Saved! Thank you. Your storefront spot is in.', 'Enregistré! Merci. L’emplacement de votre devanture est ajouté.'), review: L('Thanks! We’ll check it and add it soon.', 'Merci! Nous allons le vérifier et l’ajouter bientôt.') };
    const pin = venue.latitude != null ? { lat: Number(venue.latitude), lng: Number(venue.longitude) } : null;
    return `<details class="op-fold op-sec" id="arrival" data-task="arrival" open>
    <summary><h2 class="lyv-section-label">${L('Help people find your door', 'Aidez les gens à trouver votre porte')}</h2></summary>
    <div id="arrivalBox" data-t="${esc(JSON.stringify(T))}" data-pin="${esc(JSON.stringify(pin))}">
    <p class="op-hint">${L(`Show visitors exactly what to look for. Stand on the sidewalk or street, facing your storefront, the way someone arriving would see it. Do this on your phone, while you’re there.`, `Montrez aux visiteurs exactement quoi chercher. Placez-vous sur le trottoir ou dans la rue, face à votre devanture, comme quelqu’un qui arrive. Faites-le avec votre téléphone, sur place.`)}</p>
    ${now ? `<figure style="margin:0 0 12px"><img src="/owner-photos/arrival/${esc(now.preview_key)}.jpg" alt="${L('Your storefront photo', 'La photo de votre devanture')}" style="width:100%;max-width:420px;border-radius:12px;display:block"><figcaption class="op-hint">${waiting ? L('Waiting for us to check it.', 'En attente de notre vérification.') : L('This is your storefront spot. Take a new one any time to replace it.', 'Voici l’emplacement de votre devanture. Prenez-en une nouvelle à tout moment pour la remplacer.')}</figcaption></figure>` : ''}
    <figure style="margin:0 0 14px;max-width:420px">${EXAMPLE}<figcaption class="op-hint" style="margin-top:6px"><strong>${L('Example:', 'Exemple :')}</strong> ${L('Stand back far enough to fit the whole front of your business and your sign in the photo.', 'Reculez assez pour que toute la façade de votre commerce et votre enseigne soient sur la photo.')}</figcaption></figure>
    <p role="note" style="margin:0 0 14px;padding:12px 14px;background:#fff3d6;color:#1b303c;border-left:5px solid #d9962b;border-radius:10px;font-size:1rem;line-height:1.45">${L('Your phone will ask to share your location. <strong>Here’s why:</strong> people using Roam Now get directions right to the spot where you’re standing, so they arrive seeing the same view as your photo. We only read it when you take the photo, and we never track you.', 'Votre téléphone demandera de partager votre position. <strong>Voici pourquoi :</strong> les gens qui utilisent Roam Now reçoivent un itinéraire jusqu’à l’endroit où vous vous trouvez, et arrivent donc avec la même vue que sur votre photo. Nous ne la lisons qu’au moment de la photo, et nous ne vous suivons jamais.')}</p>
    <div id="arStart"><label class="venue-form-submit" id="arTake" style="display:inline-block;cursor:pointer;text-align:center">${L('Take the storefront photo', 'Prendre la photo de la devanture')}<input type="file" id="arFile" accept="image/*" capture="environment" style="position:absolute;width:1px;height:1px;opacity:0"></label></div>
    <div id="arStep2" hidden>
      <img id="arPreview" alt="" style="width:100%;max-width:420px;border-radius:12px;display:block;margin-bottom:10px">
      <p class="op-hint" id="arGps" role="status"></p>
      <div id="arMap" hidden style="height:260px;border-radius:12px;margin-bottom:10px"></div>
      <label class="op-closed" style="width:auto;align-items:flex-start"><input type="checkbox" id="arRights" style="margin-top:4px"> <span>${L(`I took this photo or have permission to share it, and ${esc(siteName)} may show it to help visitors find this business.`, `J’ai pris cette photo ou j’ai la permission de la partager, et ${esc(siteName)} peut l’afficher pour aider les visiteurs à trouver ce commerce.`)}</span></label>
      <button type="button" class="venue-form-submit" id="arSend">${T.send}</button>
    </div>
    <p class="lyv-error" id="arError" hidden></p><p class="op-hint" id="arDone" role="status" hidden style="font-weight:700"></p>
    </div>
    <script>${CLIENT}</script>
    </details>`;
  }

  const pending = () => db.prepare(`SELECT a.*, v.name AS venue_name, v.latitude AS pin_lat, v.longitude AS pin_lng FROM venue_arrival_points a JOIN venues v ON v.id = a.venue_id WHERE a.status = 'pending' ORDER BY a.id`).all();

  function cardHtml(a, esc, actions) {
    return `<article class="rv-card" data-kind="arrival" data-id="${a.id}">
      <h3>${esc(a.venue_name)}</h3>
      <p class="rv-meta">Storefront spot #${a.id}${a.distance_m != null ? ` · ${a.distance_m} m from the map pin` : ''}${a.accuracy_m != null ? ` · phone accurate to about ${Math.round(a.accuracy_m)} m` : ''}</p>
      ${a.review_reasons ? `<p class="rv-meta">Why it’s here: ${esc(a.review_reasons)}</p>` : ''}
      <p><img src="/owner-photos/arrival/${esc(a.preview_key)}.jpg" alt="" loading="lazy" style="max-width:320px;width:100%;border-radius:10px"></p>
      <p><a class="rv-btn" href="https://www.google.com/maps?q=${a.lat},${a.lng}" target="_blank" rel="noopener">See this spot on a map</a></p>
      ${actions}
    </article>`;
  }

  function action(id, act, body, reviewer) {
    const row = db.prepare('SELECT * FROM venue_arrival_points WHERE id = ?').get(id);
    if (!row) return { status: 404, body: { error: 'That storefront spot was not found.' } };
    if (row.status !== 'pending') return { status: 409, body: { error: 'This was already dealt with.' } };
    if (act === 'approve') {
      db.prepare("UPDATE venue_arrival_points SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?").run(reviewer, id);
      retire(row.venue_id, id);
      return { status: 200, body: { ok: true, emailed: 'not_told' } };
    }
    if (act === 'reject') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      db.prepare("UPDATE venue_arrival_points SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, rejection_reason = ? WHERE id = ?").run(reviewer, reason || null, id);
      deps.remove(row.file);
      return { status: 200, body: { ok: true, emailed: 'not_told' } };
    }
    return { status: 400, body: { error: 'Unknown action.' } };
  }

  // Live spots for Roam Now: venue id -> [lat, lng, photo address].
  const forMap = () => new Map(db.prepare("SELECT venue_id, lat, lng, file FROM venue_arrival_points WHERE status = 'approved'").all().map((r) => [r.venue_id, [Math.round(r.lat * 1e6) / 1e6, Math.round(r.lng * 1e6) / 1e6, `/images/arrival/${r.file}`]]));
  const version = () => { const r = db.prepare("SELECT COUNT(*) AS n, MAX(id) AS i FROM venue_arrival_points WHERE status = 'approved'").get(); return `${r.n}.${r.i}`; };
  const isLive = (file) => !!db.prepare("SELECT 1 FROM venue_arrival_points WHERE file = ? AND status = 'approved'").get(file);
  const previewFile = (key) => { const r = db.prepare("SELECT file FROM venue_arrival_points WHERE preview_key = ? AND status IN ('pending', 'approved')").get(key); return r ? r.file : null; };
  return { submit, sectionHtml, pending, cardHtml, action, previewFile, latest, forMap, version, isLive };
}

module.exports = { LIMITS, distanceMeters, decide, createArrivalPoints };
