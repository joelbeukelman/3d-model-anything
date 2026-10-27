#!/usr/bin/env python3
"""Cut real objects out of a photo-colored reconstruction (reconstruct_bundle.py output).

usage: .venv/bin/python tools/extract-objects.py <room-id>
reads  data/demos/<id>/scan.json, data/captures/<id>-recon/scan_room.ply, tools/extract-config/<id>.json
writes data/web-assets/<id>/props.glb (one named node per object, vertex-colored, pivot at its base)
       data/web-assets/<id>/props.json (name, kind, pivot, size, mass)

config: furniture  [{name, object (index in scan.json objects), pad}]   oriented-box crops, floor/walls removed
        surfaces   [{name, rect [x0,x1,z0,z1], top, height}]            items resting on a surface, split by clustering
        floorItems [{name, rect, height}]                                items resting on the floor in a region
"""
import json, sys
import numpy as np
import open3d as o3d
import trimesh
from scipy import ndimage

ID = sys.argv[1]
sc = json.load(open(f'data/demos/{ID}/scan.json'))
cfg = json.load(open(f'tools/extract-config/{ID}.json'))
mesh = o3d.io.read_triangle_mesh(f'data/captures/{ID}-recon/scan_room.ply')
V = np.asarray(mesh.vertices)
wall_tol = cfg.get('wallTol', .04)
SOLID = cfg.get('solid', True)

def near_wall(P):
    bad = np.zeros(len(P), bool)
    for w in sc['walls']:
        d = (P - np.array(w['origin'])) @ np.array(w['n'])
        u = (P - np.array(w['origin'])) @ np.array(w['u'])
        bad |= (d < wall_tol) & (u > -.1) & (u < w['length'] + .1)
    return bad

def box_mask(o, pad):
    c = np.array(o['center']); s = np.array(o['size']) / 2 + pad
    d = V - c; ca, sa = np.cos(-o['rotY']), np.sin(-o['rotY'])
    x = d[:, 0] * ca + d[:, 2] * sa; z = -d[:, 0] * sa + d[:, 2] * ca
    return (abs(x) < s[0]) & (abs(d[:, 1]) < s[1]) & (abs(z) < s[2])

def largest_component(sub):
    cl, n, _ = sub.cluster_connected_triangles(); cl = np.asarray(cl); n = np.asarray(n)
    if len(n) == 0: return sub
    sub.remove_triangles_by_mask(cl != int(np.argmax(n))); sub.remove_unreferenced_vertices(); return sub

props, nodes = [], []
def solidify(sub, cell=.012):
    """Close a partial surface into a solid: fill every column from the support plane up to the observed top,
    smooth with marching cubes, and color from the nearest photographed vertex."""
    from scipy.spatial import cKDTree
    from skimage.measure import marching_cubes
    P = np.asarray(sub.vertices); C = np.asarray(sub.vertex_colors)
    lo, hi = P.min(0) - cell * 2, P.max(0) + cell * 2
    nx, ny, nz = [int(np.ceil((hi[i] - lo[i]) / cell)) + 1 for i in range(3)]
    ix = ((P[:, 0] - lo[0]) / cell).astype(int); iz = ((P[:, 2] - lo[2]) / cell).astype(int)
    H = np.full((nx, nz), -1.0); np.maximum.at(H, (ix, iz), P[:, 1] - lo[1])
    seen = H >= 0
    closed = ndimage.binary_fill_holes(ndimage.binary_closing(seen, iterations=2))
    Hf = np.where(seen, H, ndimage.grey_dilation(np.where(seen, H, 0), size=7))
    Hf = np.where(closed, Hf, -1)
    ys = (np.arange(ny) * cell)[None, :, None]
    occ = (ys <= Hf[:, None, :]) & closed[:, None, :]
    occ[:, 0, :] &= closed
    vol = ndimage.gaussian_filter(np.pad(occ.astype(np.float32), 1), .9)
    try: verts, faces, _, _ = marching_cubes(vol, .5)
    except Exception: return sub
    world = (verts - 1) * cell + lo
    dd, nn = cKDTree(P).query(world, k=min(14, len(P)))  # average several photo vertices: sides were never seen, so don't smear one
    m = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(world), o3d.utility.Vector3iVector(faces[:, ::-1].copy()))
    m.vertex_colors = o3d.utility.Vector3dVector(C[nn].mean(1)); m.compute_vertex_normals()
    return m

