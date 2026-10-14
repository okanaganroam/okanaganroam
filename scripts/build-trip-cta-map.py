# Builds data/trip-cta-map.svg (the Build My Trip band map) from OpenStreetMap lake and river outlines.
# Run from a folder holding lakes.json / river.json (Overpass "out geom" results for the Okanagan lakes and the
# Okanagan River; see the 2026-10-13 PR) : python3 scripts/build-trip-cta-map.py data/trip-cta-map.svg
# Map data (c) OpenStreetMap contributors, ODbL.
import json, math, sys
d = json.load(open('lakes.json')); rv = json.load(open('river.json'))
LAT0 = 49.7
def P(lat, lon):  # km, x east, y south
    return ((lon + 119.5) * 111.32 * math.cos(math.radians(LAT0)), (50.4 - lat) * 110.57)
def stitch(ways):
    ways = [list(w) for w in ways if len(w) > 1]; rings = []
    while ways:
        ring = ways.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]: ring += w[1:]
                elif w[-1] == ring[-1]: ring += w[::-1][1:]
                elif w[-1] == ring[0]: ring = w[:-1] + ring
                elif w[0] == ring[0]: ring = w[::-1][:-1] + ring
                else: continue
                ways.pop(i); changed = True; break
        rings.append(ring)
    return rings
def dp(pts, eps):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]; dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1e-9
    i, dm = 0, 0
    for k in range(1, len(pts) - 1):
        x, y = pts[k]; dd = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
        if dd > dm: i, dm = k, dd
    if dm > eps: return dp(pts[:i + 1], eps)[:-1] + dp(pts[i:], eps)
    return [pts[0], pts[-1]]
polys = []  # (name, ring(km))
for e in d['elements']:
    if e['type'] == 'way':
        g = [(p['lat'], p['lon']) for p in e['geometry']]
        if g[0] == g[-1]: polys.append((e['tags']['name'], g))
    else:
        outers = [[(p['lat'], p['lon']) for p in m['geometry']] for m in e['members'] if m.get('role') == 'outer' and 'geometry' in m]
        for r in stitch(outers): polys.append((e['tags']['name'], r))
EPS = 0.12
paths = []
for name, ring in polys:
    full = [P(a, b) for a, b in ring]
    h = len(full) // 2
    pts = dp(full[:h + 1], EPS)[:-1] + dp(full[h:], EPS)
    if len(pts) < 4: continue
    paths.append('M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts) + ' Z')
rivers = []
for e in rv['elements']:
    pts = dp([P(p['lat'], p['lon']) for p in e['geometry']], EPS)
    rivers.append('M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts))
towns = [  # name, lat, lon, side (l/r), size
  ('Vernon', 50.2670, -119.2720, 'r', 1), ('Coldstream', 50.2160, -119.2470, 'r', 0), ('Lake Country', 50.0570, -119.4140, 'r', 1),
  ('Kelowna', 49.8880, -119.4960, 'r', 1), ('West Kelowna', 49.8622, -119.5833, 'l', 1), ('Peachland', 49.7719, -119.7386, 'l', 1),
  ('Summerland', 49.6011, -119.6773, 'l', 1), ('Naramata', 49.5978, -119.5850, 'r', 1), ('Penticton', 49.4991, -119.5937, 'r', 1),
  ('Kaleden', 49.3940, -119.6010, 'l', 0), ('Okanagan Falls', 49.3512, -119.5568, 'r', 1), ('Oliver', 49.1822, -119.5502, 'r', 1),
  ('Osoyoos', 49.0328, -119.4692, 'r', 1),
]
xs = [x for p in paths for x in [float(t.split()[0].lstrip('ML')) for t in p.replace(' Z','').split(' L')]]
ys = [y for p in paths for y in [float(t.split()[1]) for t in p.replace(' Z','').split(' L')]]
tx = [P(t[1], t[2]) for t in towns]
minx, maxx = min(xs + [x for x, _ in tx]) - 42, max(xs + [x for x, _ in tx]) + 52
miny, maxy = min(ys + [y for _, y in tx]) - 6, max(ys + [y for _, y in tx]) + 6
W, H = maxx - minx, maxy - miny
out = [f'<svg class="trip-cta-map-svg" viewBox="{minx:.1f} {miny:.1f} {W:.1f} {H:.1f}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">',
  '<defs><filter id="tcmBlur" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>',
  f'<g filter="url(#tcmBlur)" opacity="0.55"><g fill="#9DB39A" stroke="#9DB39A" stroke-width="12" stroke-linejoin="round" stroke-linecap="round">' + ''.join(f'<path d="{p}"/>' for p in paths) + ''.join(f'<path d="{r}" fill="none"/>' for r in rivers) + '</g></g>',
  '<g fill="none" stroke="#6FA9B8" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">' + ''.join(f'<path d="{r}"/>' for r in rivers) + '</g>',
  '<g fill="#8CC3CF" stroke="#5E9AAA" stroke-width="0.35" stroke-linejoin="round">' + ''.join(f'<path d="{p}"/>' for p in paths) + '</g>',
  '<g class="trip-cta-map-towns" font-family="Nunito, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-weight="800" fill="#1E2B3A">']
for (name, lat, lon, side, big), (x, y) in zip(towns, tx):
    fs = 7.2 if big else 5.8
    dx = 3.8 if side == 'r' else -3.8
    anchor = 'start' if side == 'r' else 'end'
    out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{1.9 if big else 1.5}" fill="#FFFFFF" stroke="#1E2B3A" stroke-width="0.8"/>')
    out.append(f'<text x="{x+dx:.2f}" y="{y+fs*0.36:.2f}" font-size="{fs}" text-anchor="{anchor}" paint-order="stroke" stroke="#F1ECDF" stroke-width="1.8" stroke-linejoin="round">{name}</text>')
out.append('</g>')
out.append(f'<text x="{maxx-2:.1f}" y="{maxy-2:.1f}" font-family="Nunito, sans-serif" font-size="3.6" fill="#6B6156" text-anchor="end">© OpenStreetMap contributors</text>')
out.append('</svg>')
svg = '\n'.join(out)
open(sys.argv[1], 'w').write(svg)
print(len(svg), 'bytes', f'{W:.0f}x{H:.0f}km', len(paths), 'lake rings')
