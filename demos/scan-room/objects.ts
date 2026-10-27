import * as THREE from 'three';
import { box, cushion, cylinder, lathe, mesh, place, sphere, tube, type V3 } from '../../packages/room-runtime/helpers';

/**
 * Hand-modeled objects, built from the reference photos. Every builder returns a Group whose origin is
 * the object's base center, front toward local +z, units in meters. Callers position it and set
 * `userData.physics`. These replace the generic boxes and the rough photo cutouts for the objects
 * that matter most.
 */

const std = (color: string, roughness = .6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const grp = (name: string, ...kids: THREE.Object3D[]) => { const g = new THREE.Group(); g.name = name; g.add(...kids); return g; };
const shadowed = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { if (c instanceof THREE.Mesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ───────────────────────────── studio ─────────────────────────────

/** Black tufted sofa on tapered walnut legs, with rolled arms, a white pillow, a striped pillow and a bolster. */
export function tuftedSofa(w = 1.85, d = .85): THREE.Group {
  const leather = std('#20242c', .42, 0, { sheen: .5, sheenColor: new THREE.Color('#4a5568') } as THREE.MeshStandardMaterialParameters);
  const wood = std('#7a4e2a', .5);
  const g = grp('sofa');
  // tapered legs, splayed outward
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = cylinder(.022, .2, [0, .1, 0], wood, 12, .013); leg.position.set(sx * (w / 2 - .12), .1, sz * (d / 2 - .1));
    leg.rotation.z = -sx * .12; leg.rotation.x = sz * .12; g.add(leg);
  }
  g.add(cushion([w - .04, .12, d - .04], [0, .24, 0], .03, std('#16181d', .6)));            // frame / skirt
  g.add(cushion([w - .26, .17, d - .22], [0, .39, .05], .06, leather));                    // seat deck
  // tufted back: subdivided slab, pinched at a diamond lattice of buttons
  const bw = w - .1, bh = .5, bd = .15;
  const geo = new THREE.BoxGeometry(bw, bh, bd, 46, 16, 3);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < bd / 2 - 1e-4) continue;
    const x = pos.getX(i), y = pos.getY(i);
    let dip = 0;
    for (let row = 0; row < 3; row++) for (let col = -5; col <= 5; col++) {
      const bx = col * .15 + (row % 2 ? .075 : 0), by = -.14 + row * .15 + .04;
      if (Math.abs(bx) > bw / 2 - .05) continue;
      dip = Math.max(dip, Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / .0011));
    }
    pos.setZ(i, pos.getZ(i) - dip * .035);
  }
  geo.computeVertexNormals();
  const back = mesh(geo, leather); back.position.set(0, .7, -d / 2 + .11); g.add(back);
  for (let row = 0; row < 3; row++) for (let col = -5; col <= 5; col++) {
    const bx = col * .15 + (row % 2 ? .075 : 0); if (Math.abs(bx) > bw / 2 - .05) continue;
    g.add(sphere(.012, [bx, .7 - .21 + row * .15 + .04, -d / 2 + .11 + bd / 2 - .028], std('#0e0f12', .4)));
  }
  // seat cushions (two) and rolled arms
  for (const x of [-.36, .36]) g.add(cushion([.7, .13, .62], [x, .5, .1], .05, leather));
  for (const sx of [-1, 1]) {
    g.add(cushion([.16, .36, d - .12], [sx * (w / 2 - .09), .42, 0], .05, leather));
    const roll = cylinder(.085, d - .12, [0, 0, 0], leather, 20); roll.rotation.x = Math.PI / 2; roll.position.set(sx * (w / 2 - .09), .62, 0); g.add(roll);
  }
  // pillows
  const stripes = canvasTex(128, 128, c => { c.fillStyle = '#efece6'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#17181b'; for (let x = 20; x < 128; x += 40) c.fillRect(x, 0, 18, 128); });
  const white = cushion([.46, .4, .13], [0, 0, 0], .05, std('#f4f1ea', .95)); white.position.set(-.62, .76, .06); white.rotation.set(-.32, .5, -.25); white.name = 'pillow-white';
  const striped = cushion([.4, .32, .12], [0, 0, 0], .05, new THREE.MeshStandardMaterial({ map: stripes, roughness: .9 })); striped.position.set(.4, .72, -.14); striped.rotation.set(-.15, -.3, .1); striped.name = 'pillow-striped';
  const bolster = cylinder(.07, .42, [0, 0, 0], std('#1d2128', .6), 18); bolster.position.set(w / 2 - .3, .66, .05); bolster.rotation.set(Math.PI / 2, 0, .5);
  g.add(white, striped, bolster);
  return shadowed(g);
}

/** Tall mesh drafting chair with a chrome foot ring and 5-star caster base. */
export function draftingChair(): THREE.Group {
  const black = std('#1c1d20', .5), steel = std('#b9bcc0', .25, .9), mesh_ = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: .8, transparent: true, opacity: .72, side: THREE.DoubleSide });
  const gray = std('#5d6166', .45, .2);
  const g = grp('office-chair');
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const arm = box([.32, .03, .05], [Math.cos(a) * .16, .09, Math.sin(a) * .16], black); arm.rotation.y = -a; g.add(arm);
    g.add(cylinder(.026, .045, [Math.cos(a) * .31, .04, Math.sin(a) * .31], black, 14));
    g.add(sphere(.02, [Math.cos(a) * .31, .02, Math.sin(a) * .31], std('#0b0b0c', .4)));
    const strut = box([.2, .012, .012], [Math.cos(a) * .17, .3, Math.sin(a) * .17], steel); strut.rotation.y = -a; strut.rotation.z = .35; g.add(strut);
  }
  const ring = place(mesh(new THREE.TorusGeometry(.27, .011, 10, 40), steel), [0, .28, 0]); ring.rotation.x = Math.PI / 2; g.add(ring);
  g.add(cylinder(.032, .5, [0, .38, 0], std('#0c0c0d', .4), 16), cylinder(.045, .2, [0, .5, 0], std('#1a1a1c', .5), 16, .05));
  g.add(cushion([.18, .07, .24], [0, .65, -.02], .02, gray));                                  // tilt mechanism
  g.add(cushion([.5, .045, .48], [0, .7, .03], .02, mesh_));                                    // mesh seat
  g.add(box([.5, .02, .03], [0, .69, .27], gray), box([.5, .02, .03], [0, .69, -.21], gray), box([.03, .02, .46], [-.25, .69, .03], gray), box([.03, .02, .46], [.25, .69, .03], gray));
  // back: two frame uprights joined by a mesh panel, with a lumbar pad
  for (const s of [-1, 1]) { const up = box([.03, .66, .03], [s * .24, 1.04, -.24], gray); up.rotation.x = -.12; g.add(up); }
  const panel = mesh(new THREE.PlaneGeometry(.46, .6), mesh_); panel.position.set(0, 1.05, -.255); panel.rotation.x = -.12; g.add(panel);
  const top = box([.5, .035, .04], [0, 1.38, -.285], gray); top.rotation.x = -.12; g.add(top);
  g.add(cushion([.4, .12, .05], [0, .93, -.235], .02, gray));
  // T-arms
  for (const s of [-1, 1]) g.add(box([.025, .26, .025], [s * .28, .83, -.02], gray), cushion([.07, .025, .26], [s * .28, .96, .0], .01, black));
  return shadowed(g);
}

