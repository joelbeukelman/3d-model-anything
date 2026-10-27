import * as THREE from 'three';
import { loadProps } from '../scan-room/props';
import * as O from '../scan-room/objects';
import { scanRoom, type ScanJson } from '../scan-room';
import { box, cylinder, place, sphere, type V3 } from '../../packages/room-runtime/helpers';
import type { BuiltRoom, PhotoPose } from '../../packages/room-runtime/types';

/**
 * The workshop, rebuilt from the October 26 scan: a 9.5 × 1.8 m shed with a pegboard wall,
 * oak cabinets under a plywood counter, diamond-plate floor and lumber racks overhead.
 * Measured: shell, the door, cabinet runs and sink. Modeled from photos: tools, clutter, colors.
 * Approximate: every small object. The south side was never scanned, so the room is open there.
 */
const X0 = -4.754, X1 = 4.754, WALL = -0.8961, CAB_D = .665, FRONT = WALL + CAB_D, TOP = 3.24;

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const std = (color: string, roughness = .7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const named = <T extends THREE.Object3D>(o: T, name: string, physics?: object) => { o.name = name; if (physics) o.userData.physics = physics; return o; };
const dyn = (mass: number, surface?: string) => ({ type: 'dynamic' as const, shape: 'box' as const, mass, ...(surface ? { surface } : {}) });
const stat = { type: 'static' as const }, none = { type: 'none' as const };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); return t;
}
/** diamond plate: ~0.12 m repeat */
const diamondPlate = () => canvasTex(128, 128, g => {
  g.fillStyle = '#6c6e70'; g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (const [dx, dy, a] of [[0, 0, .6], [16, 16, -.6]] as const) {
    g.save(); g.translate(c * 32 + 16 + dx * .5, r * 32 + 16 + dy * .5); g.rotate(a); g.fillStyle = '#9a9c9e'; g.fillRect(-9, -2.5, 18, 5); g.restore();
  }
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(30,25,20,${rnd() * .10})`; g.fillRect(rnd() * 128, rnd() * 128, 2 + rnd() * 5, 2 + rnd() * 5); }
}, [1 / .5, 1 / .5]);
const pegboard = () => canvasTex(128, 128, g => {
  g.fillStyle = '#f0efe9'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#9b988f';
  for (let x = 8; x < 128; x += 16) for (let y = 8; y < 128; y += 16) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
}, [1 / .5, 1 / .5]);
const grain = (base: string) => canvasTex(128, 128, g => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 80; i++) { g.strokeStyle = `rgba(60,30,10,${.05 + rnd() * .12})`; g.beginPath(); const y = rnd() * 128; g.moveTo(0, y); g.bezierCurveTo(40, y + rnd() * 6 - 3, 90, y + rnd() * 6 - 3, 128, y + rnd() * 4 - 2); g.stroke(); }
}, [1, 1]);

const OAK = grain('#9a6a35'), PLY = grain('#c49a62'), RAW = grain('#b88a52');
const M = {
  oak: new THREE.MeshStandardMaterial({ map: OAK, roughness: .6 }), ply: new THREE.MeshStandardMaterial({ map: PLY, roughness: .8 }),
  raw: new THREE.MeshStandardMaterial({ map: RAW, roughness: .85 }), white: std('#efeee8', .5), knob: std('#f4f2ea', .35), steel: std('#8a8d90', .35, .8),
  black: std('#1d1e20', .6), dark: std('#2a2b2e', .7), card: std('#b78d58', .9),
};
const TOOL = ['#c5d92d', '#e8631a', '#c0392b', '#1d1e20', '#c5d92d', '#d8d8d4', '#3b6ea5', '#f2c230'];

function bucket(x: number, z: number, lid: string, h = .36) {
  const g = new THREE.Group(); g.add(cylinder(.15, h, [0, h / 2, 0], std('#f1f0ea', .5), 20, .13), cylinder(.152, .03, [0, h + .01, 0], std(lid, .5), 20));
  g.position.set(x, 0, z); return named(g, 'bucket', dyn(2.5, 'plastic'));
}
function paintCan(x: number, y: number, z: number, color: string) {
  const g = new THREE.Group(); g.add(cylinder(.12, .2, [0, .1, 0], std('#c9cbcd', .3, .8), 18), cylinder(.121, .09, [0, .1, 0], std(color, .6), 18));
  g.position.set(x, y, z); return named(g, 'paint-can', dyn(1.2, 'metal'));
}

export default async function build(scan: ScanJson & { photos?: { position: number[]; forward: number[]; up: number[]; fovY: number; aspect: number }[] }): Promise<BuiltRoom> {
  seed = 11;
  const room = await scanRoom('workshop', 'Workshop', scan).build();
  const { group } = room;
  for (const c of [...group.children]) if (/^(storage|sink)-\d+$/.test(c.name)) group.remove(c);

  // --- shell finishes ---
  room.walls.forEach(({ group: wg }, i) => { (wg.children[0] as THREE.Mesh).material = i === 0 ? new THREE.MeshStandardMaterial({ map: pegboard(), roughness: .8 }) : M.raw; });
  const floor = group.getObjectByName('floor') as THREE.Mesh; floor.material = new THREE.MeshStandardMaterial({ map: diamondPlate(), roughness: .5, metalness: .5 });
  (room.ceiling[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ map: grain('#7a5430'), roughness: 1, side: THREE.BackSide });
  // the pegboard stops at 2.4 m; plywood above (the scan's wall height is 3.24)
  group.add(named(box([X1 - X0, TOP - 2.4, .02], [0, (TOP + 2.4) / 2, WALL + .012], M.ply), 'upper-wall', none));
  // the door in the pegboard wall: a plain white door with a dark knob
  const door = scan.walls[0].openings.find(o => o.kind === 'door');
  if (door) {
    const dx = X0 + (door.u0 + door.u1) / 2;
    group.add(named(box([door.u1 - door.u0, door.v1, .05], [dx, door.v1 / 2, WALL - .005], M.white), 'door', stat),
      named(sphere(.035, [dx + (door.u1 - door.u0) / 2 - .09, 1.0, WALL + .04], M.black), 'door-knob', none));
  }

  // --- oak base cabinets under a plywood counter ---
  const cab = new THREE.Group(); const CX0 = .608 - 6.616 / 2, CX1 = .608 + 6.616 / 2, CH = .93;
  cab.add(box([CX1 - CX0, .1, CAB_D], [(CX0 + CX1) / 2, .05, WALL + CAB_D / 2], M.black), box([CX1 - CX0, CH - .1, CAB_D - .04], [(CX0 + CX1) / 2, .1 + (CH - .1) / 2, WALL + (CAB_D - .04) / 2], std('#6a4624', .7)));
  const units = Math.round((CX1 - CX0) / .6), uw = (CX1 - CX0) / units;
  for (let i = 0; i < units; i++) {
    const cx = CX0 + (i + .5) * uw;
    const drawer = O.oakDoor(uw - .02, .15, M.oak, M.knob, 'c'); drawer.position.set(cx, CH - .11, FRONT + .004);
    const door = O.oakDoor(uw - .02, CH - .36, M.oak, M.knob, i % 2 ? 'tl' : 'tr'); door.position.set(cx, .2 + (CH - .36) / 2, FRONT + .004);
    cab.add(drawer, door);
  }
  cab.add(box([CX1 - CX0 + .06, .045, CAB_D + .05], [(CX0 + CX1) / 2, CH + .0225, WALL + CAB_D / 2 + .02], M.ply));
  group.add(named(cab, 'base-cabinets', stat));
  const sink = O.sinkWithFaucet(); sink.position.set(1.912, CH + .045, WALL + .33); group.add(named(sink, 'sink', stat));

  // tall oak cabinet at the east end
  const tall = new THREE.Group(); tall.add(box([.799, 2.1, .69], [4.315, 1.05, -.551], M.oak), box([.36, 1.8, .02], [4.12, 1.0, -.2], std('#7a5128', .6)), box([.36, 1.8, .02], [4.51, 1.0, -.2], std('#7a5128', .6)));
  tall.add(sphere(.025, [4.3, 1.0, -.18], M.knob)); group.add(named(tall, 'tall-cabinet', stat));
  // upper cabinet, shelves and lumber racks overhead
  group.add(named(box([.8, .75, .38], [-2.55, 1.85, WALL + .19], M.oak), 'upper-cabinet', stat));
  for (let i = 0; i < 6; i++) group.add(named(box([.12, .03, .5], [-4 + i * 1.65, 2.55, WALL + .26], std('#e8631a', .5)), 'rack-bracket', none));
  for (const y of [2.58, 2.9]) for (let k = 0; k < 6; k++) group.add(named(box([1.3 + rnd() * .5, .09, .14 + rnd() * .06], [-4.1 + k * 1.6 + rnd() * .2, y, WALL + .2], pick([M.raw, M.ply, M.oak])), 'lumber', none));
  for (let i = 0; i < 9; i++) group.add(named(box([.07, .16, 1.78], [X0 + .4 + i * 1.05, TOP - .08, 0], std('#5b3d20', .9)), 'rafter', none));
  group.add(named(box([.01, .5, .9], [-1.3, 2.3, WALL + .02], std('#e0386a', .8)), 'flag-pink', none), named(box([.01, .55, .85], [.6, 2.35, WALL + .02], std('#e8d84a', .8)), 'flag-rainbow', none));

  // --- pegboard tools (hanging, decorative) ---
  for (let i = 0; i < 150; i++) {
    const w = .03 + rnd() * .12, h = .06 + rnd() * .22, x = X0 + .9 + rnd() * (X1 - X0 - 1.6);
    if ((x > 3.8 && x < 4.75) || (x > -3.45 && x < 3.85)) continue;  // hand-modeled tools cover the middle of the wall
    group.add(named(box([w, h, .05 + rnd() * .05], [x, 1.2 + rnd() * .95, WALL + .05], std(pick(TOOL), .55)), 'pegboard-tool', none));
  }
  // --- counter clutter (throwable) ---
  for (let i = 0; i < 38; i++) {
    const c = CX0 + .2 + rnd() * (CX1 - CX0 - .4); if (Math.abs(c - 1.912) < .3) continue;
    const kind = rnd(); const s: V3 = kind < .45 ? [.2 + rnd() * .12, .12 + rnd() * .08, .16 + rnd() * .1] : kind < .75 ? [.28 + rnd() * .2, .2 + rnd() * .2, .24 + rnd() * .1] : [.1 + rnd() * .1, .08 + rnd() * .22, .1 + rnd() * .1];
    const m = kind < .45 ? M.dark : kind < .75 ? M.card : std(pick(TOOL), .55);
    group.add(named(box(s, [c, CH + .045 + s[1] / 2, WALL + .2 + rnd() * .3], m), kind < .45 ? 'parts-bin' : kind < .75 ? 'cardboard-box' : 'power-tool', dyn(.8 + rnd() * 2, kind < .75 ? 'cardboard' : 'plastic')));
  }
  const saw = box([.5, .26, .2], [-1.2, CH + .045 + .13, WALL + .45], std('#e8631a', .5)); group.add(named(saw, 'chainsaw', dyn(6, 'plastic')));

  // --- floor clutter (throwable) ---
  group.add(bucket(-3.05, -.3, '#2f5fb0'), bucket(-2.7, -.35, '#f1f0ea'), bucket(-2.95, -.05, '#2f5fb0'));
  const tank = new THREE.Group(); tank.add(cylinder(.16, .45, [0, .3, 0], std('#e4e6e2', .45), 20), sphere(.16, [0, .52, 0], std('#e4e6e2', .45)), cylinder(.1, .05, [0, .03, 0], std('#c8cac6', .4), 16));
  tank.position.set(-2.1, 0, -.35); group.add(named(tank, 'propane-tank', dyn(8, 'metal')));
  group.add(paintCan(-1.4, 0, -.38, '#b53a2a'), paintCan(-1.1, 0, -.3, '#2d5f7a'), paintCan(-1.4, .2, -.38, '#b53a2a'), paintCan(0.4, 0, -.35, '#eee'));
  const gas = box([.28, .38, .16], [1.5, .19, -.28], std('#c0392b', .5)); group.add(named(gas, 'gas-can', dyn(2, 'plastic')));
  const comp = new THREE.Group(); comp.add(cylinder(.23, .9, [0, .55, 0], std('#b22222', .4), 24), cylinder(.2, .08, [0, .08, 0], M.black, 20), cylinder(.2, .14, [0, 1.07, 0], std('#b22222', .4), 20));
  comp.add(place(new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .1, 24), M.black), [0, 1.4, 0])); comp.position.set(-4.3, 0, -.35); comp.children[3].rotation.x = Math.PI / 2;
  group.add(named(comp, 'compressor', dyn(35, 'metal')));
  for (let i = 0; i < 4; i++) { const l = box([.05, 2.0, .09], [3.55 + i * .06, 1.0, -.3], M.raw); l.rotation.z = .08; group.add(named(l, 'lumber-leaning', dyn(3, 'wood'))); }
  const roll = cylinder(.2, 1.4, [-3.65, .7, -.55], std('#7a8a6a', .95), 16); group.add(named(roll, 'rolled-carpet', dyn(15, 'soft')));
  for (let i = 0; i < 10; i++) group.add(named(box([.22 + rnd() * .2, .12 + rnd() * .2, .2 + rnd() * .2], [-.6 + rnd() * 4.4, .1 + rnd() * .1, -.2 + rnd() * .5], pick([M.card, M.dark, std('#f1f0ea', .6)])), 'floor-box', dyn(2, 'cardboard')));

  // --- real objects cut from the photo reconstruction, minus whatever is modeled by hand below ---
  const handFloor: [number, number][] = [[-4.45, -.55], [-4.4, .1], [-4.25, .25], [-3.05, -.3], [-2.7, -.35], [-2.95, -.05], [-2.1, -.35], [-1.4, -.38], [-1.1, -.3], [-1.4, .0], [.4, -.35]];
  const props = await loadProps('workshop', p => (p.pivot[1] > 1.15 && p.pivot[2] < -.5) ||
    (p.pivot[1] < .4 && handFloor.some(([x, z]) => Math.hypot(p.pivot[0] - x, p.pivot[2] - z) < .3)) || (Math.hypot(p.pivot[0] - 3.3, p.pivot[2] + .55) < .5 && p.pivot[1] > .9));
  const standIns = /^(parts-bin|cardboard-box|power-tool|chainsaw|bucket|propane-tank|paint-can|gas-can|compressor|lumber-leaning|rolled-carpet|floor-box)$/;
  if (props.length) {
    for (const o of [...group.children]) if (standIns.test(o.name) && !/^(lumber-leaning|rolled-carpet|floor-box|parts-bin|cardboard-box|power-tool)$/.test(o.name)) group.remove(o);
    for (const o of [...group.children]) if (/^(parts-bin|cardboard-box|power-tool|lumber-leaning|rolled-carpet|floor-box)$/.test(o.name)) group.remove(o);
    group.add(...props);
  }
  const place3 = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0, physics?: object) => { o.position.set(x, y, z); o.rotation.y = ry; if (physics) o.userData.physics = physics; group.add(o); return o; };
  for (const o of [...group.children]) if (/^(bucket|propane-tank|paint-can|gas-can|compressor)$/.test(o.name)) group.remove(o);
  place3(O.compressor(), -4.45, 0, -.55, Math.PI / 2, { type: 'dynamic', shape: 'box', mass: 35, surface: 'metal' });
  place3(O.hoseReel(), X0 + .01, 1.45, -.3, Math.PI / 2, { type: 'static' });
  place3(O.gasCan(), -4.4, 0, .1, .4, dyn(2, 'plastic')); place3(O.gasCan(), -4.25, 0, .25, -.3, dyn(2, 'plastic'));
  place3(O.bucket('#2f5fb0'), -3.05, 0, -.3, 0, dyn(2.5, 'plastic')); place3(O.bucket('#f1f0ea'), -2.7, 0, -.35, 0, dyn(2.5, 'plastic')); place3(O.bucket('#2f5fb0', true), -2.95, 0, -.05, 0, dyn(2.5, 'plastic'));
  place3(O.propaneTank(), -2.1, 0, -.35, 0, dyn(8, 'metal'));
  for (const [x, y, z, c] of [[-1.4, 0, -.38, '#b53a2a'], [-1.1, 0, -.3, '#2d5f7a'], [-1.4, .2, -.38, '#b53a2a'], [.4, 0, -.35, '#e8e8e8']] as const) place3(O.paintCan(c), x, y, z, rnd() * 6, dyn(1.2, 'metal'));
  place3(O.huskvarnaChainsaw(), 3.3, CH + .045, -.55, .2, dyn(6, 'plastic'));

  // --- hand-modeled pegboard tools, in the order they hang on the wall (door end → east end) ---
  const hung: [number, number][] = [];
  const PZ = WALL + .03, hang = (o: THREE.Object3D, x: number, y: number, ry = 0) => { hung.push([x, y]); o.position.set(x, y, PZ); o.rotation.z = ry; o.userData.physics = { type: 'dynamic', shape: 'box', mass: 1.2, wakeOnSupportLoss: false, wakeOnImpact: true }; group.add(o); return o; };
  hang(O.earDefenders(), -3.3, 1.78); hang(O.blackBag(), -3.4, 1.5);
  for (let i = 0; i < 5; i++) hang(O.ryobiBattery(), -3.15 + i * .11, 1.62);
  for (let i = 0; i < 4; i++) hang(O.ryobiBattery(), -3.1 + i * .11, 1.46);
  hang(O.ryobiCharger(), -2.5, 1.58); hang(O.ryobiCharger(), -2.5, 1.38);
  hang(O.socketRail(), -1.9, 1.92); hang(O.ryobiDrill(), -2.0, 1.5); hang(O.ryobiCircularSaw(), -1.75, 1.25);
  hang(O.wrenchRack(9), -1.45, 1.55); hang(O.pliers(), -1.1, 1.4); hang(O.hoseCoil(), -1.65, 1.05);
  hang(O.hardHat('#f26a1b', true), -.75, 1.92); hang(O.tapeRolls(), -.5, 1.4, 0); hang(O.ropeSpool(), -.28, 1.28);
  hang(O.ryobiReciprocatingSaw(), .25, 1.6); hang(O.ryobiJigsaw(), .55, 1.42); hang(O.ryobiDrill(), .85, 1.58); hang(O.ryobiCharger(), .95, 1.3);
  hang(O.chainsawBar(.5), 1.05, 1.62, Math.PI / 2); hang(O.tinSnips(), .35, 1.28); hang(O.screwdrivers(6), .55, 1.18);
  hang(O.ryobiNailer(), 1.45, 1.6); hang(O.ryobiNailer(), 1.5, 1.34); hang(O.ryobiBeltSander(), 1.9, 1.58); hang(O.ryobiCircularSaw(), 1.9, 1.3);
  hang(O.hoseCoil('#161718', .12), 2.3, 1.5); hang(O.hedgeTrimmer(.55), 2.55, 1.22); hang(O.tinSnips(), 2.15, 1.82);
  hang(O.hardHat('#f2c40f'), 3.15, 1.95); hang(O.cowboyHat(), 2.95, 1.62); hang(O.hoseCoil('#e9e5d8', .1), 3.45, 1.5);
  // fill the gaps the way the real wall is filled: lots of small tools between the big ones
  const filler = [() => O.ryobiBattery(), () => O.pliers(), () => O.tinSnips(), () => O.screwdrivers(5), () => O.tapeRolls(), () => O.ryobiCharger(), () => O.ryobiDrill(), () => O.ryobiJigsaw(), () => O.earDefenders(), () => O.wrenchRack(6), () => O.ryobiBattery()];
  for (let x = -3.35; x < 3.8; x += .2) for (const y of [1.2, 1.42, 1.64, 1.86, 2.05]) {
    if (hung.some(([hx, hy]) => Math.abs(hx - x) < .19 && Math.abs(hy - y) < .17) || rnd() < .45) continue;
    hang(pick(filler)(), x + (rnd() - .5) * .05, y);
  }
  hang(O.sandpaperPack(), 3.05, 1.28); hang(O.sandpaperPack(), 3.25, 1.28); hang(O.ryobiDrill(), 3.55, 1.7); hang(O.hedgeTrimmer(.45), 3.55, 1.15);

  // --- lighting: warm shop lights along the ceiling ---
  room.lights.clear();
  room.lights.add(new THREE.HemisphereLight('#fff4e0', '#9a8a70', 1.35));
  for (let i = 0; i < 4; i++) {
    const s = new THREE.SpotLight('#fff0d0', 40, 8, 1.2, .9, 1.5); s.position.set(X0 + 1.2 + i * 2.5, TOP - .1, -.2); s.target.position.set(s.position.x, 0, -.3); s.castShadow = i % 2 === 0; s.shadow.mapSize.set(1024, 1024);
    room.lights.add(s, s.target);
  }
  for (let i = 0; i < 4; i++) group.add(named(box([.9, .04, .12], [X0 + 1.2 + i * 2.5, TOP - .03, -.2], new THREE.MeshBasicMaterial({ color: '#fffbe8' })), 'shop-light', none));

  room.photos = (scan.photos ?? []).map((p, i): PhotoPose => ({ url: `/workshop/photos/${String(i).padStart(4, '0')}.jpg`, position: p.position, forward: p.forward, up: p.up, fovY: p.fovY, aspect: p.aspect }));
  room.exposure = 1.1; room.environment.intensity = .7;
  room.camera.walk = [3.2, 1.6, .3]; room.camera.walkLook = [-1.5, 1.4, -.5];
  return room;
}
