/**
 * Forward kinematics for the articulated skeleton.
 *
 * A `Rig` is a plain three.js `Object3D` tree — no renderer needed — so the same class
 * drives the 3D scene and runs headless inside the movement analyser and the tests.
 *
 * Because every muscle attachment is pinned to a rig node, muscle length becomes a pure
 * function of the pose. That is the whole trick behind the movement analysis: compare the
 * length of each muscle in two poses and you know who shortened, who lengthened, and by
 * how much.
 */

import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';

import {
  RIG_NODES,
  RIG_NODE_BY_ID,
  ROOT_NODE,
  ROOT_TRANSLATE_KEY,
  chainToRoot,
} from '../anatomy/rig';
import type { MusclePoint, Pose, RigNodeDef, Vec3 } from '../anatomy/types';

const DEG = Math.PI / 180;

/** Points used to sit the model on the floor after a pose change. */
const GROUND_PROBES: { node: string; local: Vec3 }[] = [
  { node: 'l_ankle', local: [0, -0.067, -0.06] },
  { node: 'r_ankle', local: [0, -0.067, -0.06] },
  { node: 'l_forefoot', local: [0, -0.024, 0.055] },
  { node: 'r_forefoot', local: [0, -0.024, 0.055] },
];

export interface ApplyPoseOptions {
  /** Drop or lift the whole model so the lowest foot point rests on y = 0. */
  ground?: boolean;
  /**
   * Apply scapulohumeral rhythm: elevating the arm past 30° drags the scapula into
   * upward rotation at roughly half the rate, as it does in a real shoulder.
   */
  coupling?: boolean;
}

/** Clamp one pose value to the range of motion declared for that degree of freedom. */
export function clampNodeAngles(node: RigNodeDef, angles: Vec3): Vec3 {
  const out: Vec3 = [angles[0], angles[1], angles[2]];
  const index = { x: 0, y: 1, z: 2 } as const;
  // Axes without a declared DOF are locked at zero.
  const allowed = new Set(node.dofs.map((d) => index[d.axis]));
  for (let i = 0; i < 3; i++) if (!allowed.has(i as 0 | 1 | 2)) out[i] = 0;
  for (const d of node.dofs) {
    const i = index[d.axis];
    out[i] = Math.min(d.max, Math.max(d.min, out[i]));
  }
  return out;
}

export function clampPose(pose: Pose): Pose {
  const out: Pose = {};
  for (const [key, value] of Object.entries(pose)) {
    if (key === ROOT_TRANSLATE_KEY) {
      out[key] = value;
      continue;
    }
    const node = RIG_NODE_BY_ID[key];
    if (!node) continue;
    out[key] = clampNodeAngles(node, value);
  }
  return out;
}

export const NEUTRAL_POSE: Pose = {};

/** Scapulohumeral rhythm — returns a pose with derived scapular angles filled in. */
export function applyScapulohumeralRhythm(pose: Pose): Pose {
  const out: Pose = { ...pose };
  for (const side of ['l', 'r'] as const) {
    const shoulder = pose[`${side}_shoulder`];
    if (!shoulder) continue;
    const sign = side === 'l' ? 1 : -1;
    // Elevation of the humerus is whichever of flexion or abduction is larger.
    const abduction = shoulder[2] * sign;
    const flexion = -shoulder[0];
    const elevation = Math.max(abduction, flexion, 0);
    if (elevation <= 30) continue;
    const upward = Math.min((elevation - 30) / 2, 55);
    const existing = out[`${side}_scapula`] ?? [0, 0, 0];
    // Only fill in what the user has not set by hand.
    if (Math.abs(existing[2]) < 0.5) {
      out[`${side}_scapula`] = [existing[0], existing[1], upward * sign];
    }
  }
  return out;
}

export class Rig {
  readonly root: Object3D;
  readonly nodes: Record<string, Object3D> = {};
  /** Y offset applied by grounding, so callers can undo it if needed. */
  groundOffset = 0;

  constructor() {
    this.root = new Object3D();
    this.root.matrixAutoUpdate = true;
    for (const def of RIG_NODES) {
      const obj = new Object3D();
      obj.name = def.id;
      obj.position.set(def.offset[0], def.offset[1], def.offset[2]);
      obj.rotation.order = 'XYZ';
      obj.userData.rigNode = def.id;
      this.nodes[def.id] = obj;
    }
    for (const def of RIG_NODES) {
      const obj = this.nodes[def.id];
      if (def.parent) this.nodes[def.parent].add(obj);
      else this.root.add(obj);
    }
    this.applyPose(NEUTRAL_POSE, { ground: false, coupling: false });
  }