/** Monitor on a desk-edge clamp arm. Faces local +z; the arm clamps to the desk behind it (-z). */
export function monitorOnArm(w = .85, h = .5, centerY = .33): THREE.Group {
  const black = std('#17181a', .35, .6);
  const g = grp('monitor');
  g.add(box([w, h, .022], [0, centerY, .05], std('#0a0b0d', .12, .1)),
    place(new THREE.Mesh(new THREE.PlaneGeometry(w - .03, h - .03), new THREE.MeshStandardMaterial({ color: '#05070a', roughness: .08, metalness: .3, emissive: '#04070c', emissiveIntensity: .6 })), [0, centerY, .0625]),
    box([.16, .12, .04], [0, centerY, .02], black));
  g.add(cylinder(.016, centerY - .03, [0, (centerY - .03) / 2, -.07], black, 12));                  // post
  g.add(tube([[0, centerY - .03, -.07], [0, centerY, -.03], [0, centerY, .01]], .014, black, 8));    // arm to the mount
  g.add(box([.06, .06, .08], [0, -.03, -.07], black), box([.08, .008, .08], [0, .004, -.07], black)); // desk-edge clamp
  return shadowed(g);
}

/** White wooden dog kennel with a wire door, flat top used as a work surface. */
export function dogCrate(w = .6, h = .72, d = .75): THREE.Group {
  const white = std('#efeee9', .55), wire = std('#16171a', .4, .6);
  const g = grp('dog-crate');
  g.add(box([w, .035, d], [0, h - .0175, 0], white), box([w, .05, d], [0, .025, 0], std('#dad9d3', .7)));
  g.add(box([.03, h - .08, d], [-w / 2 + .015, h / 2, 0], white), box([.03, h - .08, d], [w / 2 - .015, h / 2, 0], white), box([w - .06, h - .08, .025], [0, h / 2, -d / 2 + .0125], white));
  g.add(box([w - .06, .06, .03], [0, h - .09, d / 2 - .015], white), box([w - .06, .06, .03], [0, .08, d / 2 - .015], white), box([.06, h - .16, .03], [-w / 2 + .06, h / 2, d / 2 - .015], white), box([.06, h - .16, .03], [w / 2 - .06, h / 2, d / 2 - .015], white));
  // wire door grid
  const dw = w - .18, dh = h - .26;
  for (let i = 0; i <= 14; i++) g.add(cylinder(.0035, dh, [-dw / 2 + i * dw / 14, h / 2, d / 2 - .012], wire, 6));
  for (let j = 0; j <= 5; j++) { const bar = cylinder(.0035, dw, [0, .13 + j * dh / 5, d / 2 - .012], wire, 6); bar.rotation.z = Math.PI / 2; g.add(bar); }
  g.add(box([.03, .06, .02], [dw / 2 + .02, h / 2, d / 2], std('#c8cacd', .3, .8)));
  // vent cutouts on the side (dark slots)
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) g.add(box([.032, .05, .12], [s * (w / 2 - .005), h * .55, -.2 + k * .14], std('#2a2a2c', .9)));
  return shadowed(g);
}

