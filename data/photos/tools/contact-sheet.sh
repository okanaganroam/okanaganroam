#!/bin/bash
# Build the approval contact sheet(s) for a batch, as BRIEF.md describes:
# each photo scaled to 600 wide, cropped to the 3:1 strip the listing shows
# (600x200, centred), stacked vertically, at most 12 per sheet.
#
#   bash data/photos/tools/contact-sheet.sh pilot-1
#
# Reads data/photos/sources-<batch>.json (file order), writes
# data/photos/sheets/<batch>-1.jpg, -2.jpg, ... and prints which venue is in
# which row (ffmpeg here has no drawtext, so rows are not labelled on the image).
# Run from the repo root.
set -euo pipefail
batch="${1:?usage: contact-sheet.sh BATCH}"
src="data/photos/sources-$batch.json"
mkdir -p data/photos/sheets
files=()
while IFS= read -r line; do files+=("$line"); done < <(python3 -c '
import json,sys
for s in json.load(open(sys.argv[1])): print(s["file"].lstrip("/") + "\t" + s["name"])
' "$src")
n=${#files[@]}
sheet=0
for ((start=0; start<n; start+=12)); do
  sheet=$((sheet+1))
  out="data/photos/sheets/$batch-$sheet.jpg"
  args=(); filt=""; k=0
  for ((i=start; i<n && i<start+12; i++)); do
    f="public/${files[$i]%%$'\t'*}"
    args+=(-i "$f")
    filt+="[$k:v]scale=600:-2,crop=600:200,setsar=1[v$k];"
    echo "$out row $((k+1)): ${files[$i]#*$'\t'}"
    k=$((k+1))
  done
  if [ $k -eq 1 ]; then
    filt+="[v0]copy[out]"
  else
    for ((j=0; j<k; j++)); do filt+="[v$j]"; done
    filt+="vstack=inputs=$k[out]"
  fi
  ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$filt" -map "[out]" -q:v 3 "$out"
done
echo "sheets: $sheet" >&2
