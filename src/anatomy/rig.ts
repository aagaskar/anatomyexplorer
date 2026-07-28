/**
 * The articulated skeleton.
 *
 * Conventions — important, because every muscle attachment coordinate depends on them:
 *
 *   +X = the subject's LEFT      (so the model faces the default camera)
 *   +Y = up
 *   +Z = anterior (forward)
 *
 * At rest every node's local axes are aligned with the world axes and the pose is
 * *anatomical position* (upright, arms at the sides, palms facing forward). That means
 * a joint angle of 0 is anatomical neutral, so reported angles read like a goniometer,
 * and a point's local coordinate is simply (worldPoint - nodeRestWorldPosition).
 *
 * Sign conventions fall out of the right-hand rule and differ between segments that
 * point up (+Y, e.g. the spine) and segments that hang down (-Y, e.g. limbs), so each
 * degree of freedom names the motion produced in each direction explicitly.
 */

import type { DofDef, RigNodeDef, Vec3 } from './types';

/** Pose key holding the root translation (metres) rather than Euler angles. */
export const ROOT_TRANSLATE_KEY = '_translate';

export const ROOT_NODE = 'root';

/** World position of the pelvis at rest, for a ~1.70 m body. */
export const ROOT_REST_POSITION: Vec3 = [0, 0.95, 0];

const dof = (
  axis: DofDef['axis'],
  positive: DofDef['positive'],
  negative: DofDef['negative'],
  min: number,
  max: number,
  joint?: string,
): DofDef => ({ axis, positive, negative, min, max, joint });

/**
 * Mirror a left-side degree of freedom for the right side. Reflecting through the
 * mid-sagittal plane (x -> -x) negates rotations about Y and Z, so those DOFs swap
 * their motion names and flip their limits.
 */
function mirrorDof(d: DofDef, mirrorJoint: (j?: string) => string | undefined): DofDef {
  if (d.axis === 'x') return { ...d, joint: mirrorJoint(d.joint) };
  return {
    axis: d.axis,
    positive: d.negative,
    negative: d.positive,
    min: -d.max,
    max: -d.min,
    joint: mirrorJoint(d.joint),
  };
}

const swapSide = (id: string): string => id.replace(/^l_/, 'r_');

const mirrorJointId = (j?: string) => (j ? swapSide(j) : undefined);