/** Wall-mounted split AC indoor unit. Faces local +z. */
export function wallAC(w = .9, h = .29, d = .22): THREE.Group {
  const white = std('#f3f4f2', .35);
  const g = grp('wall-ac');
  g.add(cushion([w, h, d], [0, h / 2, d / 2], .09, white, 6));
  g.add(box([w - .1, .02, .01], [0, .07, d - .004], std('#d9dbd9', .5)));
  g.add(box([w - .14, .018, .12], [0, .03, d * .62], std('#1a1b1d', .7)));                      // louver slot
  g.add(box([.05, .012, .006], [w / 2 - .1, h * .6, d - .002], new THREE.MeshBasicMaterial({ color: '#4aa8ff' })));
  g.add(box([.2, .035, .004], [-w / 2 + .17, h * .6, d - .0015], std('#b8bab8', .5)));
  return shadowed(g);
}

// ──────────────────────────── workshop ────────────────────────────

/** Red Craftsman upright air compressor with a black pump head and a pull handle. */
export function compressor(): THREE.Group {
  const red = std('#b3201d', .38, .1), black = std('#18191b', .55);
  const label = canvasTex(256, 64, c => { c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#b3201d'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('CRAFTSMAN', 128, 46); });
  const g = grp('compressor');
  g.add(lathe([[0, .12], [.2, .12], [.255, .2], [.27, .3], [.27, .95], [.25, 1.06], [.19, 1.12], [.0, 1.14]].map(([r, y]) => [r, y] as [number, number]), red, 32));
  const band = mesh(new THREE.CylinderGeometry(.272, .272, .12, 32, 1, true), new THREE.MeshStandardMaterial({ map: label, roughness: .5 })); band.position.y = .66; band.rotation.y = Math.PI; g.add(band);
  for (const [x, z] of [[-.16, -.16], [.16, -.16], [-.16, .16], [.16, .16]]) { g.add(cylinder(.025, .12, [x, .06, z], black, 10)); }
  g.add(cylinder(.15, .07, [0, 1.16, 0], black, 24), place(new THREE.Mesh(new THREE.BoxGeometry(.3, .16, .22), black), [0, 1.26, 0]));
  g.add(cylinder(.075, .1, [0, 1.38, 0], std('#2e3033', .4, .5), 16));
  const handle = tube([[-.22, 1.18, -.05], [-.25, 1.42, -.05], [.25, 1.42, -.05], [.22, 1.18, -.05]], .014, black, 24); g.add(handle);
  const gauge = cylinder(.04, .03, [.17, 1.22, .15], std('#dedfe0', .3, .5), 20); gauge.rotation.x = Math.PI / 2; g.add(gauge);
  g.add(cylinder(.02, .06, [-.17, 1.2, .14], std('#d8a520', .35, .8), 12));
  return shadowed(g);
}

/** Wall-mounted black hose reel with a coil of yellow hose. Faces local +z. */
export function hoseReel(): THREE.Group {
  const black = std('#16171a', .5), yellow = std('#e3c11c', .5);
  const g = grp('hose-reel');
  const body = cylinder(.24, .12, [0, 0, .08], black, 36); body.rotation.x = Math.PI / 2; g.add(body);
  const hub = cylinder(.07, .15, [0, 0, .1], std('#2a2b2e', .4, .5), 20); hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < 4; i++) { const t = place(new THREE.Mesh(new THREE.TorusGeometry(.17 - i * .015, .012, 8, 36), yellow), [0, 0, .145]); g.add(t); }
  g.add(box([.2, .08, .04], [0, 0, .01], black), tube([[0, -.2, .12], [-.04, -.34, .15], [-.02, -.55, .17]], .012, yellow, 16));
  return shadowed(g);
}

/** Red plastic jerry can with handle and spout. */
export function gasCan(): THREE.Group {
  const red = std('#c4281f', .45);
  const g = grp('gas-can');
  g.add(cushion([.3, .36, .14], [0, .19, 0], .025, red), box([.22, .02, .1], [0, .385, 0], red));
  const handle = tube([[-.08, .38, 0], [-.07, .47, 0], [.02, .47, 0], [.08, .38, 0]], .015, red, 14); g.add(handle);
  const spout = cylinder(.022, .12, [.11, .46, 0], std('#e9ddc0', .5), 12); spout.rotation.z = -.6; g.add(spout);
  g.add(cylinder(.022, .03, [.12, .4, 0], std('#f1c40f', .5), 12));
  g.add(box([.2, .1, .002], [0, .2, .071], std('#f3efe2', .6)));
  return shadowed(g);
}

/** 20 lb propane cylinder: dome top, collar guard with handle, valve, foot ring. */
export function propaneTank(): THREE.Group {
  const body = std('#dcdcd6', .45, .15), dark = std('#8c8d88', .5, .3);
  const g = grp('propane-tank');
  g.add(lathe([[0, .04], [.11, .04], [.12, .09], [.15, .1], [.15, .4], [.14, .46], [.1, .5], [0, .52]].map(([r, y]) => [r, y] as [number, number]), body, 32));
  g.add(place(new THREE.Mesh(new THREE.TorusGeometry(.115, .01, 8, 28), dark), [0, .08, 0]));
  const foot = place(new THREE.Mesh(new THREE.TorusGeometry(.11, .012, 8, 28), dark), [0, .045, 0]); foot.rotation.x = Math.PI / 2; foot.position.y = .045; g.add(foot);
  const collar = place(new THREE.Mesh(new THREE.TorusGeometry(.085, .012, 8, 24), dark), [0, .58, 0]); collar.rotation.x = Math.PI / 2; g.add(collar);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; g.add(cylinder(.01, .12, [Math.cos(a) * .085, .54, Math.sin(a) * .085], dark, 6)); }
  g.add(cylinder(.025, .05, [0, .55, 0], std('#c9a227', .35, .8), 12), cylinder(.045, .02, [0, .585, 0], std('#c0392b', .5), 16));
  return shadowed(g);
}

