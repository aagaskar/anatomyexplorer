/**
 * Movement analysis: given two poses, work out which muscles produced the change.
 *
 * The method has three steps.
 *
 *  1. **Kinematics.** Compare the two poses joint by joint to get a list of named motions
 *     ("left hip: flexion 0° → 95°").
 *  2. **Muscle length.** Because attachments are pinned to the rig, every muscle's length
 *     is a function of the pose. Muscles that shortened are candidates for having driven
 *     the movement; muscles that lengthened either resisted it or were stretched by it.
 *  3. **Gravity.** Shortening alone does not mean a muscle worked. Lowering into a squat
 *     is produced by the quadriceps and glutes *lengthening* under control, not by the hip
 *     flexors shortening. So for each joint that moved we compute whether gravity pushed
 *     the segment in the same direction as the movement. If it did, the muscles that
 *     oppose the motion are the ones doing the work, eccentrically.
 *
 * Closed-chain positions are handled explicitly: when a foot (or hand) is on the floor the
 * distal segment is fixed and the body swings about it, so the sign of the gravity torque
 * is taken from the mass *above* the joint instead of below it.
 */

import { Vector3 } from 'three';

import { JOINT_BY_ID, MUSCLES } from '../anatomy';
import { RIG_NODES, RIG_NODE_BY_ID, subtree } from '../anatomy/rig';
import type { DofDef, MotionName, MuscleDef, Pose, RotationAxis, Vec3 } from '../anatomy/types';
import { Rig } from './kinematics';

const OPPOSITE: Partial<Record<MotionName, MotionName>> = {
  flexion: 'extension',
  extension: 'flexion',
  hyperextension: 'flexion',
  abduction: 'adduction',
  adduction: 'abduction',
  'internal rotation': 'external rotation',
  'external rotation': 'internal rotation',
  pronation: 'supination',
  supination: 'pronation',
  dorsiflexion: 'plantarflexion',
  plantarflexion: 'dorsiflexion',
  inversion: 'eversion',
  eversion: 'inversion',
  elevation: 'depression',
  depression: 'elevation',
  protraction: 'retraction',
  retraction: 'protraction',
  'upward rotation': 'downward rotation',
  'downward rotation': 'upward rotation',
  'radial deviation': 'ulnar deviation',
  'ulnar deviation': 'radial deviation',
  'right rotation': 'left rotation',
  'left rotation': 'right rotation',
  'right lateral flexion': 'left lateral flexion',
  'left lateral flexion': 'right lateral flexion',
  'anterior tilt': 'posterior tilt',
  'posterior tilt': 'anterior tilt',
};

export const oppositeMotion = (m: MotionName): MotionName | undefined => OPPOSITE[m];

/** Degrees of change below which a joint is treated as not having moved. */
const ANGLE_EPSILON = 1.5;
/** Fractional length change below which a muscle is treated as isometric. */
const LENGTH_EPSILON = 0.012;

export type GravityRelation = 'assists' | 'resists' | 'neutral';

export interface JointChange {
  joint: string;
  jointName: string;
  node: string;
  nodeLabel: string;
  axis: RotationAxis;
  from: number;
  to: number;
  /** Signed change in the local angle, degrees. */
  delta: number;
  /** Named motion the change corresponds to. */
  motion: MotionName;
  /** Magnitude of the motion, degrees. */
  degrees: number;
  gravity: GravityRelation;
  closedChain: boolean;
  note: string;
}

export type MuscleRole =
  | 'prime mover'
  | 'synergist'
  | 'eccentric brake'
  | 'antagonist — stretched'
  | 'shortened, unloaded'
  | 'stabiliser';

export type ContractionType = 'concentric' | 'eccentric' | 'isometric' | 'passive';

export interface MuscleInvolvement {
  muscle: MuscleDef;
  role: MuscleRole;
  contraction: ContractionType;
  lengthFrom: number;
  lengthTo: number;
  /** Fractional length change; negative = shortened. */
  deltaPct: number;
  /** 0–100 estimate of how much this muscle is implicated in the movement. */
  score: number;
  /** Joint changes this muscle acts on, most significant first. */
  drivers: JointChange[];
  explanation: string;
}

