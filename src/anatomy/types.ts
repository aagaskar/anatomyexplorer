/**
 * Core data model for the anatomy atlas.
 *
 * Everything the app knows about the body is expressed with these types:
 *
 *  - A `RigNodeDef` tree is the articulated skeleton (the thing that can be posed).
 *  - `BoneDef`s hang off rig nodes and carry the geometry + reference data for bones.
 *  - `MuscleDef`s are defined as a *path* of attachment points, each anchored to a rig
 *    node. Because attachments are anchored to the rig, muscle length is a pure
 *    function of the pose — which is what makes the movement analyser possible.
 *  - `JointDef`s describe the articulations and their degrees of freedom.
 *  - `NerveDef`s are paths too, plus the muscles they supply.
 */

export type Side = 'left' | 'right' | 'center';

export type Vec3 = [number, number, number];

export type StructureKind = 'muscle' | 'bone' | 'joint' | 'nerve';

/** Anatomical planes/axes a degree of freedom operates in. */
export type RotationAxis = 'x' | 'y' | 'z';

/**
 * A named motion. Used both for joint ROM description and for muscle actions, so the
 * movement analyser can match "this joint rotated in this direction" against
 * "this muscle produces that motion at that joint".
 */
export type MotionName =
  | 'flexion'
  | 'extension'
  | 'hyperextension'
  | 'abduction'
  | 'adduction'
  | 'internal rotation'
  | 'external rotation'
  | 'lateral flexion'
  | 'rotation'
  | 'pronation'
  | 'supination'
  | 'dorsiflexion'
  | 'plantarflexion'
  | 'inversion'
  | 'eversion'
  | 'elevation'
  | 'depression'
  | 'protraction'
  | 'retraction'
  | 'upward rotation'
  | 'downward rotation'
  | 'radial deviation'
  | 'ulnar deviation'
  | 'opposition'
  | 'circumduction'
  // Midline structures need a direction, since "rotation" alone is ambiguous.
  | 'right rotation'
  | 'left rotation'
  | 'right lateral flexion'
  | 'left lateral flexion'
  | 'anterior tilt'
  | 'posterior tilt'
  // Whole-body orientation, not an anatomical joint motion.
  | 'forward lean'
  | 'backward lean';

/** One degree of freedom of a rig node, with its range of motion in degrees. */
export interface DofDef {
  axis: RotationAxis;
  /** Motion produced when the local angle increases. */
  positive: MotionName;
  /** Motion produced when the local angle decreases. */
  negative: MotionName;
  /** Lower limit, degrees (negative = in the `negative` motion direction). */
  min: number;
  /** Upper limit, degrees. */
  max: number;
  /**
   * Joint this degree of freedom belongs to. Some rig nodes carry two joints
   * (e.g. the ankle node expresses both talocrural and subtalar motion); when
   * omitted the node's own `joint` is used.
   */
  joint?: string;
}

/** A node in the articulated skeleton. */
export interface RigNodeDef {
  id: string;
  /** Display name for the segment this node controls. */
  label: string;
  parent: string | null;
  /** Translation from the parent node, in the parent's local space (metres). */
  offset: Vec3;
  /**
   * Local direction the controlled segment points in at rest. Used by drag-to-pose
   * to aim the segment at the pointer, and by the analyser to reason about gravity.
   */
  aim?: Vec3;
  /** Approximate length of the controlled segment (metres) — used for drag gizmos. */
  segmentLength?: number;
  dofs: DofDef[];
  /** Id of the `JointDef` this node articulates at, if it is an anatomical joint. */
  joint?: string;
  /** Approximate mass fraction of the segment distal to this node (for gravity cues). */
  massFraction?: number;
  side: Side;
  /** Excluded from drag-to-pose (e.g. structural helper nodes). */
  poseLocked?: boolean;
}

/**
 * Bone geometry is generated procedurally — there is no downloaded mesh asset, so the
 * atlas is self-contained. Each shape is a recipe consumed by `three/boneGeometry.ts`.
 * All coordinates are in the local space of the bone's rig node.
 */
export type BoneShape =
  /** Shaft with flared epiphyses: femur, humerus, ribs, metacarpals, clavicle. */
  | {
      kind: 'long';
      from: Vec3;
      to: Vec3;
      shaftRadius: number;
      proximalRadius?: number;
      distalRadius?: number;
      /** Lateral bow of the shaft, in metres, along `bowAxis`. */
      bow?: number;
      bowAxis?: Vec3;
      /** Extra rounded head offset from the proximal end (femoral/humeral head). */
      head?: { offset: Vec3; radius: number };
    }
  /** A run of vertebrae between two points. */
  | {
      kind: 'spine';
      from: Vec3;
      to: Vec3;
      count: number;
      bodyRadius: number;
      spinous: number;
      /** Positive = kyphotic (posterior) bow, negative = lordotic. */
      curve?: number;
    }
  | { kind: 'ribcage'; center: Vec3; pairs: number; height: number; width: number; depth: number }
  | { kind: 'skull'; center: Vec3; radius: number }
  | { kind: 'mandible'; center: Vec3; width: number; height: number; depth: number }
  | { kind: 'scapula'; center: Vec3; width: number; height: number; mirror: boolean }
  | { kind: 'hipbone'; center: Vec3; width: number; height: number; depth: number; mirror: boolean }
  | { kind: 'sacrum'; center: Vec3; width: number; height: number }
  | { kind: 'plate'; center: Vec3; size: Vec3 }
  | { kind: 'blob'; center: Vec3; radii: Vec3 }
  /** Cluster of small bones (carpals, tarsals). */
  | { kind: 'cluster'; center: Vec3; extent: Vec3; count: number; radius: number; seed?: number }
  /** Metacarpals + phalanges fan. */
  | { kind: 'digits'; base: Vec3; direction: Vec3; spread: Vec3; rays: number; length: number; radius: number }
  | { kind: 'footArch'; center: Vec3; length: number; width: number; height: number };