/** White 5-gallon bucket with a wire handle and a colored lid. */
export function bucket(lid = '#2f5fb0', open = false): THREE.Group {
  const white = std('#f2f1ec', .5);
  const g = grp('bucket');
  g.add(lathe([[0, 0], [.125, 0], [.145, .02], [.155, .36], [.16, .365], [.16, .38], [.15, .385], [.0, .385]].map(([r, y]) => [r, y] as [number, number]), white, 28));
  for (const y of [.1, .2, .3]) { const rib = place(new THREE.Mesh(new THREE.TorusGeometry(.15 + y * .03, .004, 6, 28), std('#dcdbd5', .6)), [0, y, 0]); rib.rotation.x = Math.PI / 2; g.add(rib); }
  if (!open) g.add(cylinder(.165, .035, [0, .395, 0], std(lid, .5), 28), cylinder(.12, .012, [0, .42, 0], std(lid, .5), 24));
  const handle = tube([[-.16, .3, 0], [-.12, .47, 0], [.12, .47, 0], [.16, .3, 0]], .004, std('#9aa0a5', .3, .9), 16); g.add(handle);
  g.add(place(new THREE.Mesh(new THREE.CylinderGeometry(.151, .157, .1, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: .6 })), [0, .22, 0]));
  return shadowed(g);
}

