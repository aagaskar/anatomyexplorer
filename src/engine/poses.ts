/**
 * Reference poses. Angles are written for the left side and mirrored automatically;
 * reflecting through the mid-sagittal plane negates rotations about Y and Z.
 *
 * Two rules keep these poses geometrically honest, and they are worth stating because
 * getting them wrong makes the movement analysis wrong too:
 *
 *  1. **Whole-body lean lives on `root`, not on the joints.** `root` orients the entire
 *     body in the world. A hip hinge is `root` leaning forward *and* the hips flexing to
 *     keep the femurs vertical — writing it as hip flexion alone would tip the legs over.
 *  2. **A planted foot must be flat**: `root.x + hip.x + knee.x + ankle.x = 0`. If that sum
 *     is not zero the sole is tilted, the model balances on heel or toe, and the ground
 *     reaction ends up in the wrong place.
 */

import type { Pose, PosePreset, Vec3 } from '../anatomy/types';

const mirror = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]];

/** Build a pose from left-side entries, mirroring `l_*` keys onto `r_*` unless overridden. */
function build(left: Record<string, Vec3>, overrides: Record<string, Vec3> = {}): Pose {
  const pose: Pose = {};
  for (const [key, value] of Object.entries(left)) {
    pose[key] = value;
    if (key.startsWith('l_')) pose[`r_${key.slice(2)}`] = mirror(value);
  }
  for (const [key, value] of Object.entries(overrides)) pose[key] = value;
  return pose;
}