export type BoneClass = 'long' | 'short' | 'flat' | 'irregular' | 'sesamoid';

export interface BoneDef {
  id: string;
  name: string;
  latin: string;
  /** Rig node the bone is rigidly attached to. */
  node: string;
  side: Side;
  region: string;
  boneClass: BoneClass;
  shape: BoneShape;
  /** Palpable/notable surface features. */
  landmarks: string[];
  /** Joints this bone participates in. */
  articulations: string[];
  notes: string;
  /** Ossification / clinical trivia worth surfacing. */
  clinical?: string;
}

/** A muscle attachment or a routing waypoint along a muscle's line of pull. */
export interface MusclePoint {
  /** Rig node the point is fixed to. */
  node: string;
  /** Position in that node's local space (metres). */
  pos: Vec3;
  /**
   * Waypoints only shape the path (they are not attachments). Marked so the UI can
   * describe origin/insertion correctly.
   */
  via?: boolean;
}

export type MuscleActionRole = 'prime' | 'assist' | 'stabilise';

export interface MuscleAction {
  /** Joint id the action happens at. */
  joint: string;
  motion: MotionName;
  role: MuscleActionRole;
}

export type ExerciseKind =
  | 'isolation'
  | 'compound'
  | 'activation'
  | 'stretch'
  | 'manual test';

export interface Exercise {
  name: string;
  kind: ExerciseKind;
  /** Equipment needed, or "bodyweight". */
  equipment: string;
  /** How to bias the target muscle — the "isolation" trick. */
  cue: string;
  /** The joint motion the exercise resists. */
  motion: string;
}

export interface MuscleDef {
  id: string;
  name: string;
  latin: string;
  side: Side;
  /** Functional group, e.g. "Quadriceps femoris". */
  group: string;
  region: 'shoulder' | 'arm' | 'forearm' | 'hand' | 'back' | 'chest' | 'abdomen' | 'neck' | 'hip' | 'thigh' | 'leg' | 'foot';
  /** Superficial muscles are drawn first / are visible in the outer layer. */
  layer: 1 | 2 | 3;
  /** Ordered path: first point = origin, last = insertion, middle = via/attachment. */
  path: MusclePoint[];
  /** Belly radius in metres at its thickest. */
  girth: number;
  originDesc: string;
  insertionDesc: string;
  actions: MuscleAction[];
  innervation: string;
  nerve?: string;
  bloodSupply?: string;
  fiberType?: string;
  exercises: Exercise[];
  palpation?: string;
  clinical?: string;
  /** Muscles that oppose this one — used to sanity-check analyser output. */
  antagonists?: string[];
  synergists?: string[];
}

export type JointClass =
  | 'ball and socket'
  | 'hinge'
  | 'pivot'
  | 'saddle'
  | 'plane'
  | 'condyloid'
  | 'cartilaginous'
  | 'fibrous'
  | 'functional';

export interface JointDef {
  id: string;
  name: string;
  latin?: string;
  side: Side;
  jointClass: JointClass;
  /** Rig node whose rotation expresses this joint's motion. */
  node: string;
  /** Position for the joint marker, in the node's local space. */
  marker: Vec3;
  markerRadius: number;
  bones: string[];
  ligaments: string[];
  movements: string[];
  /** Human-readable ROM summary. */
  rangeOfMotion: string[];
  notes: string;
  clinical?: string;
}

export interface NerveDef {
  id: string;
  name: string;
  latin?: string;
  side: Side;
  /** Spinal levels of origin, e.g. "C5–C6". */
  roots: string;
  plexus?: string;
  kind: 'motor' | 'sensory' | 'mixed' | 'plexus' | 'cord';
  path: MusclePoint[];
  radius: number;
  course: string;
  motorSupply: string[];
  sensorySupply: string;
  /** Muscle ids supplied — links the nerve panel to the muscle list. */
  muscles: string[];
  clinical?: string;
}

/** A saved pose: rig node id -> Euler angles in degrees (XYZ order). */
export type Pose = Record<string, Vec3>;

export interface PosePreset {
  id: string;
  name: string;
  description: string;
  category: 'reference' | 'lower body' | 'upper body' | 'whole body' | 'clinical';
  pose: Pose;
  /** Set false for hanging or unsupported poses that should not be dropped to the floor. */
  grounded?: boolean;
  /** What the body is taking its weight through — drives the movement analysis. */
  support?: 'floor' | 'hands' | 'pelvis';
}

/** Anything selectable in the 3D scene. */
export interface StructureRef {
  kind: StructureKind;
  id: string;
}