/** One-gallon-style steel paint can with a pressed lid, wire bail and a colored label. */
export function paintCan(label = '#2d5f7a', size = 1): THREE.Group {
  const steel = std('#c7c9cb', .3, .85), g = grp('paint-can');
  g.add(cylinder(.12 * size, .2 * size, [0, .1 * size, 0], steel, 28), cylinder(.122 * size, .1 * size, [0, .1 * size, 0], std(label, .55), 28));
  const rim = place(new THREE.Mesh(new THREE.TorusGeometry(.12 * size, .008 * size, 6, 28), steel), [0, .2 * size, 0]); rim.rotation.x = Math.PI / 2; g.add(rim);
  g.add(cylinder(.1 * size, .006, [0, .2 * size, 0], steel, 24));
  g.add(tube([[-.12 * size, .19 * size, 0], [0, .3 * size, 0], [.12 * size, .19 * size, 0]], .003, std('#8f9498', .3, .9), 14));
  return shadowed(g);
}

/** Ryobi-style lime tool kit pieces. Batteries, charger, drill and ear defenders; origin at the back plane. */
const LIME = std('#c5d92d', .45), TOOLBLK = std('#1b1c1e', .5);
export function ryobiBattery(): THREE.Group {
  return grp('battery', cushion([.07, .1, .07], [0, 0, .035], .01, TOOLBLK), cushion([.07, .045, .072], [0, .03, .036], .01, LIME), box([.05, .01, .02], [0, -.055, .035], std('#555', .5)));
}
export function ryobiCharger(): THREE.Group {
  return grp('charger', cushion([.16, .14, .09], [0, 0, .045], .015, LIME), box([.1, .05, .02], [0, -.02, .09], TOOLBLK), box([.02, .02, .005], [.05, .05, .092], new THREE.MeshBasicMaterial({ color: '#2ecc40' })));
}
export function ryobiDrill(): THREE.Group {
  const g = grp('drill');
  g.add(cushion([.2, .07, .07], [0, .1, .045], .02, LIME), cushion([.045, .13, .06], [.04, .01, .045], .012, TOOLBLK), cushion([.06, .04, .06], [.05, -.06, .045], .008, LIME));
  const chuck = cylinder(.022, .06, [-.13, .1, .045], std('#2a2b2e', .35, .7), 16); chuck.rotation.z = Math.PI / 2; g.add(chuck);
  return g;
}
export function earDefenders(): THREE.Group {
  const g = grp('ear-defenders');
  g.add(tube([[-.075, 0, .04], [-.07, .1, .04], [.07, .1, .04], [.075, 0, .04]], .006, std('#222', .5), 16));
  for (const s of [-1, 1]) g.add(cylinder(.05, .045, [s * .08, -.01, .04], std('#d6301d', .5), 18)).children.at(-1)!.rotation.x = Math.PI / 2;
  return g;
}

/** Oak raised-panel cabinet door (stiles + rails, recessed cathedral panel) and ceramic knob. Faces +z; origin = door center. */
export function oakDoor(w = .56, h = .62, mat: THREE.Material, knobMat: THREE.Material, knobAt: 'tl' | 'tr' | 'c' = 'tr'): THREE.Group {
  const g = grp('door'), s = .055, t = .022;
  g.add(box([w, s, t], [0, h / 2 - s / 2, 0], mat), box([w, s * 1.2, t], [0, -h / 2 + s * .6, 0], mat), box([s, h - s * 2.2, t], [-w / 2 + s / 2, 0, 0], mat), box([s, h - s * 2.2, t], [w / 2 - s / 2, 0, 0], mat));
  g.add(box([w - s * 2 + .01, h - s * 2.2, t * .45], [0, 0, -t * .2], mat), box([w - s * 2 - .06, h - s * 2.2 - .07, t * .5], [0, 0, t * .35], mat));
  const kx = knobAt === 'c' ? 0 : (knobAt === 'tr' ? 1 : -1) * (w / 2 - .07), ky = knobAt === 'c' ? 0 : h / 2 - .1;
  g.add(sphere(.02, [kx, ky, t * .9], knobMat), cylinder(.008, .02, [kx, ky, t * .6], std('#c2b59b', .4, .6), 8)).children.at(-1)!.rotation.x = Math.PI / 2;
  return g;
}

