import * as THREE from 'three';
import { loadProps } from '../scan-room/props';
import { scanRoom, type ScanJson } from '../scan-room';
import { box, cylinder, cushion, place, type V3 } from '../../packages/room-runtime/helpers';
import type { BuiltRoom, PhotoPose } from '../../packages/room-runtime/types';

/**
 * The studio, rebuilt from the October 26 scan: RoomPlan supplies the shell and openings
 * (3.32 × 3.86 m, 2.44 m ceiling); everything inside is modeled from the posed photos.
 * Measured: shell, openings, furniture footprints. Modeled by eye from photos: colors, art, props.
 * Approximate: small objects, wall art, back room beyond the door.
 */
const H = 2.438, X = 1.6579, Z = 1.9303;

// --- tiny deterministic random so props land in the same place on every load ---
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const std = (color: string, roughness = .7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const M = {
  oak: std('#d8b583', .55), steel: std('#18191b', .45, .6), black: std('#222326', .6), leather: std('#2a2b2f', .5),
  white: std('#f1f0ec', .8), paper: std('#f6f5f0', .9), gray: std('#7d8187', .7), glass: std('#cfe4f5', .1, 0, { transparent: true, opacity: .12 }),
  bin: std('#dfe6ea', .15, 0, { transparent: true, opacity: .35 }), wood: std('#8a5a33', .6), pillow: std('#efe9e0', .95),
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** light oak planks, ~0.18 m wide, 1.2 m long (floor UVs are in meters) */
const oakFloor = () => canvasTex(256, 256, g => {
  g.fillStyle = '#d9b784'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `hsl(${32 + rnd() * 8} ${35 + rnd() * 15}% ${62 + rnd() * 10}%)`; g.fillRect(0, i * 43, 256, 42);
    g.strokeStyle = 'rgba(90,55,25,.35)'; g.beginPath(); g.moveTo(0, i * 43); g.lineTo(256, i * 43); g.stroke();
    g.beginPath(); const x = rnd() * 256; g.moveTo(x, i * 43); g.lineTo(x, i * 43 + 43); g.stroke();
    for (let k = 0; k < 10; k++) { g.strokeStyle = 'rgba(120,80,40,.15)'; g.beginPath(); const y = i * 43 + rnd() * 42; g.moveTo(0, y); g.lineTo(256, y + rnd() * 3); g.stroke(); }
  }
}, [1 / 1.2, 1 / 1.0]);

/** blue-gray grasscloth */
const fabric = () => canvasTex(128, 128, g => {
  g.fillStyle = '#3b4658'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '200,215,235' : '10,15,25'},${.05 + rnd() * .08})`; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 10, 1); }
}, [1 / .6, 1 / .6]);

const pegboard = () => canvasTex(128, 128, g => {
  g.fillStyle = '#2b2e33'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#0c0d0f';
  for (let x = 8; x < 128; x += 16) for (let y = 8; y < 128; y += 16) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
}, [.93 / .25, 1.1 / .25]);

const poster = (colors: string[], busy = false) => canvasTex(128, 160, g => {
  g.fillStyle = colors[0]; g.fillRect(0, 0, 128, 160);
  const n = busy ? 40 : 6;
  for (let i = 0; i < n; i++) { g.fillStyle = colors[1 + Math.floor(rnd() * (colors.length - 1))]; const s = busy ? 10 + rnd() * 10 : 25 + rnd() * 50;
    g.beginPath(); g.arc(rnd() * 128, rnd() * 160, s / 2, 0, 7); g.fill(); }
});

const named = <T extends THREE.Object3D>(o: T, name: string, physics?: object) => { o.name = name; if (physics) o.userData.physics = physics; return o; };
const pointLight = (c: string, i: number, d: number, x: number, y: number, z: number) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); return l; };
const stat = { type: 'static' as const };

/** local +z is the object's front; rotY turns it to face where the scan says */
function at(g: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) { g.position.set(x, y, z); g.rotation.y = rotY; return g; }

function sofa() {
  const g = new THREE.Group(); g.add(
    cushion([1.85, .28, .85], [0, .24, 0], .04, M.leather),
    cushion([1.85, .55, .22], [0, .62, -.32], .06, M.leather),
    cushion([.2, .5, .85], [-.82, .42, 0], .05, M.leather), cushion([.2, .5, .85], [.82, .42, 0], .05, M.leather));
  for (const x of [-.4, .4]) g.add(cushion([.78, .14, .62], [x, .45, .08], .05, std('#33353a', .55)));
  g.add(box([1.7, .08, .8], [0, .05, 0], M.steel));
  return named(g, 'sofa', stat);
}

function throwPillow(x: number, z: number, rot: number) {
  const p = cushion([.42, .38, .12], [0, 0, 0], .05, M.pillow);
  return named(at(p, x, z, rot, .66), 'pillow', { type: 'dynamic', shape: 'box', mass: .6, surface: 'soft' });
}

function officeChair() {
  const g = new THREE.Group();
  g.add(cushion([.52, .09, .5], [0, .5, 0], .03, M.black), cushion([.5, .62, .08], [0, .88, -.24], .04, M.black));
  g.add(cylinder(.035, .3, [0, .3, 0], M.steel));
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; const arm = box([.3, .03, .05], [Math.cos(a) * .15, .1, Math.sin(a) * .15], M.steel); arm.rotation.y = -a; g.add(arm); g.add(cylinder(.025, .04, [Math.cos(a) * .3, .035, Math.sin(a) * .3], M.black)); }
  for (const s of [-1, 1]) g.add(box([.05, .03, .4], [s * .3, .7, -.02], M.black), box([.03, .2, .03], [s * .3, .6, .1], M.steel));
  return named(g, 'office-chair', { type: 'dynamic', shape: 'box', mass: 9, boxInset: [.06, .0, .06] });
}

function standingDeskLeg(x: number, z: number, g: THREE.Object3D, top: number, footAlongX: boolean) {
  g.add(box([.06, top - .04, .06], [x, (top - .04) / 2, z], M.steel), box(footAlongX ? [.6, .04, .06] : [.06, .04, .6], [x, .02, z], M.steel));
}

function bookRun(g: THREE.Object3D, x0: number, x1: number, y: number, z: number, axis: 'x' | 'z') {
  const pal = ['#1c1c1e', '#2d4a6b', '#7a2b2b', '#d8d2c4', '#3b3b3b', '#a89b7e', '#233b2f', '#e0e0dc'];
  let p = x0, n = 0;
  while (p < x1 - .05) {
    const t = .02 + rnd() * .035, h = .2 + rnd() * .12, d = .22 + rnd() * .05;
    const bk = box(axis === 'x' ? [t, h, d] : [d, h, t], axis === 'x' ? [p + t / 2, y + h / 2, z] : [z, y + h / 2, p + t / 2], std(pal[Math.floor(rnd() * pal.length)], .8));
    named(bk, `book-${n++}`, { type: 'dynamic', shape: 'box', mass: .5, surface: 'cardboard' }); g.add(bk); p += t + .002;
  }
}

function frame(w: number, h: number, art: THREE.Texture, black = true) {
  const g = new THREE.Group();
  g.add(box([w, h, .03], [0, 0, 0], black ? M.black : M.white),
    place(new THREE.Mesh(new THREE.PlaneGeometry(w * .82, h * .82), new THREE.MeshStandardMaterial({ map: art, roughness: .5 })), [0, 0, .0161]));
  g.add(place(new THREE.Mesh(new THREE.PlaneGeometry(w * .9, h * .9), M.paper), [0, 0, .0158]));
  return g;
}

export default async function build(scan: ScanJson & { photos?: { position: number[]; forward: number[]; up: number[]; fovY: number; aspect: number }[] }): Promise<BuiltRoom> {
  seed = 7;
  // RoomPlan reads framed art on the -x wall as a window; the photos show solid wall.
  const solid = { ...scan, walls: scan.walls.map(w => ({ ...w, openings: w.openings.filter(o => o.kind !== 'window') })) };
  const room = await scanRoom('studio', 'Studio', solid).build();
  const { group } = room;
  // drop the generic furniture boxes; keep shell, floor and ceiling
  for (const c of [...group.children]) if (/^(table|sofa|storage|television|chair)-\d+$/.test(c.name)) group.remove(c);

  // --- shell finishes ---
  const dark = std('#ffffff', .95); dark.map = fabric();
  room.walls.forEach(({ group: wg }, i) => {
    const slab = wg.children[0] as THREE.Mesh;
    slab.material = i === 0 || i === 2 ? dark : std('#f2f1ee', .9);
  });
  const floor = group.getObjectByName('floor') as THREE.Mesh; floor.material = std('#ffffff', .45); (floor.material as THREE.MeshStandardMaterial).map = oakFloor();
  (room.ceiling[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 1, side: THREE.BackSide });
  // baseboards
  for (const [w, d, x, z] of [[2 * X, .02, 0, Z - .01], [2 * X, .02, 0, -Z + .01], [.02, 2 * Z, X - .01, 0], [.02, 2 * Z, -X + .01, 0]] as const)
    group.add(named(box([w, .09, d], [x, .045, z], M.white), 'baseboard', { type: 'none' }));

  // --- tray ceiling with LED cove (the blue line in the photos) ---
  const led = new THREE.MeshBasicMaterial({ color: '#9ec2ff' });
  const inset = .2, drop = .07;
  group.add(named(box([2 * (X - inset), drop, 2 * (Z - inset)], [0, H - drop / 2, 0], std('#f4f2ee', 1)), 'ceiling-tray', { type: 'none' }));
  for (const [w, d, x, z] of [[2 * (X - inset) + .04, .025, 0, Z - inset + .0125], [2 * (X - inset) + .04, .025, 0, -Z + inset - .0125], [.025, 2 * (Z - inset), X - inset + .0125, 0], [.025, 2 * (Z - inset), -X + inset - .0125, 0]] as const)
    group.add(named(box([w, .012, d], [x, H - .006, z], led), 'led-cove', { type: 'none' }));
  const can = new THREE.Mesh(new THREE.CircleGeometry(.07, 24), new THREE.MeshBasicMaterial({ color: '#fff6e0' }));
  can.rotation.x = Math.PI / 2; can.position.set(0, H - drop - .002, -.1); group.add(named(can, 'recessed-light', { type: 'none' }));

  room.ceiling.push(...group.children.filter(c => ['ceiling-tray', 'led-cove', 'recessed-light'].includes(c.name)));

  // --- lights ---
  room.lights.clear();
  room.lights.add(new THREE.HemisphereLight('#e8eefc', '#cdbba0', 1.1));
  const key = new THREE.SpotLight('#fff1dc', 28, 7, 1.25, .8, 1.6); key.position.set(0, H - drop, -.1); key.target.position.set(0, 0, -.1);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); room.lights.add(key, key.target);
  for (const [x, z] of [[1.1, 1.3], [-1.1, 1.3], [1.1, -1.3], [-1.1, -1.3]]) room.lights.add(pointLight('#6f9bff', 3.2, 3.2, x, H - .2, z));

  // --- sofa against the art wall ---
  group.add(at(sofa(), .166, 1.505, Math.PI), at(throwPillow(.75, 1.55, .15), .75, 1.62, .15, .66));
  group.add(named(at(throwPillow(-.4, 1.62, -.1), -.4, 1.66, -.1, .66), 'pillow-2', { type: 'dynamic', shape: 'box', mass: .6, surface: 'soft' }));

  // --- L-shaped standing desk on the -x and north walls ---
  const desk = new THREE.Group(); const topY = .94;
  desk.add(box([.611, .04, 2.249], [-1.352, topY - .02, -.806], M.oak), box([.989, .04, .646], [-.569, topY - .02, -1.608], M.oak));
  standingDeskLeg(-1.352, -1.82, desk, topY, true); standingDeskLeg(-1.352, .2, desk, topY, true); standingDeskLeg(-.15, -1.62, desk, topY, false);
  desk.add(box([.5, .006, .3], [-1.3, topY + .003, -.3], std('#202225', .9)));
  group.add(named(desk, 'desk', stat));
  const tv = box([.04, .5, .8], [-1.63, 1.27, -.756], std('#08090b', .2, .2)); group.add(named(tv, 'tv-panel', stat));
  group.add(named(at(officeChair(), -1.0, -.806, -Math.PI / 2), 'office-chair', { type: 'dynamic', shape: 'box', mass: 9 }));
  for (const [n, size, c, p] of [['keyboard', [.42, .02, .14], '#e8e8ea', [-1.3, topY + .01, -.55]], ['mouse', [.06, .03, .1], '#2a2a2e', [-1.3, topY + .015, -.25]],
    ['speaker', [.12, .2, .12], '#141416', [-1.55, topY + .1, -1.4]], ['mug', [.08, .1, .08], '#c24a3a', [-.9, topY + .05, -1.5]]] as const)
    group.add(named(box([...size] as V3, [...p] as V3, std(c, .5)), n, { type: 'dynamic', shape: 'box', mass: .3 }));

  // pegboard + wire shelf above the corner of the desk
  const peg = new THREE.Group();
  peg.add(place(new THREE.Mesh(new THREE.BoxGeometry(.93, 1.0, .03), new THREE.MeshStandardMaterial({ map: pegboard(), roughness: .8 })), [-1.023, 1.45, -Z + .015]),
    box([.45, .03, .15], [-1.2, 1.2, -Z + .1], M.steel), box([.45, .2, .01], [-1.2, 1.3, -Z + .17], M.steel));
  group.add(named(peg, 'pegboard', stat));
  for (const [i, c] of ['#f0f0f0', '#c24a3a', '#3b6ea5', '#e0c060'].entries())
    group.add(named(box([.07, .12, .05], [-1.45 + i * .1, 1.33, -Z + .1], std(c, .6)), `pegboard-bin-${i}`, { type: 'dynamic', shape: 'box', mass: .2 }));

  // --- east wall: floating shelves over a butcher-block bench with clear bins ---
  const shelves = new THREE.Group();
  for (const y of [1.295, 1.645]) {
    shelves.add(box([.3, .035, 2.95], [X - .15, y, -.03], M.steel));
    for (const z of [-1.3, -.03, 1.25]) shelves.add(box([.04, .1, .04], [X - .03, y - .07, z], M.steel));
  }
  group.add(named(shelves, 'wall-shelves', stat));
  const books = new THREE.Group(); bookRun(books, -1.4, -.2, 1.313, X - .15, 'z'); bookRun(books, .35, 1.1, 1.313, X - .15, 'z');
  bookRun(books, -1.35, -.9, 1.663, X - .15, 'z'); group.add(books);
  group.add(named(box([.22, .12, .3], [X - .16, 1.8, .5], std('#2a2a2c', .4, .3)), 'camera', { type: 'dynamic', shape: 'box', mass: .8 }),
    named(box([.26, .11, .1], [X - .15, 1.375, -.75], std('#e8523a', .6)), 'sneaker-red', { type: 'dynamic', shape: 'box', mass: .4 }),
    named(box([.26, .11, .1], [X - .15, 1.775, .9], std('#f5f5f2', .6)), 'sneaker-white', { type: 'dynamic', shape: 'box', mass: .4 }));
  const bench = new THREE.Group(); const bt = .73;
  bench.add(box([.756, .04, 2.39], [1.28, bt - .02, -.558], M.oak));
  for (const z of [-1.7, .55]) bench.add(box([.05, bt - .04, .05], [1.55, (bt - .04) / 2, z], M.steel), box([.6, .04, .05], [1.3, .02, z], M.steel));
  group.add(named(bench, 'bench', stat));
  for (const [i, z] of [-1.45, -1.0, -.55].entries()) for (const y of [.12, .32, .52]) {
    group.add(named(box([.34, .17, .42], [1.4, y, z], M.bin), `clear-bin-${i}-${y}`, { type: 'dynamic', shape: 'box', mass: 2, surface: 'plastic' }));
  }
  group.add(named(box([.33, .2, .42], [1.3, bt + .1, -1.1], std('#17171a', .5)), 'printer', { type: 'dynamic', shape: 'box', mass: 6 }),
    named(box([.3, .01, .38], [1.2, bt + .005, -.4], std('#5db36a', .9)), 'cutting-mat', { type: 'dynamic', shape: 'box', mass: .5 }),
    named(box([.26, .03, .34], [1.25, bt + .03, .1], M.paper), 'paper-stack', { type: 'dynamic', shape: 'box', mass: .7, surface: 'cardboard' }));
  // wall pieces: flag, pennants, wall AC
  for (const [i, c] of ['#1d3a8a', '#f4f2ee', '#c0392b'].entries())
    group.add(named(box([.02, .55, .14], [X - .01, .98, -.35 + i * .14], std(c, .85)), `flag-${i}`, { type: 'none' }));
  for (const [i, c] of ['#c0392b', '#1d3a8a', '#1c1c1e', '#d9a521'].entries())
    group.add(named(box([.015, .16, .11], [X - .008, 1.12, -1.0 + i * .14], std(c, .8)), `pennant-${i}`, { type: 'none' }));
  group.add(named(box([.22, .3, .9], [X - .11, 2.1, -1.4], M.white), 'wall-ac', stat));
  // dog crate
  const crate = new THREE.Group(); crate.add(box([.55, .02, .75], [0, .02, 0], M.white), box([.55, .03, .75], [0, .7, 0], M.white),
    box([.03, .7, .75], [-.26, .36, 0], M.white), box([.03, .7, .75], [.26, .36, 0], M.white), box([.55, .5, .02], [0, .36, -.36], std('#cfd3d6', .5, .5)));
  group.add(named(at(crate, .62, -.2, -Math.PI / 2), 'dog-crate', { type: 'dynamic', shape: 'box', mass: 14 }));

  // --- doorway to the back room (black steel + glass, then a warm room with a drum kit) ---
  const frameX0 = -.17, frameX1 = X;
  const door = new THREE.Group();
  door.add(box([.04, 1.96, .05], [frameX0 + .02, .98, -Z + .03], M.steel), box([.04, 1.96, .05], [frameX1 - .02, .98, -Z + .03], M.steel),
    box([frameX1 - frameX0, .04, .05], [(frameX0 + frameX1) / 2, 1.94, -Z + .03], M.steel), box([.03, 1.9, .04], [(frameX0 + frameX1) / 2 + .1, .96, -Z + .03], M.steel),
    box([frameX1 - frameX0, .03, .04], [(frameX0 + frameX1) / 2, 1.0, -Z + .03], M.steel));
  door.add(box([frameX1 - frameX0 - .1, 1.9, .01], [(frameX0 + frameX1) / 2, .97, -Z + .035], M.glass));
  group.add(named(door, 'glass-door', { type: 'none' }));
  const back = new THREE.Group();
  const warm = std('#cfc29a', .9);
  back.add(box([3.4, .02, 3], [.7, -.01, -Z - 1.5], std('#d7b88a', .5)), box([3.4, 2.4, .05], [.7, 1.2, -Z - 3], warm), box([.05, 2.4, 3], [-1, 1.2, -Z - 1.5], warm), box([.05, 2.4, 3], [2.4, 1.2, -Z - 1.5], warm));
  for (const [r, x, z, y] of [[.22, .5, -Z - 1.2, .45], [.16, .1, -Z - 1.0, .8], [.2, 1.0, -Z - 1.0, .8]] as const) back.add(cylinder(r, .35, [x, y, z], std('#8a3b2b', .4)));
  back.add(box([.9, .06, .3], [1.6, .65, -Z - 1.8], std('#1c1c1e', .4)));
  group.add(named(back, 'back-room', stat));
  room.lights.add(pointLight('#ffd9a0', 6, 5, .7, 2.1, -Z - 1.5));
  group.add(named(box([.9, .012, .55], [.55, .006, -1.4], std('#8a2b24', .9)), 'door-mat', { type: 'none' }));

  // --- wall art ---
  const art: [number, number, number, number, number, string[], boolean][] = [
    // x, y, w, h, wall(2 = north-z), colors, busy
    [-1.2, 1.55, .5, .65, 2, ['#f0d9a8', '#d2552f', '#2a6f97'], false], [-.45, 1.65, .4, .5, 2, ['#e8d3c0', '#b5382c', '#2d5b7a'], true],
    [.55, 1.5, .55, .7, 2, ['#2f6aa7', '#d9a521', '#c0392b'], false], [1.2, 1.7, .35, .45, 2, ['#e8c6c0', '#7a2b4a'], true],
    [-.2, 1.2, .6, .6, 2, ['#a52a2a', '#222', '#eee'], false]];
  for (const [x, y, w, h, , cols, busy] of art) {
    const f = frame(w, h, poster(cols, busy)); f.rotation.y = Math.PI; f.position.set(x, y, Z - .02); group.add(named(f, 'wall-art', { type: 'none' }));
  }
  const flash = frame(.55, .85, poster(['#0e0e10', '#f0f0ec', '#c0392b'], true), true); flash.rotation.y = Math.PI / 2; flash.position.set(-X + .02, 1.45, 1.2); group.add(named(flash, 'flash-sheet', { type: 'none' }));
  const f2 = frame(.4, .5, poster(['#ead9c4', '#2d5b7a', '#b5382c']), true); f2.rotation.y = Math.PI / 2; f2.position.set(-X + .02, 1.7, .5); group.add(named(f2, 'wall-art', { type: 'none' }));
  const rifle = new THREE.Group();
  rifle.add(box([1.1, .035, .03], [0, 0, 0], std('#2a2a2c', .4, .6)), box([.4, .06, .035], [-.35, -.01, 0], M.wood), box([.2, .05, .03], [.45, 0, 0], M.wood));
  rifle.position.set(-.55, 1.08, Z - .03); group.add(named(rifle, 'rifle', { type: 'none' }));
  for (const s of [-1, 1]) { const tine = box([.04, .3, .02], [s * .14, .18, 0], M.white); tine.rotation.z = -s * .5; group.add(named(place(tine, [-1.0 + s * .1, 1.92, Z - .04]), 'antler', { type: 'none' })); }
  for (const [x, y, w, h, cols, busy] of [[.1, 1.95, .3, .38, ['#222', '#e8d3c0', '#b5382c'], true], [1.4, 1.35, .45, .6, ['#e0b34a', '#222', '#c0392b'], false], [-1.4, 1.0, .5, .5, ['#1c1c1e', '#e8e8e8', '#b5382c'], false]] as const) {
    const f = frame(w, h, poster([...cols], busy)); f.rotation.y = Math.PI; f.position.set(x, y, Z - .02); group.add(named(f, 'wall-art', { type: 'none' }));
  }

  // --- real objects cut from the photo reconstruction replace the stand-ins ---
  const props = await loadProps('studio');
  if (props.length) {
    const standIns = /^(sofa|pillow(-2)?|office-chair|keyboard|mouse|speaker|mug|book-\d+|camera|sneaker-(red|white)|printer|cutting-mat|paper-stack|flag-\d|pennant-\d)$/;
    for (const o of [...group.children]) { if (standIns.test(o.name)) group.remove(o); else if (o.children.length) for (const c of [...o.children]) if (standIns.test(c.name)) o.remove(c); }
    group.add(...props);
  }

  // --- reference + photos ---
  room.photos = (scan.photos ?? []).map((p, i): PhotoPose => ({ url: `/studio/photos/${String(i).padStart(4, '0')}.jpg`, position: p.position, forward: p.forward, up: p.up, fovY: p.fovY, aspect: p.aspect }));
  room.exposure = 1.05;
  room.camera.walk = [0, 1.6, .9]; room.camera.walkLook = [0, 1.4, -1.5];
  room.environment.intensity = .8;
  return room;
}
