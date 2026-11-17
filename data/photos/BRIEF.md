# Okanagan Roam venue photos: agent brief (Oct 28 2026, batches ok28-1 .. ok28-6)

Dayton (Oct 28): only a real photo of the actual place, in good quality, from Google. These listings currently show
no photo of their own (the site used to show a stock "example" photo of the kind of place, which is being removed).
Repo: "/Users/dr/Desktop/Work/Okanagan Roam/worktrees/real-photos-only" (quote the path). Your venues: data/photos/batches/<batch>.json
(id, name, region, type, slug, address, website, latitude, longitude, page). Read data/photos/tools/README.md first.

## Where photos come from, in order
1. Google Maps photos of that exact place: `python3 data/photos/tools/gmaps-photos.py --details --max 60 --preview <scratch>/gm.jpg "Name" "address, Town"`.
   Check the matched place name and address every time. For trails/parks/viewpoints/beaches also try the destination
   (lake, falls, peak, park) and the trailhead. Look at every candidate; the best one is often far down the list.
   Credit "<Venue name> via Google Maps".
2. The venue's own website or the managing organisation (regional district / city parks page, BC Parks, the winery or
   restaurant site) with data/photos/tools/site-images.py. Credit "<Venue name>" (the page adds "Photo:").
3. Tourism boards (tourismkelowna.com, visitpenticton.com, tourismvernon.com, destinationosoyoos.com) only when they
   plainly show the place. Credit "<Venue name> via <board>".
Never a stock photo, a photo of a different place or another branch of a chain, AI images, or anything watermarked.
Record `none` only after real effort, with the reason.

## Quality bar
Sharp, well exposed, landscape, at least 1600px wide when available (1200px minimum; make-photo.sh refuses less).
It must show THAT place: the room, storefront with name, patio, the trail/lake/falls/view, the court, the vineyard.
Reject single food close-ups, logos, menus, signs alone, parking lots, selfies or people filling the frame, 360 spheres,
and crops whose middle 3:1 band is sky, a door or a table. Look at the strip preview make-photo.sh writes for every pick.

## Output per batch (do not commit)
- Files: `TMPDIR=<scratch>/ bash data/photos/tools/make-photo.sh <src.jpg> <slug> <Y>` makes public/images/venues/<slug>-2610.jpg, -w960, -w480.
  If a file with that name already exists in public/images/venues, use <slug>-g28 as the slug instead (never overwrite).
- data/photos/sources-<batch>.json: [{ "id", "name", "file": "/images/venues/<file>.jpg", "dimensions": "WxH", "source_page", "image_url", "source_kind": "google_maps"|"website"|"tourism_board", "note": "<what it shows>" }]
- data/photos/credits-<batch>.json: { "/images/venues/<file>.jpg": "<credit text as above>" }
- data/photos/batch-<batch>.json: { "reason": "Venue photos <batch>", "batch_id": "photos-<batch>-2026-10-28", "venues": [ { "id", "name", "region", "slug", "expect": { "image_url": null }, "set": { "image_url": "/images/venues/<file>.jpg?v=20261028" } } ] }
- data/photos/none-<batch>.json: [{ "id", "name", "reason" }]
- Contact sheet: `bash data/photos/tools/contact-sheet.sh <batch>` (prints the row order; put it in your report).
Rules: work only on your own batch; never edit server.js, the database, data/venue-photo-credits.json, the tools or
another batch's files. Several agents share one IP: pause 5-10 s between Google places. Keep temporary files in your
own scratch folder.
