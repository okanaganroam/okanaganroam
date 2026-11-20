# Places-to-stay photos: agent brief (Nov 19 2026)

These listings are hotels, motels, B&Bs, inns, lodges, resorts, cabins, guest houses and campgrounds. They were just added as
type `stay` and have no photo yet. Every one needs a real photo of THAT property. Never use stock photos, a photo of a different
property, or a photo of a different location of a chain.

Read first, and follow it exactly: the general brief at
"/Users/dr/Desktop/Work/Whistler Roam/whistlerroam/data/photos/BRIEF.md" (sections "Where photos come from", "How to judge a
photo", "Output per venue") and the tools README at data/photos/tools/README.md in YOUR repo. Only the stays-specific parts
below differ.

## Your repo and batch
- Okanagan batches (stays-ok-N): repo "/Users/dr/Desktop/Work/Okanagan Roam/worktrees/okanaganroam-stays"
- Whistler batches (stays-wr-N): repo "/Users/dr/Desktop/Work/Whistler Roam/worktrees/whistlerroam-stays"
- Run every tool from your repo root. Your venues: data/photos/batches/<batch>.json (id, name, region, subtype, slug,
  address, website, latitude, longitude, page).
- Quote the paths (they have spaces).

## Source order for stays
1. **The property's own website.** This includes a chain's own page for THIS property (marriott.com, hilton.com, ihg.com,
   wyndhamhotels.com, choicehotels.com, bestwestern.com and so on). Chain sites often block scripts. If one blocks you, move on
   to Google Maps. Never fake a browser user agent.
2. **Google Maps photos of the exact property** (gmaps-photos.py --details --max 60). Check the matched name and address every
   time. Owner photos come first and are usually the best.
3. **A tourism board listing** (tourismkelowna.com, visitpenticton.com, destinationosoyoos.com, exploresquamish.com and so on),
   only when it plainly shows that property.

Do not use Booking.com, Expedia, Tripadvisor, Airbnb or other booking-site photos, blogs, or Instagram.

## What makes a good stay photo, best first
1. The building or front with its name or setting visible.
2. The property in its setting: lakefront, the pool with the building, the vineyard view from the B&B, the ski-in lodge in snow.
   For a ski lodge, snow is fine, since it's ski season.
3. A bright, wide shot of a guest room or the lobby. Use this only when 1 and 2 don't exist in good quality.
4. **Campgrounds:** the campsites or the lake or river at the campground. Not the office or a sign alone.

**Reject:**
- logos, maps, signs alone, floor plans, food close-ups
- bathrooms, a bed close-up, people filling the frame
- night shots too dark to read, heavy filters, text overlays
- 360 spheres, watermarks

Check the middle 3:1 strip, as in the general brief.

## Files, exactly as in the general brief, with these names
- batch_id "photos-<batch>-2026-11-19"; image_url "/images/venues/<slug>-2610.jpg?v=20261119"
- data/photos/sources-<batch>.json, data/photos/credits-<batch>.json, data/photos/batch-<batch>.json, data/photos/none-<batch>.json
- **Credits:**
  - Own-site photo: "<Name>".
  - Google: "<Name> via Google Maps".
  - Tourism board: "<Name> via <Board name>".
- **Contact sheet:** data/photos/tools/contact-sheet.sh <batch>.

## Rules
- Work only on your batch.
- Never edit server.js, the database, data/venue-photo-credits.json, the tools, or anything another batch owns.
- Never commit.
- Don't contact anyone.
- **Rate limits:** six agents share one IP. Pause 5–10 seconds between Google Maps places, and make only one request at a time
  to any website. If Google blocks you, wait 2 minutes, then continue. If it blocks you again, finish with what you have and
  say so.
- **Scratch files:** keep them in your own subfolder of the session scratchpad,
  /private/tmp/claude-502/-Users-dr-Desktop-Work-Okanagan-Roam-okanaganroam/5585a22c-8f38-411c-ba97-3bbc5d237f65/scratchpad/<batch>/
- **Look at every strip preview** before accepting it.
- **Report back:** short and plain.
  - Counts: website / Google Maps / board / none.
  - The contact-sheet row order.
  - Any property that looks closed, renamed, or under construction, or whose matched Google place didn't fit.
  - Any blocks.