/** Left-side node definitions, mirrored automatically to the right. */
const LEFT_NODES: RigNodeDef[] = [
  // ---------------------------------------------------------------- shoulder girdle
  {
    id: 'l_clavicle',
    label: 'Left shoulder girdle (clavicle)',
    parent: 'chest',
    offset: [0.02, 0.04, 0.03],
    aim: [1, 0, 0],
    segmentLength: 0.16,
    side: 'left',
    joint: 'l_sternoclavicular',
    massFraction: 0.055,
    dofs: [
      dof('z', 'elevation', 'depression', -8, 30, 'l_sternoclavicular'),
      dof('y', 'retraction', 'protraction', -25, 25, 'l_sternoclavicular'),
    ],
  },
  {
    id: 'l_scapula',
    label: 'Left scapula',
    parent: 'l_clavicle',
    offset: [0.07, -0.07, -0.09],
    aim: [0, -1, 0],
    segmentLength: 0.14,
    side: 'left',
    joint: 'l_scapulothoracic',
    massFraction: 0.05,
    dofs: [
      dof('z', 'upward rotation', 'downward rotation', -15, 55, 'l_scapulothoracic'),
      dof('y', 'internal rotation', 'external rotation', -20, 20, 'l_acromioclavicular'),
    ],
  },
  // ------------------------------------------------------------------- upper limb
  {
    id: 'l_shoulder',
    label: 'Left upper arm',
    parent: 'l_scapula',
    offset: [0.09, 0.05, 0.06],
    aim: [0, -1, 0],
    segmentLength: 0.3,
    side: 'left',
    joint: 'l_glenohumeral',
    massFraction: 0.05,
    dofs: [
      dof('x', 'extension', 'flexion', -170, 60),
      dof('z', 'abduction', 'adduction', -40, 175),
      dof('y', 'internal rotation', 'external rotation', -90, 90),
    ],
  },
  {
    id: 'l_elbow',
    label: 'Left forearm',
    parent: 'l_shoulder',
    offset: [0.03, -0.3, -0.01],
    aim: [0, -1, 0],
    segmentLength: 0.26,
    side: 'left',
    joint: 'l_elbow',
    massFraction: 0.027,
    dofs: [dof('x', 'extension', 'flexion', -150, 5)],
  },
  {
    id: 'l_radioulnar',
    label: 'Left forearm rotation',
    parent: 'l_elbow',
    offset: [0, 0, 0],
    aim: [0, -1, 0],
    segmentLength: 0.26,
    side: 'left',
    joint: 'l_radioulnar',
    massFraction: 0.02,
    dofs: [dof('y', 'pronation', 'supination', -90, 90)],
  },
  {
    id: 'l_wrist',
    label: 'Left hand',
    parent: 'l_radioulnar',
    offset: [0.01, -0.26, 0.01],
    aim: [0, -1, 0],
    segmentLength: 0.09,
    side: 'left',
    joint: 'l_wrist',
    massFraction: 0.006,
    dofs: [
      dof('x', 'extension', 'flexion', -80, 70),
      dof('z', 'radial deviation', 'ulnar deviation', -35, 20),
    ],
  },
  {
    id: 'l_fingers',
    label: 'Left fingers',
    parent: 'l_wrist',
    offset: [0.005, -0.085, 0.005],
    aim: [0, -1, 0],
    segmentLength: 0.08,
    side: 'left',
    joint: 'l_mcp',
    massFraction: 0.002,
    dofs: [dof('x', 'extension', 'flexion', -95, 35)],
  },
  {
    id: 'l_thumb',
    label: 'Left thumb',
    parent: 'l_wrist',
    offset: [0.032, -0.05, 0.012],
    aim: [0.3, -1, 0.2],
    segmentLength: 0.06,
    side: 'left',
    joint: 'l_thumb_cmc',
    massFraction: 0.001,
    dofs: [
      dof('x', 'extension', 'flexion', -55, 25),
      dof('z', 'abduction', 'adduction', -20, 45),
    ],
  },
  // ------------------------------------------------------------------- lower limb
  {
    id: 'l_hip',
    label: 'Left thigh',
    parent: 'pelvis',
    offset: [0.09, -0.03, 0],
    aim: [0, -1, 0],
    segmentLength: 0.44,
    side: 'left',
    joint: 'l_hip',
    massFraction: 0.161,
    dofs: [
      dof('x', 'extension', 'flexion', -125, 30),
      dof('z', 'abduction', 'adduction', -30, 50),
      dof('y', 'internal rotation', 'external rotation', -50, 40),
    ],
  },
  {
    id: 'l_knee',
    label: 'Left lower leg',
    parent: 'l_hip',
    offset: [0.01, -0.44, 0.005],
    aim: [0, -1, 0],
    segmentLength: 0.405,
    side: 'left',
    joint: 'l_knee',
    massFraction: 0.061,
    dofs: [
      dof('x', 'flexion', 'hyperextension', -5, 150),
      dof('y', 'internal rotation', 'external rotation', -20, 20),
    ],
  },
  {
    id: 'l_ankle',
    label: 'Left foot',
    parent: 'l_knee',
    offset: [0, -0.405, -0.005],
    aim: [0, 0, 1],
    segmentLength: 0.18,
    side: 'left',
    joint: 'l_ankle',
    massFraction: 0.0145,
    dofs: [
      dof('x', 'plantarflexion', 'dorsiflexion', -25, 50, 'l_ankle'),
      dof('z', 'eversion', 'inversion', -35, 20, 'l_subtalar'),
    ],
  },
  {
    id: 'l_forefoot',
    label: 'Left toes',
    parent: 'l_ankle',
    offset: [0, -0.045, 0.12],
    aim: [0, 0, 1],
    segmentLength: 0.06,
    side: 'left',
    joint: 'l_mtp',
    massFraction: 0.003,
    dofs: [dof('x', 'flexion', 'extension', -70, 40)],
  },
];

