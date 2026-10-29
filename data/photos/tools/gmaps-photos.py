#!/usr/bin/env python3
"""Print Google Maps photo URLs for one place, without signing in.

Usage:
  python3 data/photos/tools/gmaps-photos.py "Araxi Restaurant" "4222 Village Square, Whistler"
  python3 data/photos/tools/gmaps-photos.py --details "Name" "Address"
  python3 data/photos/tools/gmaps-photos.py --preview /tmp/araxi.jpg "Name" "Address"
  python3 data/photos/tools/gmaps-photos.py --fid 0x54873cb355260f67:0x7bcff1f79b909083

stdout: up to --max full-size URLs (lh3 base + "=w2400"), one per line.
stderr: the place Google matched (name, address, feature id) and other results.
Exit codes: 0 photos found, 2 no place matched, 3 place found but no photos,
4 Google answered with a consent/bot page or an error.

How it works (all plain curl with a desktop Chrome user agent):
  1. GET /maps/search/<name address>?hl=en&gl=ca  -> HTML whose <link> preloads
     the search XHR (/search?tbm=map&...&pb=...).
  2. GET that XHR -> JSON list of matching places (feature id, name, address).
     Pick the result whose name/address best matches.
  3. GET /maps/place/data=!4m2!3m1!1s<feature id>?hl=en&gl=ca -> HTML whose
     <link> preloads /maps/preview/place?...
  4. GET that XHR -> the place's JSON, which holds its hero photo, the photo
     category tiles (All, Latest, By owner, Menu...) and review photos.
Only photo entries tied to this place's own JSON block are returned (profile
avatars, videos and Street View tiles are skipped).

Python 3.9 stdlib only; needs curl. ffmpeg is used only by --preview.
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128 Safari/537.36")
# Only sent if Google shows its consent interstitial (EU-style); not needed from Canada.
CONSENT_COOKIE = "CONSENT=YES+cb; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg"
BASE = "https://www.google.com"
PAUSE = 1.0  # seconds between requests to google.com
PHOTO_PATH = re.compile(r"https://lh[0-9]\.googleusercontent\.com/(grass-cs|gps-cs-s|gps-cs|gpms-cs-s|p)/")
FID = re.compile(r"^0x[0-9a-f]+:0x[0-9a-f]+$")
_last = [0.0]
_cookie = [None]


def log(*a):
    print(*a, file=sys.stderr)


def fetch(url):
    wait = PAUSE - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    cmd = ["curl", "-sL", "--compressed", "--max-time", "30", "-A", UA,
           "-H", "Accept-Language: en-CA,en;q=0.9", "-w", "\n%{url_effective}"]
    if _cookie[0]:
        cmd += ["-H", "Cookie: " + _cookie[0]]
    out = subprocess.run(cmd + [url], capture_output=True).stdout.decode("utf-8", "replace")
    _last[0] = time.time()
    body, _, final = out.rpartition("\n")
    return body, final


def is_blocked(body, final):
    return ("consent.google.com" in final or "/sorry/" in final
            or "unusual traffic" in body or 'action="https://consent.google.com' in body)


def get_page(url):
    """Fetch a Maps page; retry once with the consent cookie if Google interposes."""
    body, final = fetch(url)
    if is_blocked(body, final) and not _cookie[0]:
        log("note: consent/bot page from Google, retrying with consent cookie")
        _cookie[0] = CONSENT_COOKIE
        body, final = fetch(url)
    if is_blocked(body, final):
        log("error: Google returned a consent or 'unusual traffic' page: " + final)
        sys.exit(4)
    return body


def preload(html, prefix):
    m = re.search(r'<link[^>]*href="(' + re.escape(prefix) + r'[^"]*)"', html)
    if not m:
        return None
    return BASE + m.group(1).replace("&amp;", "&")


def load_json(body):
    body = body.strip()
    if body.startswith(")]}'"):
        body = body[4:]
    try:
        return json.loads(body)
    except ValueError:
        return None


def norm(s):
    s = (s or "").lower().replace("&", " and ").replace("+", " and ")
    return re.sub(r"[^a-z0-9 ]+", " ", s).split()


def score(name, address, r_name, r_addr):
    a = " ".join(norm(name))
    b = " ".join(norm(r_name))
    s = difflib.SequenceMatcher(None, a, b).ratio()
    if a and (a in b or b in a):
        s += 0.3
    nums = set(re.findall(r"\b\d{3,6}\b", address or ""))
    if nums and nums & set(re.findall(r"\b\d{3,6}\b", r_addr or "")):
        s += 0.4
    return s


def search(name, address, ll=None):
    q = (name + " " + address).strip()
    path = "/maps/search/" + urllib.parse.quote_plus(q)
    if ll:
        path += "/@" + ll + ",15z"
    html = get_page(BASE + path + "?hl=en&gl=ca")
    xhr = preload(html, "/search?tbm=map")
    if not xhr:
        log("error: no search XHR link in the Maps page (layout changed?)")
        sys.exit(4)
    d = load_json(fetch(xhr)[0])
    if not isinstance(d, list):
        log("error: search XHR did not return JSON")
        sys.exit(4)
    # A place block is a list with the feature id at [10], name at [11] and the
    # full address at [18]. A single exact match comes back at d[0][1][0][14];
    # several matches come back as d[64][i][1]. Walk the tree to find either.
    results, seen = [], set()

    def walk(x):
        if isinstance(x, list):
            if (len(x) > 18 and isinstance(x[10], str) and FID.match(x[10])
                    and isinstance(x[11], str)):
                if x[10] not in seen:
                    seen.add(x[10])
                    results.append({"fid": x[10], "name": x[11],
                                    "address": x[18] if isinstance(x[18], str) else ""})
                return
            for y in x:
                walk(y)
    walk(d)
    if not results:  # fallback: any feature ids in the payload
        for fid in dict.fromkeys(re.findall(r'"(0x[0-9a-f]+:0x[0-9a-f]+)"', json.dumps(d))):
            results.append({"fid": fid, "name": "?", "address": ""})
    for r in results:
        r["score"] = score(name, address, r["name"], r["address"])
    results.sort(key=lambda r: -r["score"])
    return results


def walk_entries(x, out):
    """Collect photo entries: lists whose [6] is [url, label, [w, h], ...]."""
    if isinstance(x, list):
        if (len(x) > 6 and isinstance(x[6], list) and x[6] and isinstance(x[6][0], str)
                and "googleusercontent.com" in x[6][0]):
            dims = x[6][2] if len(x[6]) > 2 and isinstance(x[6][2], list) else None
            s = json.dumps(x)
            out.append({
                "url": x[6][0],
                "dims": dims,
                "video": '"Video"' in s,
                "owner": "bizbuilder" in s,
            })
            return
        for y in x:
            walk_entries(y, out)


def place_photos(fid):
    html = get_page(BASE + "/maps/place/data=!4m2!3m1!1s" + fid + "?hl=en&gl=ca")
    xhr = preload(html, "/maps/preview/place")
    if not xhr:
        log("error: no place XHR link in the place page")
        sys.exit(4)
    d = load_json(fetch(xhr)[0])
    if not isinstance(d, list) or len(d) < 7 or not isinstance(d[6], list):
        log("error: place XHR did not return the expected JSON")
        sys.exit(4)
    p = d[6]
    info = {"name": p[11] if len(p) > 11 else "?", "address": p[18] if len(p) > 18 else ""}
    entries = []
    walk_entries(p, entries)
    seen, photos = set(), []
    for e in entries:
        if e["video"] or not PHOTO_PATH.match(e["url"]):
            continue
        base = e["url"].split("=")[0]
        if base in seen:
            continue
        seen.add(base)
        e["base"] = base
        photos.append(e)
    # owner (business) photos first, then the rest in Google's order
    photos.sort(key=lambda e: 0 if e["owner"] else 1)
    return info, photos


def preview(photos, out_path):
    """Grid of thumbnails, 5 per row, in the same order as the printed list."""
    tmp = tempfile.mkdtemp(prefix="gmaps-")
    n = 0
    for e in photos:
        raw = os.path.join(tmp, "raw.jpg")
        subprocess.run(["curl", "-sL", "-A", UA, "-o", raw, e["base"] + "=w480"])
        n += 1
        # normalise each tile first: ffmpeg's image sequence reader stops when sizes change
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-vf",
                            "scale=400:300:force_original_aspect_ratio=increase,crop=400:300,format=yuvj420p",
                            "-frames:v", "1", os.path.join(tmp, "%03d.jpg" % n)])
        if r.returncode != 0:  # keep numbering aligned with a grey tile
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                            "color=c=gray:s=400x300", "-frames:v", "1",
                            os.path.join(tmp, "%03d.jpg" % n)])
        time.sleep(0.2)
    cols = 5
    rows = (n + cols - 1) // cols
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-start_number", "1", "-i",
                    os.path.join(tmp, "%03d.jpg"), "-vf",
                    "tile=%dx%d:padding=6:color=white" % (cols, rows),
                    "-frames:v", "1", "-q:v", "4", out_path])
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    log("preview: %s (%d photos, %d per row, numbered left-to-right, top-to-bottom)" % (out_path, n, cols))


def main():
    ap = argparse.ArgumentParser(description="Google Maps photo URLs for a place")
    ap.add_argument("name", nargs="?", default="")
    ap.add_argument("address", nargs="?", default="")
    ap.add_argument("--fid", help="Google feature id (0x...:0x...), skips the search step")
    ap.add_argument("--ll", help="'lat,lng' to bias the search toward the right town")
    ap.add_argument("--max", type=int, default=15)
    ap.add_argument("--size", default="w2400", help="size suffix for printed URLs (default w2400)")
    ap.add_argument("--details", action="store_true",
                    help="print 'n<TAB>native WxH<TAB>owner|user[,pano?]<TAB>url' instead of bare URLs")
    ap.add_argument("--preview", metavar="OUT.jpg", help="also save a numbered-order grid of thumbnails")
    ap.add_argument("--min-width", type=int, default=1200,
                    help="skip photos whose native width is known and below this (default 1200)")
    ap.add_argument("--min-score", type=float, default=0.75,
                    help="minimum name/address match score to accept the top result (default 0.75)")
    a = ap.parse_args()

    fid = a.fid
    if not fid:
        if not a.name:
            ap.error("give a name and address, or --fid")
        results = search(a.name, a.address, a.ll)
        if not results:
            log("no place matched")
            sys.exit(2)
        for r in results[:5]:
            log("  result %.2f  %s | %s | %s" % (r["score"], r["name"], r["address"], r["fid"]))
        top = results[0]
        if top["score"] < a.min_score:
            log("no confident match (best %.2f < %.2f); check the results above, then rerun with --fid"
                % (top["score"], a.min_score))
            sys.exit(2)
        fid = top["fid"]
    info, photos = place_photos(fid)
    log("place: %s | %s | %s | %d photos" % (info["name"], info["address"], fid, len(photos)))
    if not photos:
        sys.exit(3)
    photos = [e for e in photos if not (e["dims"] and e["dims"][0] < a.min_width)]
    if not photos:
        log("no photos at least %dpx wide" % a.min_width)
        sys.exit(3)
    photos = photos[:a.max]
    for i, e in enumerate(photos, 1):
        url = e["base"] + "=" + a.size
        if a.details:
            dims = "%dx%d" % tuple(e["dims"][:2]) if e["dims"] else "?"
            kind = "owner" if e["owner"] else "user"
            if e["dims"] and e["dims"][0] >= 4000 and abs(e["dims"][0] / float(e["dims"][1]) - 2) < 0.02:
                kind += ",pano?"  # exactly 2:1 and huge: likely a 360 photo sphere (warped)
            print("%d\t%s\t%s\t%s" % (i, dims, kind, url))
        else:
            print(url)
    if a.preview:
        preview(photos, a.preview)


if __name__ == "__main__":
    main()
