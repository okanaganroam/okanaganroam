#!/bin/bash
# Make the three venue files from one source image, exactly as BRIEF.md says.
#
#   bash data/photos/tools/make-photo.sh SRC.jpg SLUG Y
#
# SRC   downloaded source image (any format ffmpeg reads; must be >= 1200 px wide)
# SLUG  venue slug -> public/images/venues/SLUG-2610.jpg, -w960.jpg, -w480.jpg
# Y     0..1, where the 2:1 crop band sits vertically (0 = top, 0.5 = middle, 1 = bottom)
#
# Sources wider than 2:1 are cropped from the centre horizontally (the brief's
# filter keeps full width, which would give a strip wider than 2:1).
# Run from the repo root. Prints "WxH" of the main file on success. Also writes
# a 600x200 preview of the 3:1 strip the listing will show to
# $TMPDIR/strip-SLUG.jpg so you can check the middle band before accepting.
set -euo pipefail
src="${1:?SRC}"; slug="${2:?SLUG}"; y="${3:-0.5}"
w=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$src" | head -1)
if [ -z "$w" ] || [ "$w" -lt 1200 ]; then echo "error: source is ${w:-unreadable} px wide (need >= 1200)" >&2; exit 1; fi
dir=public/images/venues
mkdir -p "$dir"
main="$dir/$slug-2610.jpg"
ffmpeg -y -loglevel error -i "$src" -vf "crop=min(iw\,ih*2):min(ih\,iw/2):(iw-min(iw\,ih*2))/2:(ih-min(ih\,iw/2))*$y,scale='min(1800,iw)':-2" -q:v 3 "$main"
ffmpeg -y -loglevel error -i "$main" -vf scale=960:-2 -q:v 4 "$dir/$slug-2610-w960.jpg"
ffmpeg -y -loglevel error -i "$main" -vf scale=480:-2 -q:v 4 "$dir/$slug-2610-w480.jpg"
ffmpeg -y -loglevel error -i "$main" -vf "scale=600:-2,crop=600:200" -q:v 4 "${TMPDIR:-/tmp}/strip-$slug.jpg"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$main"
