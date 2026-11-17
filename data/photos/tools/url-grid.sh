#!/bin/bash
# Look at many candidate images at once: reads image URLs (one per line) on
# stdin, downloads each, and tiles them 5 per row into one JPEG, numbered
# left-to-right, top-to-bottom in input order. Each tile is labelled only by
# position, so keep your URL list. Under each tile the size is NOT shown;
# it prints "n WxH url" to stdout so you can see which are >= 1200 px wide.
#
#   python3 data/photos/tools/site-images.py https://araxi.com | head -20 \
#     | bash data/photos/tools/url-grid.sh /tmp/araxi-site.jpg
#
# Lines starting with # are ignored. Max 25 URLs per grid.
set -u
out="${1:?usage: url-grid.sh OUT.jpg < urls.txt}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
tmp=$(mktemp -d -t urlgrid)
n=0
while IFS= read -r url; do
  [[ -z "$url" || "$url" == \#* ]] && continue
  n=$((n+1)); [ $n -gt 25 ] && break
  f="$tmp/raw$n"
  curl -sL --max-time 25 -A "$UA" -o "$f" "$url"
  dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$f" 2>/dev/null | head -1)
  echo "$n ${dims:-?} $url"
  t=$(printf "%s/%03d.jpg" "$tmp" $n)
  ffmpeg -y -loglevel error -i "$f" -vf "scale=400:300:force_original_aspect_ratio=increase,crop=400:300,format=yuvj420p" -frames:v 1 "$t" 2>/dev/null \
    || ffmpeg -y -loglevel error -f lavfi -i color=c=gray:s=400x300 -frames:v 1 "$t"
done
if [ $n -gt 25 ]; then n=25; fi
if [ $n -eq 0 ]; then echo "no URLs" >&2; rm -rf "$tmp"; exit 1; fi
rows=$(( (n + 4) / 5 ))
ffmpeg -y -loglevel error -start_number 1 -i "$tmp/%03d.jpg" -vf "tile=5x${rows}:padding=6:color=white" -frames:v 1 -q:v 4 "$out"
rm -rf "$tmp"
echo "grid: $out ($n images)" >&2