export interface PoseAnalysis {
  jointChanges: JointChange[];
  involvement: MuscleInvolvement[];
  primeMovers: MuscleInvolvement[];
  synergists: MuscleInvolvement[];
  eccentric: MuscleInvolvement[];
  antagonists: MuscleInvolvement[];
  stabilisers: MuscleInvolvement[];
  summary: string;
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

function angleOf(pose: Pose, node: string, axis: RotationAxis): number {
  const v: Vec3 | undefined = pose[node];
  return v ? v[AXIS_INDEX[axis]] : 0;
}

/** Which limbs are in contact with the ground in this pose. */
function groundedChains(rig: Rig): Set<string> {
  const grounded = new Set<string>();
  const probes: { node: string; local: Vec3 }[] = [
    { node: 'l_ankle', local: [0, -0.067, -0.06] },
    { node: 'r_ankle', local: [0, -0.067, -0.06] },
    { node: 'l_forefoot', local: [0, -0.024, 0.055] },
    { node: 'r_forefoot', local: [0, -0.024, 0.055] },
    { node: 'l_wrist', local: [0, -0.06, 0.01] },
    { node: 'r_wrist', local: [0, -0.06, 0.01] },
  ];
  const v = new Vector3();
  for (const probe of probes) {
    if (!rig.nodes[probe.node]) continue;
    rig.worldPoint(probe.node, probe.local, v);
    if (v.y < 0.045) {
      // Everything from the root down to this contact point is load-bearing.
      let cur: string | null = probe.node;
      while (cur) {
        grounded.add(cur);
        cur = RIG_NODE_BY_ID[cur]?.parent ?? null;
      }
    }
  }
  return grounded;
}

const SEGMENT_MASS: Record<string, number> = (() => {
  const children: Record<string, string[]> = {};
  for (const n of RIG_NODES) if (n.parent) (children[n.parent] ??= []).push(n.id);
  const out: Record<string, number> = {};
  for (const n of RIG_NODES) {
    const total = n.massFraction ?? 0;
    let sum = 0;
    for (const c of children[n.id] ?? []) sum += RIG_NODE_BY_ID[c]?.massFraction ?? 0;
    out[n.id] = Math.max(total - sum, 0);
  }
  return out;
})();

const segmentMass = (id: string) => SEGMENT_MASS[id] ?? 0;

/**
 * Effective moment arm (metres) below which a joint counts as gravity-balanced. Real
 * moment arms at the knee and elbow are only a few centimetres, so this has to be small.
 */
const MOMENT_ARM_EPSILON = 0.015;

/**
 * How the body is supported. This decides what "height" means when we ask whether a
 * movement is downhill: feet on the floor, hanging from the hands, or sitting/supported
 * at the pelvis.
 */
export type Support = 'floor' | 'hands' | 'pelvis';

interface Contact {
  /** Rig node bearing the load. */
  node: string;
  position: Vector3;
  /** Upward support force, as a fraction of body weight. */
  force: number;
}

/** Where the body is taking its support in this pose, and how the load is shared. */
function findContacts(rig: Rig, support: Support): Contact[] {
  if (support === 'pelvis') {
    return [{ node: 'pelvis', position: rig.worldPosition('pelvis'), force: 1 }];
  }
  if (support === 'hands') {
    return ['l_wrist', 'r_wrist'].map((node) => ({
      node,
      position: rig.worldPoint(node, [0, -0.06, 0.01], new Vector3()),
      force: 0.5,
    }));
  }

  const groups: { node: string; points: Vector3[] }[] = [];
  const limbs: { limb: string; probes: { node: string; local: Vec3 }[] }[] = [
    {
      limb: 'l_leg',
      probes: [
        { node: 'l_ankle', local: [0, -0.067, -0.06] },
        { node: 'l_forefoot', local: [0, -0.024, 0.055] },
      ],
    },
    {
      limb: 'r_leg',
      probes: [
        { node: 'r_ankle', local: [0, -0.067, -0.06] },
        { node: 'r_forefoot', local: [0, -0.024, 0.055] },
      ],
    },
    { limb: 'l_arm', probes: [{ node: 'l_wrist', local: [0, -0.06, 0.01] }] },
    { limb: 'r_arm', probes: [{ node: 'r_wrist', local: [0, -0.06, 0.01] }] },
  ];

  for (const { probes } of limbs) {
    const touching: Vector3[] = [];
    let anchorNode = probes[0].node;
    for (const probe of probes) {
      const v = rig.worldPoint(probe.node, probe.local, new Vector3());
      if (v.y < 0.045) {
        touching.push(v);
        anchorNode = probe.node;
      }
    }
    if (touching.length) groups.push({ node: anchorNode, points: touching });
  }

  if (!groups.length) return [];
  const share = 1 / groups.length;
  return groups.map((g) => {
    const position = new Vector3();
    for (const p of g.points) position.add(p);
    position.multiplyScalar(1 / g.points.length);
    return { node: g.node, position, force: share };
  });
}

/**
 * Does gravity help or hinder this motion?
 *
 * Quasi-static inverse dynamics. Take everything distal to the joint as a free body. The
 * external forces on it are the weights of its own segments plus any ground reaction where
 * it touches the floor. Their net moment about the joint axis has to be balanced by an
 * equal and opposite *internal* moment from the muscles. If that muscle moment points the
 * same way the joint actually moved, the muscles producing it shortened under load —
 * concentric work, and gravity resisted. If it points the other way, the muscles opposing
 * the motion paid out under tension — eccentric work, and gravity drove the movement.
 *
 * Handling the ground reaction is what makes closed chains come out right: in a squat the
 * upward force under the foot passes in front of the hip, which is why the hip extensors
 * must work even though the hip is flexing.
 */
function gravityRelation(
  rig: Rig,
  node: string,
  axis: RotationAxis,
  deltaSign: number,
  contacts: Contact[],
): GravityRelation {
  const jointPos = rig.worldPosition(node);
  const axisWorld = rig.worldAxis(node, axis);
  const distal = new Set(subtree(node));

  const moment = new Vector3();
  const r = new Vector3();
  const f = new Vector3();
  const term = new Vector3();
  const v = new Vector3();
  let totalForce = 0;

  for (const id of distal) {
    const def = RIG_NODE_BY_ID[id];
    const obj = rig.nodes[id];
    const mass = segmentMass(id);
    if (!def || !obj || mass <= 0) continue;
    const aim = def.aim ?? [0, -1, 0];
    const len = def.segmentLength ?? 0.1;
    v.set((aim[0] * len) / 2, (aim[1] * len) / 2, (aim[2] * len) / 2).applyMatrix4(obj.matrixWorld);
    r.copy(v).sub(jointPos);
    f.set(0, -mass, 0);
    moment.add(term.crossVectors(r, f));
    totalForce += mass;
  }

  for (const contact of contacts) {
    if (!distal.has(contact.node)) continue;
    r.copy(contact.position).sub(jointPos);
    f.set(0, contact.force, 0);
    moment.add(term.crossVectors(r, f));
    totalForce += contact.force;
  }

  // The muscles must supply the opposite of the external moment. The threshold is a
  // moment arm of ~3 cm on the forces involved: below that the joint is close enough to
  // balanced that gravity does not decide who works.
  const internal = -moment.dot(axisWorld);
  if (totalForce < 1e-5 || Math.abs(internal) < MOMENT_ARM_EPSILON * totalForce) return 'neutral';
  return Math.sign(internal) === Math.sign(deltaSign) ? 'resists' : 'assists';
}

/**
 * Fallback guess at how the body is supported when the caller does not say. Only the
 * unambiguous case is inferred — hands above the shoulders means hanging. Everything else
 * defaults to standing, and the UI lets the user say otherwise, because whether you are
 * sitting on a bench or squatting unsupported genuinely changes the answer.
 */
export function detectSupport(pose: Pose): Support {
  const rig = new Rig();
  rig.applyPose(pose, { ground: false });
  const shoulderY = rig.worldPosition('l_shoulder').y;
  const wristY = (rig.worldPosition('l_wrist').y + rig.worldPosition('r_wrist').y) / 2;
  if (wristY > shoulderY + 0.05) return 'hands';
  return 'floor';
}

function lerpPose(from: Pose, to: Pose, t: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[key] ?? [0, 0, 0];
    const b = to[key] ?? [0, 0, 0];
    out[key] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  return out;
}

/**
 * Name the motion a change represents, respecting anatomical zero.
 *
 * Direction alone is not enough: a knee going from 120° of flexion back to 0° is
 * *extension*, not hyperextension, even though the angle decreased. So we look at which
 * side of neutral the movement happened on — moving away from zero uses that side's name,
 * moving back toward zero uses its opposite.
 */
function motionForChange(d: DofDef, from: number, to: number): MotionName {
  const delta = to - from;
  const mid = (from + to) / 2;
  if (mid > 1) return delta > 0 ? d.positive : OPPOSITE[d.positive] ?? d.negative;
  if (mid < -1) return delta < 0 ? d.negative : OPPOSITE[d.negative] ?? d.positive;
  return delta > 0 ? d.positive : d.negative;
}

export function diffPoses(from: Pose, to: Pose, support?: Support): JointChange[] {
  const resolvedSupport = support ?? detectSupport(from);
  // Gravity is judged half-way through the movement, which is representative of the whole
  // excursion — at the endpoints a balanced body can look gravity-neutral.
  const rig = new Rig();
  rig.applyPose(lerpPose(from, to, 0.5), { ground: resolvedSupport === 'floor' });
  const grounded = groundedChains(rig);
  const contacts = findContacts(rig, resolvedSupport);
  const changes: JointChange[] = [];

  for (const def of RIG_NODES) {
    for (const d of def.dofs) {
      const a = angleOf(from, def.id, d.axis);
      const b = angleOf(to, def.id, d.axis);
      const delta = b - a;
      if (Math.abs(delta) < ANGLE_EPSILON) continue;
      const jointId = d.joint ?? def.joint;
      if (!jointId) continue;
      const motion = motionForChange(d, a, b);
      // A limb is in a closed chain if a grounded contact lies distal to this joint.
      const closedChain =
        resolvedSupport === 'floor' &&
        grounded.has(def.id) &&
        subtree(def.id).some((n) => n !== def.id && grounded.has(n));
      const gravity = gravityRelation(rig, def.id, d.axis, Math.sign(delta), contacts);
      const joint = JOINT_BY_ID[jointId];
      const degrees = Math.abs(delta);
      changes.push({
        joint: jointId,
        jointName: joint ? sidedName(joint.name, joint.side) : jointId,
        node: def.id,
        nodeLabel: def.label,
        axis: d.axis,
        from: a,
        to: b,
        delta,
        motion,
        degrees,
        gravity,
        closedChain,
        note: gravityNote(motion, gravity, closedChain),
      });
    }
  }

  changes.sort((x, y) => y.degrees - x.degrees);
  return changes;
}

function sidedName(name: string, side: string): string {
  if (side === 'center') return name;
  return `${side === 'left' ? 'Left' : 'Right'} ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

function gravityNote(motion: MotionName, gravity: GravityRelation, closedChain: boolean): string {
  const chain = closedChain ? ' The limb is weight-bearing, so the body moves over a fixed foot.' : '';
  switch (gravity) {
    case 'assists':
      return `Gravity pulls the segment into ${motion}, so the muscles that oppose ${motion} control the movement eccentrically rather than the ones that produce it.${chain}`;
    case 'resists':
      return `Gravity opposes ${motion}, so the muscles that produce ${motion} shorten under load — a concentric contraction.${chain}`;
    default:
      return `The rotation axis is close to vertical here, so gravity barely influences this motion; whichever muscles produce ${motion} do the work.${chain}`;
  }
}

const ROLE_WEIGHT: Record<MuscleRole, number> = {
  'prime mover': 1,
  'eccentric brake': 1,
  synergist: 0.68,
  'antagonist — stretched': 0.3,
  'shortened, unloaded': 0.28,
  stabiliser: 0.26,
};

/**
 * Compare two poses and rank every muscle by how implicated it is in the change.
 */
export function analysePoseChange(from: Pose, to: Pose, support?: Support): PoseAnalysis {
  const rigFrom = new Rig();
  rigFrom.applyPose(from);
  const rigTo = new Rig();
  rigTo.applyPose(to);

  const jointChanges = diffPoses(from, to, support);
  const changeByJoint = new Map<string, JointChange[]>();
  for (const c of jointChanges) {
    const list = changeByJoint.get(c.joint) ?? [];
    list.push(c);
    changeByJoint.set(c.joint, list);
  }

  const involvement: MuscleInvolvement[] = [];

  for (const muscle of MUSCLES) {
    const lengthFrom = rigFrom.pathLength(muscle.path);
    const lengthTo = rigTo.pathLength(muscle.path);
    if (lengthFrom < 1e-6) continue;
    const deltaPct = (lengthTo - lengthFrom) / lengthFrom;

    const agonistDrivers: { change: JointChange; weight: number }[] = [];
    const antagonistDrivers: { change: JointChange; weight: number }[] = [];
    let stabiliserDriver: JointChange | undefined;

    for (const action of muscle.actions) {
      const changes = changeByJoint.get(action.joint);
      if (!changes) continue;
      const weight = action.role === 'prime' ? 1 : action.role === 'assist' ? 0.65 : 0.35;
      for (const change of changes) {
        if (action.motion === change.motion) agonistDrivers.push({ change, weight });
        else if (OPPOSITE[action.motion] === change.motion) antagonistDrivers.push({ change, weight });
        else if (action.role === 'stabilise') stabiliserDriver ??= change;
      }
    }

    // Muscles that span a joint that moved but do not act on it are stabilisers/passengers.
    if (!agonistDrivers.length && !antagonistDrivers.length && !stabiliserDriver) {
      for (const change of jointChanges) {
        if (rigFrom.pathCrossesNode(muscle.path, change.node)) {
          stabiliserDriver = change;
          break;
        }
      }
    }

    if (!agonistDrivers.length && !antagonistDrivers.length && !stabiliserDriver) continue;

    const shortening = deltaPct < -LENGTH_EPSILON;
    const lengthening = deltaPct > LENGTH_EPSILON;

    const bestAgonist = pickDominant(agonistDrivers);
    const bestAntagonist = pickDominant(antagonistDrivers);

    let role: MuscleRole;
    let contraction: ContractionType;
    let drivers: JointChange[];
    let explanation: string;

    const agonistGravity = bestAgonist?.change.gravity;
    const antagonistGravity = bestAntagonist?.change.gravity;

    if (bestAntagonist && lengthening && antagonistGravity === 'assists') {
      role = 'eccentric brake';
      contraction = 'eccentric';
      drivers = antagonistDrivers.map((d) => d.change);
      explanation = `Lengthens by ${pct(deltaPct)} while resisting ${bestAntagonist.change.motion} at the ${bestAntagonist.change.jointName.toLowerCase()}. Gravity is driving that motion, so this muscle pays out under tension to control it.`;
    } else if (bestAgonist && shortening && agonistGravity !== 'assists') {
      const prime = agonistDrivers.some((d) => d.weight === 1);
      role = prime ? 'prime mover' : 'synergist';
      contraction = 'concentric';
      drivers = agonistDrivers.map((d) => d.change);
      explanation = `Shortens by ${pct(-deltaPct)} producing ${bestAgonist.change.motion} at the ${bestAgonist.change.jointName.toLowerCase()}${agonistGravity === 'resists' ? ' against gravity' : ''}.`;
    } else if (bestAgonist && shortening) {
      role = 'shortened, unloaded';
      contraction = 'concentric';
      drivers = agonistDrivers.map((d) => d.change);
      explanation = `Shortens by ${pct(-deltaPct)}, but gravity is already producing ${bestAgonist.change.motion} here, so little active force is needed.`;
    } else if (bestAntagonist && lengthening) {
      role = 'antagonist — stretched';
      contraction = 'passive';
      drivers = antagonistDrivers.map((d) => d.change);
      explanation = `Lengthens by ${pct(deltaPct)} as the joint moves into ${bestAntagonist.change.motion}; it is being stretched rather than working.`;
    } else {
      const driver = bestAgonist?.change ?? bestAntagonist?.change ?? stabiliserDriver;
      if (!driver) continue;
      role = 'stabiliser';
      contraction = 'isometric';
      drivers = [driver];
      explanation = `Length changes by only ${pct(Math.abs(deltaPct))} across this movement — it holds position at the ${driver.jointName.toLowerCase()} while other muscles move it.`;
    }

    const sizeWeight = Math.min(muscle.girth / 0.018, 1.6);
    const excursion = Math.min(Math.abs(deltaPct) / 0.16, 1);
    const angleWeight = Math.min((drivers[0]?.degrees ?? 5) / 60, 1.25);
    const score =
      100 * ROLE_WEIGHT[role] * (0.25 + 0.75 * excursion) * (0.55 + 0.45 * sizeWeight) * (0.6 + 0.4 * angleWeight);

    involvement.push({
      muscle,
      role,
      contraction,
      lengthFrom,
      lengthTo,
      deltaPct,
      score: Math.round(Math.min(score, 100) * 10) / 10,
      drivers: drivers.slice(0, 3),
      explanation,
    });
  }

  involvement.sort((a, b) => b.score - a.score);

  const byRole = (r: MuscleRole) => involvement.filter((i) => i.role === r);
  const primeMovers = byRole('prime mover');
  const eccentric = byRole('eccentric brake');
  const synergists = byRole('synergist');
  const antagonists = [...byRole('antagonist — stretched'), ...byRole('shortened, unloaded')].sort(
    (a, b) => b.score - a.score,
  );
  const stabilisers = byRole('stabiliser');

  return {
    jointChanges,
    involvement,
    primeMovers,
    synergists,
    eccentric,
    antagonists,
    stabilisers,
    summary: buildSummary(jointChanges, primeMovers, eccentric),
  };
}

function pickDominant(list: { change: JointChange; weight: number }[]) {
  if (!list.length) return undefined;
  return list.reduce((best, cur) =>
    cur.change.degrees * cur.weight > best.change.degrees * best.weight ? cur : best,
  );
}

const pct = (v: number) => `${(Math.abs(v) * 100).toFixed(1)}%`;

function buildSummary(
  changes: JointChange[],
  primeMovers: MuscleInvolvement[],
  eccentric: MuscleInvolvement[],
): string {
  if (!changes.length) return 'No joint moved between these two poses.';
  const top = changes.slice(0, 3).map((c) => `${c.jointName.toLowerCase()} ${c.motion} ${Math.round(c.degrees)}°`);
  const movementText = top.join(', ');
  const drivers = [...eccentric, ...primeMovers].sort((a, b) => b.score - a.score);
  if (!drivers.length) return `The movement is ${movementText}, but no muscle in the atlas changed length enough to call it a driver.`;
  // Heads of the same muscle collapse to one name, so de-duplicate before listing.
  const names = [...new Set(drivers.map((d) => shortName(d.muscle)))].slice(0, 3);
  const eccentricLed = eccentric.length && eccentric[0].score >= (primeMovers[0]?.score ?? 0);
  const mode = eccentricLed
    ? 'gravity produces most of this movement, so the work is eccentric — these muscles lower the body under control'
    : 'the work is concentric — these muscles shorten to produce the movement';
  return `Movement: ${movementText}. Here ${mode}. Chief contributors: ${names.join(', ')}.`;
}

function shortName(m: MuscleDef): string {
  const side = m.side === 'center' ? '' : `${m.side === 'left' ? 'L' : 'R'} `;
  return `${side}${m.name.split('—')[0].trim()}`;
}

/** Muscles that produce a given motion at a given joint — used by search and joint panels. */
export function musclesForMotion(joint: string, motion: MotionName): MuscleDef[] {
  return MUSCLES.filter((m) => m.actions.some((a) => a.joint === joint && a.motion === motion)).sort(
    (a, b) => rank(a, joint, motion) - rank(b, joint, motion),
  );
}

function rank(m: MuscleDef, joint: string, motion: MotionName): number {
  const a = m.actions.find((x) => x.joint === joint && x.motion === motion);
  return a?.role === 'prime' ? 0 : a?.role === 'assist' ? 1 : 2;
}
