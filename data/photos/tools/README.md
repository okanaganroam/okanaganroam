# Venue photo tools

Run everything from the repo root (`cd "/Users/dr/Desktop/Work/Okanagan Roam/worktrees/real-photos-only"`).
Needs only curl, ffmpeg/ffprobe, sips and the macOS system Python 3.9 (no pip installs).

| Tool | What it does |
|---|---|
| `site-images.py URL [URL...]` | Lists candidate photo URLs on the venue's own pages (og:image first, then `<img>`/srcset, CSS backgrounds, then any quoted .jpg/.webp in scripts). `--links` also lists gallery/about/patio pages to try next. Squarespace URLs are rewritten to `?format=2500w` (their largest size). |
| `gmaps-photos.py NAME ADDRESS` | Google Maps photos of that exact place, no sign-in. Prints full-size URLs (`=w2400`). |
| `url-grid.sh OUT.jpg < urls.txt` | Downloads up to 25 URLs and tiles them 5 per row, so you can look at a whole site in one image. Prints `n WxH url` for each (the real pixel size). |
| `make-photo.sh SRC SLUG Y` | Makes `public/images/venues/SLUG-2610.jpg` + `-w960` + `-w480` exactly as BRIEF.md says (refuses sources under 1200 px wide) and writes a 600x200 preview of the 3:1 strip to `$TMPDIR/strip-SLUG.jpg`. Look at that strip before accepting. |
| `contact-sheet.sh BATCH` | Builds `data/photos/sheets/BATCH-N.jpg` from `sources-BATCH.json` (3:1 strips, 12 per sheet) and prints which venue is in which row. |

## Per-venue routine (about 1 minute per venue in the pilot)

```bash
S=<your scratchpad dir>
# 1. own website
python3 data/photos/tools/site-images.py --links https://example.com
python3 data/photos/tools/site-images.py https://example.com https://example.com/gallery \
  | awk '!s[$0]++' | head -25 | bash data/photos/tools/url-grid.sh $S/site.jpg
#    open $S/site.jpg with the Read tool; pick a numbered tile that is >= 1200 wide
# 2. if nothing usable: Google Maps
python3 data/photos/tools/gmaps-photos.py --details --preview $S/gm.jpg "Name" "street address, Town" > $S/gm.txt
# 3. make the files and check the strip
curl -sL -o $S/src.jpg "<chosen URL>"
TMPDIR=$S/ bash data/photos/tools/make-photo.sh $S/src.jpg <slug> 0.5   # then Read $S/strip-<slug>.jpg; adjust Y and rerun
```

## gmaps-photos.py

```bash
# tested 2026-10-22, all three matched the right place and returned photos
python3 data/photos/tools/gmaps-photos.py --details "Araxi Restaurant" "4222 Village Square, Whistler"
python3 data/photos/tools/gmaps-photos.py --details "Sea to Sky Gondola" "36800 Highway 99, Squamish"
python3 data/photos/tools/gmaps-photos.py --details "Mile One Eating House" "7331 Arbutus St, Pemberton"
```

stderr shows the matched place (`place: name | address | feature id | N photos`) and
the search results it chose from. **Check the matched name and address every time.**
stdout (with `--details`): `n  nativeWxH  owner|user[,pano?]  url`.

Options: `--max 40` (default 15; places often have 20-45 photos, and the good room or
storefront shot is often past 15), `--preview OUT.jpg` (thumbnail grid in the printed
order), `--fid 0x...:0x...` (skip the search, e.g. when the top match was wrong),
`--ll 50.11,-122.95` (bias the search toward a town), `--min-width` (default 1200;
drops photos whose native width is smaller), `--size w2400`.

Exit codes: 0 photos; 2 no confident match (it prints the candidates; rerun with
`--fid`); 3 place has no photos >= min width; 4 Google sent a consent/bot page or changed layout.

### How it works (in case Google changes something)
1. `GET https://www.google.com/maps/search/<name+address>?hl=en&gl=ca` with a desktop
   Chrome user agent. The HTML itself has **no** place photos (only an avatar); the
   naive "grep lh3 URLs from the search page" approach does not work any more.
   But the page `<link>`-preloads its data XHR: `/search?tbm=map&...&pb=...`.
2. `GET` that XHR (JSON after a `)]}'` line). A place block is a list with the feature
   id (`0x...:0x...`) at [10], name at [11], full address at [18]. One exact match comes
   back at `d[0][1][0][14]`; several matches as `d[64][i][1]`. The tool scores name +
   street number and takes the best (needs >= 0.75).
3. `GET /maps/place/data=!4m2!3m1!1s<fid>?hl=en&gl=ca`, which preloads
   `/maps/preview/place?...`; `GET` that. `d[6]` is the place. Photo entries are lists
   whose [6] is `[url, label, [nativeW, nativeH], ...]`: hero photo at [37], photo
   category tiles at [51]/[72], review photos inside [175]. Entries containing
   `bizbuilder` are uploaded by the business ("owner"); "Video" entries are skipped.
4. Strip the `=w203-h135-k-no` style suffix and add `=w2400` -> real JPEG
   (2400 wide, or the native width if smaller). Verified with sips.

4 requests per place with a 1 s pause between them. In the pilot (about 15 place
lookups in a few minutes from one Mac) Google never sent a consent page, captcha or
"unusual traffic" page. If it ever does, the tool retries once with a
`CONSENT=YES+ / SOCS` cookie (consent.google.com is never fetched); if that
also fails it exits 4. Slow down (one place every 10+ s) rather than retry-looping.

## Gotchas found in the pilot
- **Google's photo order changes between calls** (the Gondola's first photos differed
  an hour apart). Save the `--details` output to a file and pick by line from that
  file; never rerun the tool and assume photo #N is the same photo.
- **Review photos are mostly food.** Owner photos (`owner` in `--details`, listed
  first) are the best bet for the room or storefront. Run `--max 40` before giving up.
- **`pano?`** = exactly 2:1 and >= 4000 px wide: almost always a 360 photo sphere,
  which looks warped (curved door frames). Skip them.
- Phone portraits (3024x4032) are fine sources: the 2:1 crop is 2400x1200 before
  scaling. Set Y to where the sign/room is (storefront signs are usually Y 0.25-0.45).
- Google's addresses differ slightly from ours (`#110` vs `110-`, `BC-99` vs
  `Highway 99`, 7330 vs 7331); the street-number match is a bonus, not a requirement.
- `url-grid.sh` tiles are cropped to 4:3, so the edges of wide or tall images are
  hidden there; always check the real strip from `make-photo.sh`.
- Squarespace often serves WebP even for `.jpg` URLs (ffmpeg prints "invalid TIFF
  header in EXIF" warnings; harmless). The output files are always real JPEGs.
- Site image URL lists include junk (logos without "logo" in the name, award badges,
  relative names from JSON that 404 as grey tiles). Ignore grey tiles.
- WordPress thumbnails end in `-300x200.jpg`; the original is usually the same URL
  without that suffix.
- Chains (Earls etc.): only use a photo whose file name or page clearly ties it to the
  Whistler location (e.g. `whistler-header-retina.png`).
- Sources wider than 2:1 (e.g. 4000x1848 phone shots): `make-photo.sh` crops them
  from the centre horizontally; the brief's raw ffmpeg line would leave them wider
  than 2:1.
- No `drawtext` in this ffmpeg build, so grids/sheets are not labelled; keep the
  printed order.