  applyPose(pose: Pose, options: ApplyPoseOptions = {}): void {
    const { ground = true, coupling = true } = options;
    const effective = coupling ? applyScapulohumeralRhythm(pose) : pose;

    for (const def of RIG_NODES) {
      const obj = this.nodes[def.id];
      const raw = effective[def.id];
      const a = raw ? clampNodeAngles(def, raw) : ([0, 0, 0] as Vec3);
      obj.rotation.set(a[0] * DEG, a[1] * DEG, a[2] * DEG, 'XYZ');
    }

    const rootNode = this.nodes[ROOT_NODE];
    const rootDef = RIG_NODE_BY_ID[ROOT_NODE];
    const t = effective[ROOT_TRANSLATE_KEY] ?? [0, 0, 0];
    rootNode.position.set(
      rootDef.offset[0] + t[0],
      rootDef.offset[1] + t[1],
      rootDef.offset[2] + t[2],
    );

    this.root.updateMatrixWorld(true);
    this.groundOffset = 0;

    if (ground) {
      let lowest = Infinity;
      const v = new Vector3();
      for (const probe of GROUND_PROBES) {
        const node = this.nodes[probe.node];
        if (!node) continue;
        v.set(probe.local[0], probe.local[1], probe.local[2]).applyMatrix4(node.matrixWorld);
        lowest = Math.min(lowest, v.y);
      }
      if (Number.isFinite(lowest) && Math.abs(lowest) > 1e-4) {
        this.groundOffset = -lowest;
        rootNode.position.y += this.groundOffset;
        this.root.updateMatrixWorld(true);
      }
    }
  }

  worldPoint(node: string, local: Vec3, target = new Vector3()): Vector3 {
    const obj = this.nodes[node];
    if (!obj) return target.set(local[0], local[1], local[2]);
    return target.set(local[0], local[1], local[2]).applyMatrix4(obj.matrixWorld);
  }

  /** World-space polyline for a muscle or nerve path. */
  worldPath(points: MusclePoint[], out: Vector3[] = []): Vector3[] {
    out.length = 0;
    for (const pt of points) out.push(this.worldPoint(pt.node, pt.pos, new Vector3()));
    return out;
  }

  pathLength(points: MusclePoint[]): number {
    let total = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 1; i < points.length; i++) {
      this.worldPoint(points[i - 1].node, points[i - 1].pos, a);
      this.worldPoint(points[i].node, points[i].pos, b);
      total += a.distanceTo(b);
    }
    return total;
  }

  /** World-space direction of a node's local rotation axis, for gravity reasoning. */
  worldAxis(node: string, axis: 'x' | 'y' | 'z', target = new Vector3()): Vector3 {
    const obj = this.nodes[node];
    target.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    if (!obj) return target;
    const m = new Matrix4().extractRotation(obj.matrixWorld);
    return target.applyMatrix4(m).normalize();
  }

  worldPosition(node: string, target = new Vector3()): Vector3 {
    const obj = this.nodes[node];
    if (!obj) return target.set(0, 0, 0);
    return target.setFromMatrixPosition(obj.matrixWorld);
  }

  /**
   * Approximate centre of mass of everything distal to a node, and the total mass
   * fraction it represents. Used to work out whether gravity helps or resists a movement.
   */
  distalCentreOfMass(nodeId: string): { com: Vector3; mass: number } {
    const com = new Vector3();
    let mass = 0;
    const v = new Vector3();
    const walk = (id: string) => {
      const def = RIG_NODE_BY_ID[id];
      const obj = this.nodes[id];
      if (def && obj) {
        // Segment mass sits roughly at the middle of the segment it controls.
        const own = ownSegmentMass(def);
        if (own > 0) {
          const aim = def.aim ?? [0, -1, 0];
          const len = def.segmentLength ?? 0.1;
          v.set((aim[0] * len) / 2, (aim[1] * len) / 2, (aim[2] * len) / 2).applyMatrix4(obj.matrixWorld);
          com.addScaledVector(v, own);
          mass += own;
        }
      }
      for (const child of childrenOf(id)) walk(child);
    };
    walk(nodeId);
    if (mass > 0) com.multiplyScalar(1 / mass);
    else this.worldPosition(nodeId, com);
    return { com, mass: RIG_NODE_BY_ID[nodeId]?.massFraction ?? mass };
  }

  /** True if a muscle path crosses the given node (has attachments above and below it). */
  pathCrossesNode(points: MusclePoint[], nodeId: string): boolean {
    let above = false;
    let below = false;
    for (const pt of points) {
      const chain = chainToRoot(pt.node);
      const idx = chain.indexOf(nodeId);
      if (idx === -1) above = true;
      else if (pt.node === nodeId) continue;
      else below = true;
    }
    return above && below;
  }
}

const CHILDREN: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const n of RIG_NODES) {
    if (n.parent) (out[n.parent] ??= []).push(n.id);
  }
  return out;
})();

const childrenOf = (id: string) => CHILDREN[id] ?? [];

/** Mass of a node's own segment = its distal mass fraction minus its children's. */
function ownSegmentMass(def: RigNodeDef): number {
  const total = def.massFraction ?? 0;
  let childSum = 0;
  for (const c of childrenOf(def.id)) childSum += RIG_NODE_BY_ID[c]?.massFraction ?? 0;
  return Math.max(total - childSum, 0);
}

/** Convert a quaternion back into the XYZ Euler degrees a pose stores. */
export function quaternionToPoseAngles(q: Quaternion): Vec3 {
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  return [e.x / DEG, e.y / DEG, e.z / DEG];
}
