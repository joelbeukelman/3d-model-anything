import * as THREE from 'three';
import { wallShape, wallMatrix, type WallDef } from '../../packages/room-runtime/walls';
import type { BuiltRoom, RoomModule, RoomLayout, V3 } from '../../packages/room-runtime/types';

/** Shape of data/demos/<id>/scan.json, written by bundle_to_room.py. */
export interface ScanJson {
  polygon: number[][];
  walls: { a: number[]; b: number[]; u: number[]; n: number[]; origin: number[]; length: number; height?: number;
    openings: { kind: string; u0: number; u1: number; v0: number; v1: number }[] }[];
  objects: { category: string; center: number[]; size: number[]; rotY: number }[];
}

const FIXED = /wall|door|window|opening|floor|ceiling|fireplace|stairs/i;
const COLORS: Record<string, string> = {
  storage: '#a98b64', table: '#b08a58', chair: '#5f6b73', sofa: '#7a6a5c', bed: '#c9c2b8',
  television: '#222', refrigerator: '#cfd3d6', oven: '#9a9da0', sink: '#d9dcde', toilet: '#e8e8e8',
};

/**
 * Measured baseline for any scanned room: wall slabs with real door/window openings, a floor and
 * ceiling, and every RoomPlan object as a box that can be grabbed, dragged and thrown in Play mode.
 * Replace boxes with modeled furniture over time; keep the `physics` tags on the top-level objects.
 */
export function scanRoom(id: string, label: string, scan: ScanJson): RoomModule {
  return {
    id, label,
    async build(): Promise<BuiltRoom> {
      const group = new THREE.Group(); group.name = id;
      const lights = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: '#e4ddd0', roughness: .95 });
      const floorMat = new THREE.MeshStandardMaterial({ color: '#b9ad9a', roughness: .9 });
      const ceilMat = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 1 });
      const wallTop = Math.max(2.4, ...scan.walls.map(w => w.height ?? 0));

      const walls: BuiltRoom['walls'] = scan.walls.map((w, i) => {
        const def: WallDef = {
          name: `wall-${i}`, origin: new THREE.Vector3(...w.origin), u: new THREE.Vector3(...w.u), n: new THREE.Vector3(...w.n),
          length: w.length, thickness: .12, height: w.height ?? wallTop, panels: [], crown: false,
          openings: w.openings.map(o => ({ kind: 'rect' as const, u0: o.u0, u1: o.u1, v0: o.kind === 'door' ? 0 : o.v0, v1: o.v1 })),
        };
        const geo = new THREE.ExtrudeGeometry(wallShape(def), { depth: def.thickness, bevelEnabled: false });
        geo.translate(0, 0, -def.thickness);
        const slab = new THREE.Mesh(geo, paint); slab.name = 'slab'; slab.castShadow = slab.receiveShadow = true;
        slab.applyMatrix4(wallMatrix(def));
        const g = new THREE.Group(); g.name = def.name; g.add(slab); group.add(g);
        g.userData.physics = { type: 'static' };
        return { def, group: g };
      });

      const outline = new THREE.Shape(scan.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
      const flat = (m: THREE.Material, y: number, name: string) => {
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(outline), m);
        mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; mesh.name = name; mesh.receiveShadow = true; return mesh;
      };
      const floor = flat(floorMat, 0, 'floor'); floor.userData.physics = { type: 'static' };
      const ceiling = flat(ceilMat, wallTop, 'ceiling'); ceiling.userData.physics = { type: 'static' };
      ceiling.material = (ceilMat.clone() as THREE.MeshStandardMaterial); ceiling.material.side = THREE.BackSide;
      group.add(floor, ceiling);

      scan.objects.forEach((o, i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...(o.size as V3)),
          new THREE.MeshStandardMaterial({ color: COLORS[o.category] ?? '#9aa0a6', roughness: .7 }));
        m.castShadow = m.receiveShadow = true;
        const holder = new THREE.Group(); holder.name = `${o.category}-${i}`;
        holder.add(m); holder.position.set(...(o.center as V3)); holder.rotation.y = o.rotY;
        holder.userData.physics = FIXED.test(o.category) ? { type: 'static' }
          : { type: 'dynamic', shape: 'box', mass: Math.max(1, o.size[0] * o.size[1] * o.size[2] * 150), wakeOnImpact: true };
        group.add(holder);
      });

      lights.add(new THREE.HemisphereLight('#f4f1ea', '#c8bfae', 2.2));
      const sun = new THREE.DirectionalLight('#fff3df', 2.2); sun.position.set(2, wallTop * 1.4, 1.5); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); lights.add(sun);

      const xs = scan.polygon.map(p => p[0]), zs = scan.polygon.map(p => p[1]);
      const [cx, cz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      const inside = (x: number, z: number) => {
        let c = false; const p = scan.polygon;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++)
          if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
        return c;
      };
      const layout: RoomLayout = {
        note: 'Measured baseline from RoomPlan. Objects are bounding boxes.',
        polygon: scan.polygon,
        walls: scan.walls.map(w => ({ a: w.a, b: w.b, u: w.u, length: w.length, openings: w.openings })),
        objects: scan.objects,
      };
      return {
        layout, group, lights, walls, ceiling: [ceiling], wallTop,
        walkable: (x, z) => [[0, 0], [.2, 0], [-.2, 0], [0, .2], [0, -.2]].every(([dx, dz]) => inside(x + dx, z + dz)),
        camera: { orbit: [cx + span, span * 1.1, cz + span], target: [cx, .8, cz], walk: [cx, 1.6, cz], walkLook: [cx + 1, 1.4, cz] },
        environment: { center: [cx, 1.2, cz], intensity: 1 },
        async loadReference() { return new THREE.Group(); },
        referenceAvailable: false, referenceKind: 'layout',
      };
    },
  };
}