def emit(kind, name, sub, faces, mass_density=120, surface='plastic', dynamic=True, min_extent=.0, solid=True):
    sub.remove_degenerate_triangles(); sub.remove_unreferenced_vertices()
    if len(sub.triangles) < 40: return
    P = np.asarray(sub.vertices); lo, hi = P.min(0), P.max(0); size = hi - lo
    if size.max() < min_extent: return
    if SOLID and solid and kind != 'decor' and len(sub.triangles) > 150: sub = solidify(sub)
    if len(sub.triangles) > faces: sub = sub.simplify_quadric_decimation(faces)
    P = np.asarray(sub.vertices); lo, hi = P.min(0), P.max(0); size = hi - lo
    pivot = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    srgb = np.clip(np.asarray(sub.vertex_colors), 0, 1)
    col = (np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4) * 255).astype(np.uint8)  # glTF colors are linear
    tm = trimesh.Trimesh(vertices=P - pivot, faces=np.asarray(sub.triangles), vertex_colors=np.c_[col, np.full(len(col), 255, np.uint8)], process=False)
    if kind == 'prop' and min(size[0], size[2]) < .06 and size[1] > .15: kind, dynamic = 'decor', False  # wall-hung flat things
    gid = f'{name}-{len([p for p in props if p["name"].startswith(name)])}'
    nodes.append((gid, tm))
    props.append(dict(name=gid, kind=kind, pivot=[round(float(x), 4) for x in pivot], size=[round(float(x), 3) for x in size],
                      mass=round(float(np.clip(size.prod() * mass_density, .15, 60)), 2), surface=surface, dynamic=dynamic, faces=int(len(tm.faces))))
    print(f'  {gid:28s} {size.round(2)} {len(tm.faces)} faces')

def crop(mask):
    idx = np.where(mask)[0]
    return mesh.select_by_index(idx)

# --- large furniture: oriented crops, minus floor and walls ---
for f in cfg.get('furniture', []):
    o = sc['objects'][f['object']]
    m = box_mask(o, f.get('pad', .06)) & (V[:, 1] > f.get('floor', .03)) & ~near_wall(V)
    sub = largest_component(crop(m))
    print(f['name'], int(m.sum()), 'verts')
    emit('furniture', f['name'], sub, f.get('faces', 14000), mass_density=f.get('density', 60), surface=f.get('surface', 'soft'), dynamic=f.get('dynamic', True), solid=f.get('solid', True))

def partition(name, mask, top, rect, faces, min_pts, min_extent, max_extent, surface='plastic', cell=.015, window=.12, min_h=.04, sigma=1.5):
    """Split everything resting on a surface into objects: height-map watershed from local peaks."""
    idx = np.where(mask)[0]
    if len(idx) < min_pts: return
    x0, x1, z0, z1 = rect
    nx, nz = int((x1 - x0) / cell) + 1, int((z1 - z0) / cell) + 1
    ix = np.clip(((V[idx, 0] - x0) / cell).astype(int), 0, nx - 1); iz = np.clip(((V[idx, 2] - z0) / cell).astype(int), 0, nz - 1)
    H = np.zeros((nx, nz)); np.maximum.at(H, (ix, iz), V[idx, 1] - top)
    Hs = ndimage.gaussian_filter(H, sigma)
    peaks = (Hs == ndimage.maximum_filter(Hs, size=max(3, int(window / cell)))) & (Hs > min_h)
    markers, n = ndimage.label(peaks)
    bg = n + 1; markers[Hs < min_h * .6] = bg
    ws = ndimage.watershed_ift(np.clip((Hs.max() - Hs) / max(Hs.max(), 1e-6) * 60000, 0, 65535).astype(np.uint16), markers.astype(np.int32))
    lab = ws[ix, iz]
    for l in range(1, n + 1):
        sel = idx[lab == l]
        if len(sel) < min_pts: continue
        ext = V[sel].max(0) - V[sel].min(0)
        if ext.max() < min_extent or ext.max() > max_extent or ext[1] < .035: continue
        emit('prop', name, mesh.select_by_index(sel), faces, surface=surface)

# --- items resting on surfaces ---
for s in cfg.get('surfaces', []):
    x0, x1, z0, z1 = s['rect']
    m = (V[:, 0] > x0) & (V[:, 0] < x1) & (V[:, 2] > z0) & (V[:, 2] < z1) & (V[:, 1] > s['top'] + .02) & (V[:, 1] < s['top'] + s['height']) & ~near_wall(V)
    print(s['name'], int(m.sum()), 'verts above surface')
    partition(s['name'], m, s['top'], s['rect'], s.get('faces', 2500), s.get('minPts', 50), s.get('minExtent', .05), s.get('maxExtent', .7), window=s.get('window', .12))

for s in cfg.get('floorItems', []):
    x0, x1, z0, z1 = s['rect']
    m = (V[:, 0] > x0) & (V[:, 0] < x1) & (V[:, 2] > z0) & (V[:, 2] < z1) & (V[:, 1] > s.get('floor', .03)) & (V[:, 1] < s['height']) & ~near_wall(V)
    print(s['name'], int(m.sum()), 'verts')
    partition(s['name'], m, s.get('floor', .03), s['rect'], s.get('faces', 3500), s.get('minPts', 80), s.get('minExtent', .1), s.get('maxExtent', 1.0), s.get('surface', 'plastic'), window=s.get('window', .2))

scene = trimesh.Scene()
for gid, tm in nodes: scene.add_geometry(tm, node_name=gid, geom_name=gid)
out = f'data/web-assets/{ID}'
scene.export(f'{out}/props.glb'); json.dump(props, open(f'{out}/props.json', 'w'), indent=1)
print(f'wrote {len(props)} objects → {out}/props.glb')
