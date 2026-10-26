#!/usr/bin/env bash
# Turn an AirDropped room export into a room you can open in the viewer and Play mode.
# usage: tools/ingest-scan.sh <export.zip | extracted-folder> <room-id> [room-index]
set -euo pipefail
SRC=${1:?export zip or folder}; ID=${2:?room id, e.g. living-room}; ROOM=${3:-}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST="$ROOT/data/captures-in/$ID"; OUT="$ROOT/data/demos/$ID"
mkdir -p "$DEST" "$OUT"
if [[ -f $SRC ]]; then unzip -oq "$SRC" -d "$DEST"; else cp -R "$SRC"/. "$DEST"/; fi
MAN=$(find "$DEST" -name manifest.json -not -path '*/__MACOSX/*' | head -1)
[[ -n $MAN ]] || { echo "no manifest.json found in export" >&2; exit 1; }
python3 "$ROOT/.agents/skills/scan-to-threejs/scripts/bundle_to_room.py" "$(dirname "$MAN")" \
  ${ROOM:+--room "$ROOM"} -o "$OUT/scan.json" --plan "$OUT/plan.png"
echo "OK → http://localhost:5188/?room=$ID   Play: http://localhost:5188/play.html?room=$ID&mode=fpv"
