#!/usr/bin/env python3
"""List candidate photo URLs on a venue's own web pages (step 1 of the brief).

Usage:
  python3 data/photos/tools/site-images.py https://araxi.com
  python3 data/photos/tools/site-images.py https://araxi.com https://araxi.com/gallery/
  python3 data/photos/tools/site-images.py --links https://araxi.com   # also list gallery/about/photo links

Prints one absolute image URL per line, og:image / twitter:image first, then
<img> src/srcset/data-src, then CSS background-image URLs, then any quoted
.jpg/.webp path in scripts (sliders, lightboxes), in page order.
SVG, GIF, data: URIs, and files whose names say logo/icon/favicon/sprite are
skipped. For srcset, the largest candidate is kept. Widths are not checked
here: download the ones you like and check with sips (>= 1200 px wide).
Python 3.9 stdlib only; uses curl.
"""
import html as htmllib
import re
import subprocess
import sys
import time
import urllib.parse

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128 Safari/537.36")
SKIP = re.compile(r"(\.svg|\.gif|logo|icon|favicon|sprite|badge|tripadvisor|opentable|"
                  r"facebook|instagram|twitter|pixel|spacer|placeholder|blank\.)", re.I)
LINKWORDS = re.compile(r"(gallery|photos?|about|our-story|story|space|venue|private|"
                       r"location|patio|room|events?|dining|restaurant)", re.I)


def fetch(url):
    r = subprocess.run(["curl", "-sL", "--compressed", "--max-time", "25", "-A", UA,
                        "-w", "\n%{http_code} %{url_effective}", url], capture_output=True)
    out = r.stdout.decode("utf-8", "replace")
    body, _, tail = out.rpartition("\n")
    return body, tail


def biggest_srcset(v):
    best, bw = None, -1
    for part in v.split(","):
        bits = part.strip().split()
        if not bits:
            continue
        w = 0
        if len(bits) > 1:
            m = re.match(r"(\d+)", bits[1])
            w = int(m.group(1)) if m else 0
        if w >= bw:
            best, bw = bits[0], w
    return best


def images(page_url, body):
    found = []
    for m in re.finditer(r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::url)?|twitter:image)["\'][^>]*>', body, re.I):
        c = re.search(r'content=["\']([^"\']+)', m.group(0))
        if c:
            found.append(c.group(1))
    for m in re.finditer(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']', body, re.I):
        found.append(m.group(1))
    for m in re.finditer(r"<(?:img|source)\b[^>]*>", body, re.I):
        tag = m.group(0)
        for attr in ("srcset", "data-srcset", "data-lazy-srcset"):
            a = re.search(attr + r'=["\']([^"\']+)', tag, re.I)
            if a:
                b = biggest_srcset(a.group(1))
                if b:
                    found.append(b)
        for attr in ("data-src", "data-lazy-src", "data-original", "src"):
            a = re.search(r'\s' + attr + r'=["\']([^"\']+)', tag, re.I)
            if a:
                found.append(a.group(1))
    for m in re.finditer(r'background(?:-image)?\s*:\s*url\(\s*["\']?([^"\')]+)', body, re.I):
        found.append(m.group(1))
    for m in re.finditer(r'data-(?:bg|background|image)=["\']([^"\']+\.(?:jpe?g|png|webp)[^"\']*)', body, re.I):
        found.append(m.group(1))
    # last: any quoted .jpg/.jpeg/.webp path in scripts or JSON (sliders, lightboxes)
    for m in re.finditer(r'["\']([^"\'\s<>()]+\.(?:jpe?g|webp)(?:\?[^"\'\s<>]*)?)["\']', body, re.I):
        found.append(m.group(1).replace("\\/", "/"))
    out, seen = [], set()
    for u in found:
        u = htmllib.unescape(u.strip())
        if not u or u.startswith("data:"):
            continue
        u = urllib.parse.urljoin(page_url, u)
        if "squarespace-cdn.com" in u:  # ask Squarespace for its largest rendition
            u = re.sub(r"\?format=\d+w$", "", u) + "?format=2500w"
        if SKIP.search(u.split("?")[0]):
            continue
        key = u.split("?")[0]  # same file with/without ?format=... -> keep the first
        if key not in seen:
            seen.add(key)
            out.append(u)
    return out


def links(page_url, body):
    host = urllib.parse.urlparse(page_url).netloc
    res, seen = [], set()
    for m in re.finditer(r'<a\b[^>]*href=["\']([^"\'#]+)', body, re.I):
        u = urllib.parse.urljoin(page_url, htmllib.unescape(m.group(1)))
        p = urllib.parse.urlparse(u)
        if (p.netloc == host and LINKWORDS.search(p.path) and u not in seen
                and not re.search(r"\.(jpe?g|png|webp|gif|svg|pdf)$", p.path, re.I)):
            seen.add(u)
            res.append(u)
    return res


def main():
    args = sys.argv[1:]
    want_links = "--links" in args
    urls = [a for a in args if not a.startswith("--")]
    if not urls:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    for i, url in enumerate(urls):
        if i:
            time.sleep(1)
        body, tail = fetch(url)
        print("# %s -> %s" % (url, tail), file=sys.stderr)
        final = tail.split(" ", 1)[1] if " " in tail else url
        for u in images(final, body):
            print(u)
        if want_links:
            for u in links(final, body):
                print("# link: " + u, file=sys.stderr)


if __name__ == "__main__":
    main()
