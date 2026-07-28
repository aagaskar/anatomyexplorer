/**
 * Translucent body outline. It is rigid per segment and parented to the rig, so it follows
 * the pose for free and gives the muscles and bones something to sit inside.
 */

import { BufferGeometry, Matrix4, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, Vector3 } from 'three';
import type { Vec3 } from '../anatomy/types';
import { mergeParts, sweptTube } from './boneGeometry';
import { CatmullRomCurve3 } from 'three';

interface SegmentSpec {
  node: string;
  /** Ellipsoid blob. */
  blob?: { center: Vec3; radii: Vec3 };
  /** Tapered limb sleeve from one local point to another. */
  limb?: { from: Vec3; to: Vec3; r0: number; r1: number };
}

const LEFT_SEGMENTS: SegmentSpec[] = [
  { node: 'l_shoulder', limb: { from: [0.005, -0.01, 0], to: [0.03, -0.3, -0.01], r0: 0.052, r1: 0.04 } },
  { node: 'l_elbow', limb: { from: [0, -0.01, 0], to: [0.01, -0.255, 0.01], r0: 0.043, r1: 0.028 } },
  { node: 'l_wrist', blob: { center: [0.004, -0.05, 0.004], radii: [0.043, 0.062, 0.019] } },
  { node: 'l_hip', limb: { from: [0, -0.02, 0], to: [0.01, -0.44, 0.005], r0: 0.086, r1: 0.055 } },
  { node: 'l_knee', limb: { from: [0, -0.01, 0], to: [0, -0.4, -0.005], r0: 0.058, r1: 0.032 } },
  { node: 'l_ankle', blob: { center: [0, -0.032, 0.045], radii: [0.036, 0.036, 0.105] } },
];

const CENTER_SEGMENTS: SegmentSpec[] = [
  { node: 'pelvis', blob: { center: [0, -0.03, -0.005], radii: [0.155, 0.115, 0.105] } },
  { node: 'lumbar', blob: { center: [0, 0.055, 0], radii: [0.135, 0.095, 0.098] } },
  { node: 'thorax', blob: { center: [0, 0.105, 0.005], radii: [0.168, 0.135, 0.112] } },
  { node: 'chest', blob: { center: [0, -0.015, 0.005], radii: [0.172, 0.075, 0.108] } },
  { node: 'neck', blob: { center: [0, 0.055, -0.005], radii: [0.058, 0.07, 0.058] } },
  { node: 'head', blob: { center: [0, 0.055, 0.012], radii: [0.088, 0.112, 0.1] } },
];

const SEGMENTS: SegmentSpec[] = [
  ...CENTER_SEGMENTS,
  ...LEFT_SEGMENTS,
  ...LEFT_SEGMENTS.map((s) => ({
    node: s.node.replace(/^l_/, 'r_'),
    blob: s.blob ? { center: neg(s.blob.center), radii: s.blob.radii } : undefined,
    limb: s.limb ? { ...s.limb, from: neg(s.limb.from), to: neg(s.limb.to) } : undefined,
  })),
];

function neg(v: Vec3): Vec3 {
  return [-v[0], v[1], v[2]];
}

function specGeometry(spec: SegmentSpec): BufferGeometry | null {
  if (spec.blob) {
    const g = new SphereGeometry(1, 18, 14);
    g.applyMatrix4(new Matrix4().makeScale(spec.blob.radii[0], spec.blob.radii[1], spec.blob.radii[2]));
    g.applyMatrix4(new Matrix4().makeTranslation(...spec.blob.center));
    return g;
  }
  if (spec.limb) {
    const from = new Vector3(...spec.limb.from);
    const to = new Vector3(...spec.limb.to);
    const curve = new CatmullRomCurve3([from, from.clone().lerp(to, 0.5), to], false, 'catmullrom', 0.5);
    return sweptTube(curve, (t) => spec.limb!.r0 + (spec.limb!.r1 - spec.limb!.r0) * t, 12, 12);
  }
  return null;
}

export function buildSilhouette(nodes: Record<string, Object3D>): { group: Object3D; meshes: Mesh[] } {
  const group = new Object3D();
  group.name = 'silhouette';
  const material = new MeshStandardMaterial({
    color: '#c9a48c',
    roughness: 0.86,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const meshes: Mesh[] = [];
  const byNode = new Map<string, BufferGeometry[]>();
  for (const spec of SEGMENTS) {
    const g = specGeometry(spec);
    if (!g) continue;
    const list = byNode.get(spec.node) ?? [];
    list.push(g);
    byNode.set(spec.node, list);
  }
  for (const [node, geometries] of byNode) {
    const parent = nodes[node];
    if (!parent) continue;
    const geometry = mergeParts(geometries);
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 5;
    mesh.userData.silhouette = true;
    parent.add(mesh);
    meshes.push(mesh);
  }
  return { group, meshes };
}
