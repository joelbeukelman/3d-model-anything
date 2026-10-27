import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface PropInfo { name: string; kind: 'furniture' | 'prop' | 'decor'; pivot: number[]; size: number[]; mass: number; surface: string; dynamic: boolean }

/**
 * Real objects cut from the photo reconstruction by tools/extract-objects.py:
 * /<id>/props.glb (vertex-colored meshes, pivot at each object's base) + /<id>/props.json.
 * Colors already hold the photographed lighting, so they render unlit. Returns [] when not extracted.
 */
export async function loadProps(id: string): Promise<THREE.Group[]> {
  try {
    const info: PropInfo[] = await fetch(`/${id}/props.json`).then(r => r.ok ? r.json() : []);
    if (!info.length) return [];
    const gltf = await new GLTFLoader().loadAsync(`/${id}/props.glb`);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    return info.flatMap(p => {
      const src = gltf.scene.getObjectByName(p.name); if (!src) return [];
      const g = new THREE.Group(); g.name = p.name;
      src.traverse(o => { if (o instanceof THREE.Mesh) { const m = new THREE.Mesh(o.geometry, mat); m.castShadow = false; g.add(m); } });
      g.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
      g.userData.physics = p.kind === 'decor' ? { type: 'none' }
        : { type: p.dynamic ? 'dynamic' : 'static', shape: 'hull', mass: p.mass, surface: p.surface, wakeOnImpact: p.kind !== 'furniture' };
      return [g];
    });
  } catch { return []; }
}