/** Midline nodes (no mirroring). */
const CENTER_NODES: RigNodeDef[] = [
  {
    // Whole-body orientation. Not an anatomical joint — it exists so that a pose can lean
    // or turn the whole body without that showing up as joint motion in the analysis.
    // A hip hinge, for example, is the body leaning forward *and* the hips extending back
    // to keep the femurs vertical; only the latter is hip motion.
    id: 'root',
    label: 'Whole body orientation',
    parent: null,
    offset: ROOT_REST_POSITION,
    aim: [0, 1, 0],
    segmentLength: 0.2,
    side: 'center',
    massFraction: 1,
    dofs: [
      dof('x', 'forward lean', 'backward lean', -95, 95),
      dof('y', 'right rotation', 'left rotation', -180, 180),
      dof('z', 'left lateral flexion', 'right lateral flexion', -60, 60),
    ],
  },
  {
    id: 'pelvis',
    label: 'Pelvis',
    parent: 'root',
    offset: [0, 0, 0],
    aim: [0, 1, 0],
    segmentLength: 0.12,
    side: 'center',
    joint: 'sacroiliac',
    massFraction: 1,
    dofs: [
      dof('x', 'anterior tilt', 'posterior tilt', -25, 25, 'sacroiliac'),
      dof('y', 'right rotation', 'left rotation', -40, 40, 'sacroiliac'),
      dof('z', 'left lateral flexion', 'right lateral flexion', -20, 20, 'sacroiliac'),
    ],
  },
  {
    id: 'lumbar',
    label: 'Lumbar spine',
    parent: 'pelvis',
    offset: [0, 0.07, 0],
    aim: [0, 1, 0],
    segmentLength: 0.14,
    side: 'center',
    joint: 'lumbar_spine',
    massFraction: 0.55,
    dofs: [
      dof('x', 'flexion', 'extension', -25, 55),
      dof('y', 'right rotation', 'left rotation', -13, 13),
      dof('z', 'left lateral flexion', 'right lateral flexion', -30, 30),
    ],
  },
  {
    id: 'thorax',
    label: 'Thoracic spine',
    parent: 'lumbar',
    offset: [0, 0.14, 0],
    aim: [0, 1, 0],
    segmentLength: 0.2,
    side: 'center',
    joint: 'thoracic_spine',
    massFraction: 0.45,
    dofs: [
      dof('x', 'flexion', 'extension', -20, 35),
      dof('y', 'right rotation', 'left rotation', -35, 35),
      dof('z', 'left lateral flexion', 'right lateral flexion', -25, 25),
    ],
  },
  {
    id: 'chest',
    label: 'Upper thorax',
    parent: 'thorax',
    offset: [0, 0.2, 0],
    aim: [0, 1, 0],
    segmentLength: 0.08,
    side: 'center',
    poseLocked: true,
    massFraction: 0.25,
    dofs: [],
  },
  {
    id: 'neck',
    label: 'Cervical spine',
    parent: 'chest',
    offset: [0, 0.08, 0],
    aim: [0, 1, 0],
    segmentLength: 0.12,
    side: 'center',
    joint: 'cervical_spine',
    massFraction: 0.081,
    dofs: [
      dof('x', 'flexion', 'extension', -55, 50),
      dof('y', 'right rotation', 'left rotation', -75, 75),
      dof('z', 'left lateral flexion', 'right lateral flexion', -42, 42),
    ],
  },
  {
    id: 'head',
    label: 'Head',
    parent: 'neck',
    offset: [0, 0.12, 0],
    aim: [0, 1, 0],
    segmentLength: 0.13,
    side: 'center',
    joint: 'atlantooccipital',
    massFraction: 0.081,
    dofs: [
      dof('x', 'flexion', 'extension', -20, 15, 'atlantooccipital'),
      dof('y', 'right rotation', 'left rotation', -40, 40, 'atlantoaxial'),
      dof('z', 'left lateral flexion', 'right lateral flexion', -8, 8, 'atlantooccipital'),
    ],
  },
  {
    id: 'jaw',
    label: 'Mandible',
    parent: 'head',
    offset: [0, -0.045, 0.035],
    aim: [0, -1, 0],
    segmentLength: 0.08,
    side: 'center',
    joint: 'temporomandibular',
    massFraction: 0.005,
    dofs: [dof('x', 'depression', 'elevation', -5, 30)],
  },
];