export const POSE_PRESETS: PosePreset[] = [
  {
    id: 'anatomical',
    name: 'Anatomical position',
    category: 'reference',
    description:
      'The zero point for every measurement in the atlas: upright, feet forward, arms at the sides with the palms facing forward. Every joint angle you see elsewhere is measured from here.',
    pose: {},
  },
  {
    id: 'relaxed_stance',
    name: 'Relaxed standing',
    category: 'reference',
    description:
      'Habitual standing — forearms slightly pronated, elbows softly flexed. Almost no muscle activity is needed: the hip and knee ligaments carry the load, with only intermittent soleus activity to stop you toppling forward.',
    pose: build({
      l_shoulder: [-6, 12, 4],
      l_elbow: [-12, 0, 0],
      l_radioulnar: [0, 55, 0],
    }),
  },
  {
    id: 'squat_bottom',
    name: 'Deep squat — bottom position',
    category: 'lower body',
    description:
      'Below parallel with the torso leaning ~25°, shins forward and the heels down. Compare this against standing to see the descent (eccentric), or standing against this to see the drive out of the hole (concentric).',
    // root 25 + hip -100 + knee 100 + ankle -25 = 0, so the soles stay flat.
    pose: build(
      {
        l_hip: [-100, 0, 10],
        l_knee: [100, 0, 0],
        l_ankle: [-25, 0, 0],
        l_shoulder: [-92, 10, 8],
        l_elbow: [-26, 0, 0],
        l_radioulnar: [0, 70, 0],
      },
      {
        root: [25, 0, 0],
        lumbar: [6, 0, 0],
        thorax: [4, 0, 0],
        neck: [-22, 0, 0],
      },
    ),
  },
  {
    id: 'hip_hinge',
    name: 'Hip hinge (Romanian deadlift)',
    category: 'lower body',
    description:
      'The torso folds forward over near-vertical femurs with the spine held neutral — the classic posterior-chain length position. The hamstrings lengthen at the hip while barely changing at the knee.',
    // root 75 + hip -85 + knee 10 + ankle 0 = 0. The femurs tilt back so the hips sit
    // behind the ankles, which is what puts the ground reaction in front of the hip and
    // makes this a hip-extensor exercise.
    pose: build(
      {
        l_hip: [-85, 0, 2],
        l_knee: [10, 0, 0],
        l_ankle: [0, 0, 0],
        l_shoulder: [-72, 4, 4],
        l_elbow: [-6, 0, 0],
      },
      {
        root: [75, 0, 0],
        lumbar: [-4, 0, 0],
        thorax: [-2, 0, 0],
        neck: [-40, 0, 0],
      },
    ),
  },
  {
    id: 'lunge',
    name: 'Split lunge — bottom position',
    category: 'lower body',
    description:
      'Left leg forward and loaded, right hip extended with the heel lifted and the back knee low. The two sides do completely different jobs in the same movement — front-leg quadriceps and glutes work against back-leg hip flexor length.',
    // Front leg: 8 - 83 + 80 - 5 = 0, so the leading foot stays flat.
    pose: {
      root: [8, 0, 0],
      l_hip: [-83, 0, 4],
      l_knee: [80, 0, 0],
      l_ankle: [-5, 0, 0],
      r_hip: [17, 0, -4],
      r_knee: [78, 0, 0],
      r_ankle: [35, 0, 0],
      r_forefoot: [-45, 0, 0],
      lumbar: [2, 0, 0],
      l_shoulder: [-26, 10, 5],
      r_shoulder: [4, -10, -5],
      l_elbow: [-34, 0, 0],
      r_elbow: [-34, 0, 0],
    },
  },
  {
    id: 'single_leg_stance',
    name: 'Single-leg stance (Trendelenburg test)',
    category: 'clinical',
    description:
      'Standing on the left leg with the right lifted. The left gluteus medius and minimus have to hold the pelvis level — if they cannot, the right side of the pelvis drops, which is a positive Trendelenburg sign.',
    pose: {
      r_hip: [-32, 0, 6],
      r_knee: [58, 0, 0],
      r_ankle: [12, 0, 0],
      l_hip: [0, 0, -4],
      root: [0, 0, -3],
      lumbar: [0, 0, 6],
      l_shoulder: [0, 10, 14],
      r_shoulder: [0, -10, -14],
    },
  },
  {
    id: 'calf_raise',
    name: 'Calf raise — top position',
    category: 'lower body',
    description:
      'Full plantarflexion with the knees straight, so both gastrocnemius and soleus are working. Bend the knees from here and watch the gastrocnemius go slack.',
    pose: build({
      l_ankle: [45, 0, 0],
      l_forefoot: [-32, 0, 0],
      l_shoulder: [-8, 8, 4],
    }),
  },
  {
    id: 'sitting',
    name: 'Seated (90/90)',
    category: 'whole body',
    description:
      'Hips and knees at 90°, weight through the seat. The hip flexors are shortened and the hamstrings shortened at the knee but lengthened at the hip — the position that, held for hours, drives most desk-related stiffness.',
    support: 'pelvis',
    pose: build({
      l_hip: [-88, 0, 6],
      l_knee: [88, 0, 0],
      l_ankle: [0, 0, 0],
      l_shoulder: [-10, 12, 5],
      l_elbow: [-80, 0, 0],
      l_radioulnar: [0, 75, 0],
    }),
  },
  {
    id: 'overhead_reach',
    name: 'Arms overhead',
    category: 'upper body',
    description:
      'Full shoulder elevation. Watch the scapula rotate upward as the arm passes 30° — the scapulohumeral rhythm, roughly 2° of humeral motion for every 1° of scapular rotation.',
    pose: build({
      l_shoulder: [-20, -25, 160],
      l_elbow: [-4, 0, 0],
      l_radioulnar: [0, -20, 0],
    }),
  },
  {
    id: 't_pose',
    name: 'Shoulder abduction 90°',
    category: 'upper body',
    description:
      'Arms straight out at shoulder height. The supraspinatus starts the movement, the middle deltoid drives it, and holding it here is a demanding isometric task for both.',
    pose: build({
      l_shoulder: [0, 0, 90],
    }),
  },
  {
    id: 'pull_up_hang',
    name: 'Dead hang',
    category: 'upper body',
    description:
      'Hanging from a bar with the shoulders fully elevated. The latissimus dorsi and teres major are at their longest, and the scapulae are upwardly rotated and elevated.',
    grounded: false,
    support: 'hands',
    pose: build({
      l_shoulder: [-8, -10, 155],
      l_elbow: [-4, 0, 0],
      l_wrist: [30, 0, 0],
      l_hip: [-12, 0, 4],
      l_knee: [14, 0, 0],
      l_ankle: [24, 0, 0],
    }),
  },
  {
    id: 'pull_up_top',
    name: 'Pull-up — top position',
    category: 'upper body',
    description:
      'Elbows fully flexed with the shoulders adducted and extended. Compare with the dead hang to see the latissimus, teres major and biceps shorten through their full excursion.',
    grounded: false,
    support: 'hands',
    pose: build({
      l_shoulder: [-24, -20, 42],
      l_elbow: [-132, 0, 0],
      l_wrist: [16, 0, 0],
      l_hip: [-16, 0, 4],
      l_knee: [26, 0, 0],
      l_ankle: [22, 0, 0],
    }),
  },
  {
    id: 'biceps_curl',
    name: 'Biceps curl — top position',
    category: 'upper body',
    description:
      'Elbows flexed with the forearms fully supinated. Supination matters: the biceps is both an elbow flexor and the strongest supinator, and it produces most force when doing both at once.',
    pose: build({
      l_shoulder: [-8, 8, 6],
      l_elbow: [-138, 0, 0],
      l_radioulnar: [0, -85, 0],
    }),
  },
  {
    id: 'throw_cocking',
    name: 'Throwing — late cocking',
    category: 'upper body',
    description:
      'Right arm abducted to 90° and maximally externally rotated with the trunk rotated away. The position where the anterior capsule and subscapularis take enormous load, and where most throwing injuries begin.',
    pose: {
      r_shoulder: [-8, -88, -92],
      r_elbow: [-92, 0, 0],
      r_radioulnar: [0, 20, 0],
      r_wrist: [30, 0, 0],
      l_shoulder: [-70, 0, 34],
      l_elbow: [-24, 0, 0],
      thorax: [0, 30, 0],
      lumbar: [0, 8, 0],
      neck: [0, -28, 0],
      l_hip: [-28, 0, 8],
      l_knee: [26, 0, 0],
      r_hip: [8, 0, -6],
      r_knee: [16, 0, 0],
      r_ankle: [-22, 0, 0],
      l_ankle: [2, 0, 0],
    },
  },
  {
    id: 'sprint_drive',
    name: 'Sprint — drive phase',
    category: 'whole body',
    description:
      'Left hip flexed high with the right hip extended and the ankle plantarflexed at toe-off, arms driving in opposition. The moment of peak hamstring load on the swinging leg.',
    grounded: false,
    pose: {
      root: [12, 0, 0],
      l_hip: [-100, 0, 4],
      l_knee: [96, 0, 0],
      l_ankle: [-14, 0, 0],
      r_hip: [22, 0, -3],
      r_knee: [20, 0, 0],
      r_ankle: [42, 0, 0],
      r_forefoot: [-40, 0, 0],
      lumbar: [0, -4, 0],
      thorax: [0, -8, 0],
      l_shoulder: [50, 6, 8],
      l_elbow: [-92, 0, 0],
      r_shoulder: [-62, -6, -8],
      r_elbow: [-88, 0, 0],
    },
  },
  {
    id: 'trunk_rotation',
    name: 'Trunk rotation to the left',
    category: 'whole body',
    description:
      'Thoracic and lumbar rotation to the left. The right external oblique and the left internal oblique work as a pair — one rotates contralaterally, the other ipsilaterally.',
    pose: {
      thorax: [0, -32, 0],
      lumbar: [0, -11, 0],
      neck: [0, -30, 0],
      l_shoulder: [-40, 0, 20],
      r_shoulder: [-40, 0, -20],
      l_elbow: [-60, 0, 0],
      r_elbow: [-60, 0, 0],
    },
  },
  {
    id: 'neck_rotation',
    name: 'Cervical rotation to the right',
    category: 'clinical',
    description:
      'Turning the head to the right. About half of this comes from the atlanto-axial joint alone. The left sternocleidomastoid rotates the head to the right, while the right splenius capitis rotates it to its own side.',
    pose: {
      neck: [0, 58, 0],
      head: [0, 30, 0],
    },
  },
  {
    id: 'forward_head',
    name: 'Forward head posture',
    category: 'clinical',
    description:
      'Upper cervical extension with lower cervical flexion and a protracted shoulder girdle — the desk-work pattern. The deep cervical flexors lengthen and inhibit while the suboccipitals and upper trapezius shorten.',
    pose: build(
      {
        l_clavicle: [0, -18, 4],
        l_scapula: [0, 12, -6],
        l_shoulder: [-14, 26, 6],
        l_elbow: [-40, 0, 0],
        l_radioulnar: [0, 80, 0],
      },
      {
        neck: [22, 0, 0],
        head: [-16, 0, 0],
        thorax: [14, 0, 0],
        lumbar: [8, 0, 0],
      },
    ),
  },
];

export const POSE_PRESET_BY_ID: Record<string, PosePreset> = Object.fromEntries(
  POSE_PRESETS.map((p) => [p.id, p]),
);
