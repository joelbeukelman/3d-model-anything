# My scan → Three.js workflow

Follows Wes's tutorial (https://www.youtube.com/watch?v=DdkrydixUQw) and the repo's `scan-to-threejs` skill.

## One-time setup (done)
- [x] Clone repo to `~/code/3d-model-anything`, `npm ci`, `npm run build` passes
- [x] iPhone app installed (bundle `com.joelbeukelman.housecapture`, team 9XR2RJ57L2)
- [x] Viewer + Play mode run locally: `npm run dev` → http://localhost:5188

## Per room
1. [ ] **Scan** in the app: name the room, walk it until the mesh turns green, **Finish room**, then **Finish session**.
2. [ ] **Transfer**: open the saved room → *Share room (.zip)* → AirDrop to the Mac (lands in `~/Downloads`).
       Backup: Files app → On My iPhone → 3D Model Anything → `Houses/`.
3. [ ] **Ingest**: `tools/ingest-scan.sh ~/Downloads/<export>.zip <room-id>` (add a 3rd arg for the room index if the export has several rooms).
       This unzips to `data/captures-in/<room-id>/` (git-ignored) and writes `data/demos/<room-id>/scan.json` + `plan.png`.
4. [ ] **View**: `npm run dev`, open `/?room=<room-id>` (dollhouse/walk/overhead) — new rooms appear in the room list automatically.
5. [ ] **Interact**: `/play.html?room=<room-id>&mode=fpv` — WASD, click to throw, E carry, Shift sprint. Furniture boxes are movable; walls/doors/windows are fixed.
6. [ ] **Check the plan**: open `data/demos/<room-id>/plan.png`; wall indices and openings should match the real room.

## Photo-detail scan (real colors from your photos)
`DETAIL=1 tools/ingest-scan.sh <zip> <room-id>` fuses the depth frames into a dense mesh and colors it from the best photo per vertex
(~3 min/room, 25-30 MB output, git-ignored). The viewer's **Scan** and **Overlay** modes use it automatically.
One-time setup: `.venv/bin/pip install "numpy<2" open3d pillow` (numpy 2 segfaults Open3D 0.18).

## Real object shapes (cut from the photo mesh)
After `DETAIL=1` ingest: write `tools/extract-config/<room-id>.json` (see `studio.json`; surfaces = desk/bench/shelf tops, floorItems = floor region),
then `.venv/bin/python tools/extract-objects.py <room-id>`. Furniture is cropped by its RoomPlan box; clutter on surfaces is split by a height-map watershed,
filled into solids and colored from the photos. `demos/<id>/room.ts` swaps its stand-in boxes for these via `loadProps('<id>')`. Needs `scipy scikit-image trimesh`.

## Upgrade the baseline to a real model (the tutorial's agent step)
7. [ ] `pip install pillow` in a venv (needed for photos); install `agent-browser` CLI for the capture scripts.
8. [ ] Ask your coding agent: *"Use scan-to-threejs to rebuild the room in data/captures-in/<room-id>. Inspect measurements and photos, create an editable scene, compare rendered views with the original photographs."*
9. [ ] Replace the generated boxes with modeled furniture in `demos/<room-id>/`, register a `RoomModule` in `demos/index.ts` (it overrides the auto box version). Keep `userData.physics` tags on top-level objects for Play mode.
10. [ ] Compare with matched cameras: `CAP_URL=http://localhost:5188 .agents/skills/scan-to-threejs/scripts/cmp_photo.sh <room-id> 0 13 26`, fix the biggest differences, repeat.
11. [ ] Multi-room house: only align rooms via the app's *Connect to another room*; never assume rooms share a frame.

## Privacy / transfer prep
- Scans stay in `data/captures-in/`, `data/scans/`, `data/captures/` (all git-ignored). **`data/demos/<id>/scan.json` is NOT ignored** — it contains your floor plan; don't push it to a public repo (add it to `.gitignore` or keep the repo private).
- The repo's `origin` is your fork `joelbeukelman/3d-model-anything`; `project.yml` bundle ID change is local/uncommitted.
- Free Apple accounts: the app expires after 7 days; rebuild + `xcrun devicectl device install app` to refresh.
- Rebuild/install command: `cd apps/house-capture && xcodebuild -project HouseCapture.xcodeproj -scheme HouseCapture -configuration Release -destination 'id=00008130-001804523606001C' -derivedDataPath build -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=9XR2RJ57L2 build` then `xcrun devicectl device install app --device 00008130-001804523606001C build/Build/Products/Release-iphoneos/HouseCapture.app`