/** Stainless sink basin with a gooseneck faucet. Origin = center of the basin opening on the counter surface. */
export function sinkWithFaucet(w = .51, d = .5): THREE.Group {
  const steel = std('#aeb2b5', .25, .9);
  const g = grp('sink');
  g.add(box([w + .03, .012, d + .03], [0, .006, 0], steel));
  g.add(box([w - .04, .004, d - .04], [0, -.002, 0], std('#2a2d30', .6)));
  g.add(box([w - .04, .16, d - .04], [0, -.09, 0], std('#80858a', .35, .8)));
  g.add(cylinder(.03, .02, [0, .02, -d / 2 - .02], steel, 16), tube([[0, .03, -d / 2 - .02], [0, .28, -d / 2 - .02], [0, .36, -d / 2 + .06], [0, .3, -d / 2 + .16]], .012, steel, 20));
  g.add(box([.02, .06, .02], [.06, .06, -d / 2 - .02], steel), box([.02, .06, .02], [-.06, .06, -d / 2 - .02], steel));
  return shadowed(g);
}

// ─────────────────── pegboard tools (origin at the back plane, +z outward) ───────────────────

const ORANGE = std('#e8631a', .45), STEEL = std('#b4b8bc', .3, .85), DARK = std('#26272a', .55), RED = std('#c0281f', .5);

function lime(...kids: THREE.Object3D[]) { return shadowed(grp('tool', ...kids)); }

