"""Read-only health crawl of okanaganroam.com (2026-10-13): fetches every sitemap URL (6 at a time),
recording status, redirect target, canonical, robots noindex, title, meta description, <h1> count and
hreflang links, then checks every internal link found on those pages that isn't itself in the sitemap.

usage: python3 -I scripts/health-crawl.py [out.json]   (default: health-crawl-results.json in the cwd)
It only reads public pages; nothing is written to the site."""
import concurrent.futures as cf, gzip, html, json, os, re, sys, time, urllib.parse, urllib.request, zlib

BASE = 'https://okanaganroam.com'
UA = {'User-Agent': 'okr-health-crawl (site owner audit)', 'Accept-Encoding': 'gzip'}
OUT = sys.argv[1] if len(sys.argv) > 1 else 'health-crawl-results.json'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        r = opener.open(req, timeout=40)
        status, headers, body = r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        status, headers, body = e.code, e.headers, e.read() if e.fp else b''
    except Exception as e:
        return {'url': url, 'status': 'error', 'error': str(e)[:120]}
    if headers.get('Content-Encoding') == 'gzip':
        try: body = gzip.decompress(body)
        except Exception: pass
    res = {'url': url, 'status': status, 'location': headers.get('Location'), 'type': headers.get('Content-Type', '')}
    if 'text/html' in res['type'] and status == 200:
        h = body.decode('utf-8', 'ignore')
        g = lambda pat: (re.search(pat, h, re.S | re.I) or [None, None])[1]
        res['title'] = html.unescape(g(r'<title>(.*?)</title>') or '').strip()
        res['desc'] = html.unescape(g(r'<meta name="description" content="([^"]*)"') or '').strip()
        res['canonical'] = g(r'<link rel="canonical" href="([^"]+)"')
        res['noindex'] = bool(re.search(r'<meta name="robots" content="[^"]*noindex', h))
        res['h1'] = len(re.findall(r'<h1[\s>]', h))
        res['hreflang'] = len(re.findall(r'<link rel="alternate" hreflang=', h))
        body_only = re.sub(r'<script.*?</script>|<template.*?</template>', ' ', h, flags=re.S)
        links = set()
        for href in re.findall(r'<a\s[^>]*href="([^"#]+)', body_only):
            href = html.unescape(href)
            if href.startswith('/') and not href.startswith('//'):
                links.add(href.split('#')[0])
            elif href.startswith(BASE):
                links.add(href[len(BASE):] or '/')
        res['links'] = sorted(links)
    return res

def main():
    sm = urllib.request.urlopen(urllib.request.Request(BASE + '/sitemap.xml', headers={'User-Agent': UA['User-Agent']}), timeout=60).read().decode()
    urls = re.findall(r'<loc>([^<]+)</loc>', sm)
    print('sitemap urls', len(urls), flush=True)
    t = time.time()
    with cf.ThreadPoolExecutor(6) as ex:
        pages = list(ex.map(fetch, urls))
    print('fetched sitemap pages in', round(time.time() - t), 's', flush=True)
    seen = {u[len(BASE):] or '/' for u in urls}
    targets = sorted({l for p in pages for l in p.get('links', []) if l.split('?')[0] not in seen and not l.startswith(('/images/', '/share/', '/styles/', '/scripts/', '/api/'))})
    # Query-string variants of known pages are filters, not new pages: check a de-duplicated path once.
    paths = sorted({l for l in targets if '?' not in l}) + sorted({l for l in targets if '?' in l})[:300]
    print('extra internal link targets', len(paths), flush=True)
    with cf.ThreadPoolExecutor(6) as ex:
        extra = list(ex.map(lambda p: fetch(BASE + p), paths))
    for e in extra: e.pop('links', None)
    json.dump({'pages': pages, 'extra': extra}, open(OUT, 'w'))
    print('done', round(time.time() - t), 's', flush=True)

main()
