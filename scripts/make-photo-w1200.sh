#!/bin/sh
# Makes the 1200px copies of listing photos (round 7, 2026-10-19) that the venue page's hero lists in its srcset
# between the 960px copy and the original (see heroSrcset in server.js). Free: macOS's built-in sips, no packages.
#
#   sh scripts/make-photo-w1200.sh            # every folder, skips copies that already exist
#   sh scripts/make-photo-w1200.sh venues     # one folder (venues, hiking/venues, beaches/venues, sports/venues)
#
# A photo 1200px wide or less gets no copy (the hero lists the original instead). The server reads the folder list
# once at start, so restart it (or deploy) after adding copies. Each copy is about 110-270 KB (quality 60), so every
# folder at once is roughly 300 MB: check the free disk space first, and commit the copies with the change that
# needs them (a new image URL must never go live before its file).
set -eu
cd "$(dirname "$0")/../public/images"
dirs=${1:-"venues hiking/venues beaches/venues sports/venues"}
made=0
for d in $dirs; do
  [ -d "$d" ] || continue
  for f in "$d"/*.jpg "$d"/*.jpeg "$d"/*.png "$d"/*.webp; do
    [ -f "$f" ] || continue
    case "$f" in *-w[0-9]*.jpg) continue ;; esac
    out="${f%.*}-w1200.jpg"
    [ -f "$out" ] && continue
    w=$(sips -g pixelWidth "$f" 2>/dev/null | awk '/pixelWidth/ {print $2}')
    [ -n "$w" ] && [ "$w" -gt 1200 ] || continue
    sips -s format jpeg -s formatOptions 60 --resampleWidth 1200 "$f" --out "$out" >/dev/null
    made=$((made + 1))
  done
done
echo "made $made copies"
