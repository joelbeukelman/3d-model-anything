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
BUNDLE=$(dirname "$MAN")
# single-room exports have no structure.json: use that room's own file
if [[ -z $ROOM && ! -f $BUNDLE/structure.json ]]; then
  ROOM=$(ls "$BUNDLE"/rooms/room-*.json | head -1 | sed -E 's/.*room-([0-9]+)\.json/\1/')
fi
python3 "$ROOT/.agents/skills/scan-to-threejs/scripts/bundle_to_room.py" "$BUNDLE" \
  ${ROOM:+--room "$ROOM"} -o "$OUT/scan.json" --plan "$OUT/plan.png"
# LiDAR mesh for the viewer's Scan/Overlay modes (served from the site root as /<id>/mesh.ply)
PLY=$(ls "$BUNDLE"/mesh/room-*.ply 2>/dev/null | head -1 || true)
if [[ -n ${PLY:-} ]]; then mkdir -p "$ROOT/data/web-assets/$ID"; cp "$PLY" "$ROOT/data/web-assets/$ID/mesh.ply"; cp "${PLY%.ply}-colors.bin" "$ROOT/data/web-assets/$ID/colors.bin" 2>/dev/null || true; fi
# Optional photo-colored mesh (2-4 min per room; needs .venv with open3d + numpy<2 + pillow): DETAIL=1 tools/ingest-scan.sh ...
if [[ ${DETAIL:-} == 1 ]]; then
  "$ROOT/.venv/bin/python" -u "$ROOT/.agents/skills/scan-to-threejs/scripts/reconstruct_bundle.py" "$BUNDLE" --room "$OUT/scan.json" --voxel 0.02 -o "$ROOT/data/captures/$ID-recon"
  cp "$ROOT/data/captures/$ID-recon/scan_room.glb" "$ROOT/data/web-assets/$ID/scan.glb"
fi
echo "OK → http://localhost:5188/?room=$ID   Play: http://localhost:5188/play.html?room=$ID&mode=fpv"