function mirrorNode(node: RigNodeDef): RigNodeDef {
  const [x, y, z] = node.offset;
  const aim = node.aim;
  return {
    ...node,
    id: swapSide(node.id),
    label: node.label.replace('Left', 'Right'),
    parent: node.parent ? swapSide(node.parent) : null,
    offset: [-x, y, z],
    aim: aim ? [-aim[0], aim[1], aim[2]] : undefined,
    side: 'right',
    joint: mirrorJointId(node.joint),
    dofs: node.dofs.map((d) => mirrorDof(d, mirrorJointId)),
  };
}

export const RIG_NODES: RigNodeDef[] = [
  ...CENTER_NODES,
  ...LEFT_NODES,
  ...LEFT_NODES.map(mirrorNode),
];

export const RIG_NODE_BY_ID: Record<string, RigNodeDef> = Object.fromEntries(
  RIG_NODES.map((n) => [n.id, n]),
);

/** Rest-pose world position of every node, derived by walking the tree. */
export const REST_WORLD_POSITION: Record<string, Vec3> = (() => {
  const out: Record<string, Vec3> = {};
  const resolve = (id: string): Vec3 => {
    const cached = out[id];
    if (cached) return cached;
    const node = RIG_NODE_BY_ID[id];
    if (!node) throw new Error(`Unknown rig node: ${id}`);
    const parent: Vec3 = node.parent ? resolve(node.parent) : [0, 0, 0];
    const pos: Vec3 = [
      parent[0] + node.offset[0],
      parent[1] + node.offset[1],
      parent[2] + node.offset[2],
    ];
    out[id] = pos;
    return pos;
  };
  for (const node of RIG_NODES) resolve(node.id);
  return out;
})();

/**
 * Helper for authoring anatomy data: convert a world-space rest position into the
 * local space of a rig node. Keeps the datasets readable — attachments can be written
 * in "where is it on the standing body" terms.
 */
export function localFromWorld(node: string, world: Vec3): Vec3 {
  const origin = REST_WORLD_POSITION[node];
  if (!origin) throw new Error(`Unknown rig node: ${node}`);
  return [world[0] - origin[0], world[1] - origin[1], world[2] - origin[2]];
}

/** Children index, used by the scene builder and the drag-to-pose solver. */
export const RIG_CHILDREN: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const node of RIG_NODES) {
    if (!node.parent) continue;
    (out[node.parent] ??= []).push(node.id);
  }
  return out;
})();

/** Every node in the sub-tree rooted at `id`, including `id` itself. */
export function subtree(id: string): string[] {
  const out: string[] = [];
  const walk = (n: string) => {
    out.push(n);
    for (const c of RIG_CHILDREN[n] ?? []) walk(c);
  };
  walk(id);
  return out;
}

/** Chain of node ids from the root down to `id`. */
export function chainToRoot(id: string): string[] {
  const out: string[] = [];
  let cur: string | null = id;
  while (cur) {
    out.unshift(cur);
    cur = RIG_NODE_BY_ID[cur]?.parent ?? null;
  }
  return out;
}