export function ryobiCircularSaw(): THREE.Group {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, .004, 36, 1, false, 0, Math.PI), STEEL); disc.rotation.set(Math.PI / 2, 0, 0); disc.position.set(0, -.03, .075);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .02, 36, 1, false, 0, Math.PI), std('#4a4d50', .4, .6)); guard.rotation.set(Math.PI / 2, 0, 0); guard.position.set(0, -.03, .075);
  return lime(cushion([.2, .1, .1], [.02, .06, .06], .02, LIME), cushion([.1, .12, .06], [-.07, .02, .05], .015, TOOLBLK), tube([[.07, .1, .06], [.1, .15, .06], [.0, .17, .06]], .012, TOOLBLK, 10), disc, guard,
    box([.1, .008, .13], [0, -.01, .07], STEEL));
}
export function ryobiReciprocatingSaw(): THREE.Group {
  return lime(cushion([.3, .065, .06], [0, 0, .04], .02, LIME), cushion([.07, .06, .07], [.18, -.03, .04], .02, TOOLBLK), cushion([.05, .1, .05], [.07, -.07, .04], .012, TOOLBLK), box([.28, .018, .004], [-.29, -.004, .04], STEEL), box([.02, .03, .04], [-.15, .0, .04], STEEL));
}
export function ryobiJigsaw(): THREE.Group {
  return lime(cushion([.22, .07, .07], [0, .02, .045], .02, LIME), tube([[.06, .055, .045], [.12, .12, .045], [.18, .1, .045], [.16, .04, .045]], .014, TOOLBLK, 12), box([.012, .1, .003], [-.07, -.07, .045], STEEL), box([.1, .006, .06], [-.07, -.12, .045], STEEL));
}
export function ryobiNailer(): THREE.Group {
  const barrel = cylinder(.04, .24, [0, .03, .05], LIME, 18); barrel.rotation.z = Math.PI / 2;
  return lime(barrel, cushion([.045, .14, .045], [.04, -.05, .05], .012, TOOLBLK), cushion([.1, .05, .06], [.05, -.13, .05], .01, LIME), box([.26, .02, .05], [-.04, -.04, .05], STEEL), box([.1, .018, .03], [-.17, -.005, .05], TOOLBLK));
}
export function ryobiBeltSander(): THREE.Group {
  const r1 = cylinder(.03, .08, [-.12, 0, .05], DARK, 16), r2 = cylinder(.03, .08, [.12, 0, .05], DARK, 16);
  return lime(cushion([.22, .07, .08], [0, .035, .05], .02, LIME), r1, r2, box([.24, .006, .08], [0, .03, .05], std('#3b3027', .9)), box([.24, .006, .08], [0, -.03, .05], std('#3b3027', .9)), tube([[.1, .07, .05], [.16, .13, .05], [.04, .13, .05]], .012, TOOLBLK, 8));
}
export function hedgeTrimmer(len = .6): THREE.Group {
  const g = grp('hedge-trimmer', cushion([.16, .07, .08], [0, 0, .05], .02, LIME), box([len, .012, .02], [-.08 - len / 2, 0, .05], STEEL));
  for (let i = 0; i < Math.floor(len / .03); i++) g.add(box([.012, .03, .006], [-.1 - i * .03, .0, .05], STEEL));
  return shadowed(g);
}
export function chainsawBar(len = .5): THREE.Group {
  const g = grp('chain-bar', box([len, .075, .01], [0, 0, .03], DARK), box([len - .02, .02, .014], [0, 0, .03], std('#8d9094', .3, .9)));
  g.add(sphere(.04, [-len / 2, 0, .03], ORANGE, [1, 1, .3]));
  for (let i = 0; i < Math.floor(len / .02); i++) g.add(box([.006, .012, .016], [-len / 2 + .02 + i * .02, .04, .03], STEEL));
  return shadowed(g);
}
export function hardHat(color = '#f26a1b', shield = false): THREE.Group {
  const m = std(color, .35, 0, { clearcoat: .5 } as THREE.MeshStandardMaterialParameters);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.12, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.set(1, .9, 1.1); dome.position.set(0, 0, .08);
  const brim = cylinder(.135, .012, [0, 0, .08], m, 28); brim.scale.set(1, 1, 1.15);
  const g = grp('hard-hat', dome, brim, box([.03, .02, .22], [0, .105, .08], m));
  if (shield) { const vis = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .17, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: '#111', roughness: .3, transparent: true, opacity: .75, side: THREE.DoubleSide })); vis.position.set(0, -.09, .09); g.add(vis); }
  return shadowed(g);
}
export function wrenchRack(n = 9): THREE.Group {
  const g = grp('wrench-rack', box([.3, .012, .012], [0, .14, .03], DARK));
  for (let i = 0; i < n; i++) {
    const len = .16 + (i % 5) * .02, x = -.13 + i * (.26 / (n - 1));
    g.add(box([.012, len, .004], [x, .14 - len / 2, .03], STEEL), box([.025, .03, .004], [x, .14 - len - .01, .03], STEEL), box([.007, .02, .004], [x - .006, .14 - len - .03, .03], STEEL), box([.007, .02, .004], [x + .006, .14 - len - .03, .03], STEEL));
  }
  return shadowed(g);
}
export function hoseCoil(color = '#161718', r = .1): THREE.Group {
  const g = grp('hose-coil'), m = std(color, .55);
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, .012, 8, 36), m); t.position.set(0, 0, .02 + i * .022); g.add(t); }
  return shadowed(g);
}
export function tapeRolls(): THREE.Group {
  const g = grp('tape');
  ['#c9a36a', '#2f6fb0', '#2f9a5a', '#ece9e0', '#2f6fb0'].forEach((c, i) => { const t = new THREE.Mesh(new THREE.TorusGeometry(.04, .02, 10, 26), std(c, .8)); t.position.set(0, 0, .03 + i * .042); g.add(t); });
  g.add(cylinder(.01, .24, [0, 0, .12], DARK, 8)).children.at(-1)!.rotation.x = Math.PI / 2;
  return shadowed(g);
}
export function ropeSpool(): THREE.Group {
  const tex = canvasTex(64, 64, c => { c.fillStyle = '#c4a87a'; c.fillRect(0, 0, 64, 64); c.strokeStyle = '#8a7048'; for (let y = 0; y < 64; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(64, y + 2); c.stroke(); } });
  const c = cylinder(.07, .08, [0, 0, .06], new THREE.MeshStandardMaterial({ map: tex, roughness: .95 }), 24); c.rotation.x = Math.PI / 2;
  return shadowed(grp('rope-spool', c, ...[-.045, .045].map(z => { const f = cylinder(.085, .008, [0, 0, .06 + z], std('#4a4d50', .5, .5), 24); f.rotation.x = Math.PI / 2; return f; })));
}
export function pliers(color = '#c0281f'): THREE.Group {
  const h = std(color, .5);
  return shadowed(grp('pliers', box([.02, .12, .015], [-.012, -.06, .03], h), box([.02, .12, .015], [.012, -.06, .03], h), box([.035, .06, .01], [0, .02, .03], STEEL), box([.012, .04, .008], [-.01, .07, .03], STEEL), box([.012, .04, .008], [.01, .07, .03], STEEL)));
}
export function tinSnips(): THREE.Group {
  return shadowed(grp('snips', box([.02, .14, .015], [-.015, -.07, .03], ORANGE), box([.02, .14, .015], [.015, -.07, .03], ORANGE), box([.03, .08, .008], [0, .04, .03], STEEL)));
}
export function screwdrivers(n = 6): THREE.Group {
  const g = grp('screwdrivers', box([.2, .01, .01], [0, .12, .03], DARK));
  for (let i = 0; i < n; i++) { const x = -.09 + i * (.18 / (n - 1)); g.add(cylinder(.011, .09, [x, .06, .03], [RED, ORANGE, std('#e3c11c', .5), RED, ORANGE, RED][i % 6], 10), cylinder(.003, .1, [x, -.03, .03], STEEL, 6)); }
  return shadowed(g);
}
export function sandpaperPack(): THREE.Group {
  const c = canvasTex(64, 80, g => { g.fillStyle = '#1f8a4a'; g.fillRect(0, 0, 64, 80); g.fillStyle = '#0d5a2c'; for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { g.beginPath(); g.arc(12 + i * 13, 12 + j * 14, 4, 0, 7); g.fill(); } });
  return shadowed(grp('sandpaper', place(new THREE.Mesh(new THREE.BoxGeometry(.16, .2, .008), [DARK, DARK, DARK, DARK, new THREE.MeshStandardMaterial({ map: c, roughness: .8 }), DARK]), [0, 0, .03])));
}
export function cowboyHat(): THREE.Group {
  const m = std('#c9b88c', .85);
  const brim = cylinder(.15, .008, [0, 0, .05], m, 32); brim.rotation.x = Math.PI / 2; brim.scale.set(1, 1, .8);
  const crown = cylinder(.075, .1, [0, .0, .09], m, 24, .085); crown.rotation.x = Math.PI / 2;
  return shadowed(grp('cowboy-hat', brim, crown));
}
export function socketRail(): THREE.Group {
  const g = grp('socket-rail', box([.34, .05, .02], [0, 0, .02], DARK));
  for (let i = 0; i < 13; i++) g.add(cylinder(.011, .035 + (i % 4) * .004, [-.15 + i * .025, 0, .04], STEEL, 8)).children.at(-1)!.rotation.x = Math.PI / 2;
  return shadowed(g);
}
export function blackBag(): THREE.Group {
  return shadowed(grp('bag', cushion([.24, .3, .08], [0, 0, .045], .03, std('#1b1c1e', .9)), box([.2, .02, .01], [0, .1, .09], std('#3a3b3f', .8))));
}
export function huskvarnaChainsaw(): THREE.Group {
  const g = grp('chainsaw');
  g.add(cushion([.34, .2, .2], [0, .13, 0], .04, ORANGE), cushion([.18, .12, .18], [-.04, .23, 0], .03, std('#d9d9d4', .5)), cushion([.2, .07, .16], [.06, .27, 0], .02, DARK));
  g.add(tube([[.12, .15, 0], [.2, .3, 0], [.12, .36, 0], [-.05, .34, 0]], .014, DARK, 14), tube([[-.15, .1, -.08], [-.24, .22, -.08], [-.2, .34, -.08]], .014, DARK, 12));
  const bar = chainsawBar(.5); bar.position.set(-.45, .12, 0); bar.rotation.y = Math.PI / 2; bar.rotation.set(0, 0, 0); g.add(bar);
  bar.position.set(-.42, .12, -.02);
  return shadowed(g);
}
