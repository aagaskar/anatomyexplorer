/**
 * The skeleton: 26 unique bones / bone groups, mirrored to ~44 rendered structures.
 *
 * Geometry is described declaratively (see `BoneShape`) and built at runtime, so the
 * atlas ships with no external model files. Coordinates are in the local space of each
 * bone's rig node — see `rig.ts` for the axis conventions.
 */

import type { BoneDef, BoneShape, Vec3 } from './types';

const neg = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];

/** Reflect a shape recipe through the mid-sagittal plane. */
function mirrorShape(s: BoneShape): BoneShape {
  switch (s.kind) {
    case 'long':
      return {
        ...s,
        from: neg(s.from),
        to: neg(s.to),
        bow: s.bow,
        bowAxis: s.bowAxis ? neg(s.bowAxis) : undefined,
        head: s.head ? { offset: neg(s.head.offset), radius: s.head.radius } : undefined,
      };
    case 'spine':
      return { ...s, from: neg(s.from), to: neg(s.to) };
    case 'digits':
      return { ...s, base: neg(s.base), direction: neg(s.direction), spread: neg(s.spread) };
    case 'scapula':
    case 'hipbone':
      return { ...s, center: neg(s.center), mirror: !s.mirror };
    default:
      return { ...s, center: neg((s as { center: Vec3 }).center) } as BoneShape;
  }
}

const LEFT_BONES: BoneDef[] = [
  // ------------------------------------------------------------------ shoulder girdle
  {
    id: 'l_clavicle',
    name: 'Clavicle',
    latin: 'Clavicula',
    node: 'l_clavicle',
    side: 'left',
    region: 'Shoulder girdle',
    boneClass: 'long',
    shape: {
      kind: 'long',
      from: [0, 0, 0],
      to: [0.14, 0, -0.05],
      shaftRadius: 0.011,
      proximalRadius: 0.015,
      distalRadius: 0.013,
      bow: 0.022,
      bowAxis: [0, 0, 1],
    },
    landmarks: ['Sternal (medial) end', 'Acromial (lateral) end', 'Conoid tubercle', 'Subclavian groove'],
    articulations: ['l_sternoclavicular', 'l_acromioclavicular'],
    notes:
      'The only bony strut linking the upper limb to the axial skeleton. Its S-shape keeps the shoulder held out laterally, preserving the space through which the brachial plexus and axillary vessels pass.',
    clinical:
      'Most commonly fractured bone in childhood; the middle third fails first because it is the transition between the two curvatures. It is also the last bone to complete ossification (~age 25).',
  },
  {
    id: 'l_scapula',
    name: 'Scapula',
    latin: 'Scapula',
    node: 'l_scapula',
    side: 'left',
    region: 'Shoulder girdle',
    boneClass: 'flat',
    shape: { kind: 'scapula', center: [0, 0, -0.012], width: 0.1, height: 0.155, mirror: false },
    landmarks: [
      'Acromion',
      'Coracoid process',
      'Glenoid fossa',
      'Spine of the scapula',
      'Supraspinous and infraspinous fossae',
      'Inferior angle',
      'Medial (vertebral) border',
    ],
    articulations: ['l_glenohumeral', 'l_acromioclavicular', 'l_scapulothoracic'],
    notes:
      'A triangular plate suspended in muscle rather than locked into a socket — 17 muscles attach to it. Because it floats, shoulder range depends as much on scapular motion as on the glenohumeral joint itself.',
    clinical:
      'Winging of the scapula follows long thoracic nerve palsy (serratus anterior) or trapezius weakness, and is best shown by a wall push-up.',
  },
  // ---------------------------------------------------------------------- upper limb
  {
    id: 'l_humerus',
    name: 'Humerus',
    latin: 'Humerus',
    node: 'l_shoulder',
    side: 'left',
    region: 'Arm',
    boneClass: 'long',
    shape: {
      kind: 'long',
      from: [0, 0, 0],
      to: [0.03, -0.3, -0.01],
      shaftRadius: 0.016,
      proximalRadius: 0.026,
      distalRadius: 0.027,
      head: { offset: [-0.014, 0.016, -0.012], radius: 0.025 },
    },
    landmarks: [
      'Head',
      'Greater and lesser tubercles',
      'Intertubercular (bicipital) groove',
      'Deltoid tuberosity',
      'Radial groove',
      'Medial and lateral epicondyles',
      'Trochlea and capitulum',
      'Olecranon fossa',
    ],
    articulations: ['l_glenohumeral', 'l_elbow'],
    notes:
      'The longest bone of the upper limb. Its deltoid tuberosity marks the mid-shaft insertion of the deltoid; the spiral radial groove carries the radial nerve across the posterior shaft.',
    clinical:
      'Mid-shaft fractures endanger the radial nerve (wrist drop). Surgical-neck fractures endanger the axillary nerve and posterior circumflex humeral artery.',
  },
  {
    id: 'l_radius',
    name: 'Radius',
    latin: 'Radius',
    node: 'l_radioulnar',
    side: 'left',
    region: 'Forearm',
    boneClass: 'long',
    shape: {
      kind: 'long',
      from: [0.014, -0.008, 0.004],
      to: [0.022, -0.253, 0.012],
      shaftRadius: 0.009,
      proximalRadius: 0.012,
      distalRadius: 0.017,
    },
    landmarks: ['Head', 'Neck', 'Radial tuberosity', 'Styloid process', 'Ulnar notch', 'Interosseous border'],
    articulations: ['l_elbow', 'l_radioulnar', 'l_wrist'],
    notes:
      'The lateral (thumb-side) forearm bone and the one that carries the hand: it pivots around the ulna in pronation and supination, and forms the whole of the proximal wrist joint surface.',
    clinical:
      "Colles' fracture — a distal radius fracture with dorsal displacement — is the classic fall-on-outstretched-hand injury.",
  },
  {
    id: 'l_ulna',
    name: 'Ulna',
    latin: 'Ulna',
    node: 'l_elbow',
    side: 'left',
    region: 'Forearm',
    boneClass: 'long',
    shape: {
      kind: 'long',
      from: [-0.01, 0.012, -0.008],
      to: [-0.006, -0.252, 0.006],
      shaftRadius: 0.009,
      proximalRadius: 0.019,
      distalRadius: 0.011,
    },
    landmarks: ['Olecranon', 'Coronoid process', 'Trochlear notch', 'Radial notch', 'Head', 'Styloid process'],
    articulations: ['l_elbow', 'l_radioulnar'],
    notes:
      'The medial forearm bone and the stable one: its trochlear notch grips the humeral trochlea to make the elbow a true hinge. The ulna does not reach the wrist joint proper.',
    clinical:
      'The olecranon is the bony point of the elbow and is subcutaneous — hence olecranon bursitis. The ulnar nerve runs behind the medial epicondyle just proximal to it ("funny bone").',
  },
  {
    id: 'l_carpals',
    name: 'Carpal bones',
    latin: 'Ossa carpi',
    node: 'l_wrist',
    side: 'left',
    region: 'Hand',
    boneClass: 'short',
    shape: { kind: 'cluster', center: [0, -0.018, 0.002], extent: [0.05, 0.022, 0.02], count: 8, radius: 0.0095, seed: 3 },
    landmarks: [
      'Proximal row: scaphoid, lunate, triquetrum, pisiform',
      'Distal row: trapezium, trapezoid, capitate, hamate',
      'Hook of hamate',
      'Carpal tunnel (floor)',
    ],
    articulations: ['l_wrist', 'l_midcarpal', 'l_thumb_cmc'],
    notes:
      'Eight short bones in two rows, arched to form the carpal tunnel. Most wrist flexion and extension is shared between the radiocarpal and midcarpal joints rather than happening at one line.',
    clinical:
      'The scaphoid is the most commonly fractured carpal and is prone to avascular necrosis of its proximal pole, because its blood supply enters distally.',
  },
  {
    id: 'l_metacarpals',
    name: 'Metacarpals',
    latin: 'Ossa metacarpi',
    node: 'l_wrist',
    side: 'left',
    region: 'Hand',
    boneClass: 'long',
    shape: {
      kind: 'digits',
      base: [0.004, -0.032, 0.004],
      direction: [0.03, -1, 0.02],
      spread: [0.052, 0, 0.012],
      rays: 4,
      length: 0.072,
      radius: 0.0062,
    },
    landmarks: ['Bases', 'Shafts', 'Heads (the knuckles)'],
    articulations: ['l_mcp', 'l_midcarpal'],
    notes:
      'Miniature long bones forming the palm. The 2nd and 3rd are effectively fixed to give the hand a stable central pillar; the 4th and 5th are mobile, which is what lets the palm cup.',
    clinical:
      "A 5th metacarpal neck fracture is a boxer's fracture, produced by punching with a closed fist.",
  },
  {
    id: 'l_phalanges_hand',
    name: 'Phalanges of the hand',
    latin: 'Phalanges manus',
    node: 'l_fingers',
    side: 'left',
    region: 'Hand',
    boneClass: 'long',
    shape: {
      kind: 'digits',
      base: [0, 0, 0],
      direction: [0.03, -1, 0.03],
      spread: [0.05, 0, 0.012],
      rays: 4,
      length: 0.07,
      radius: 0.0052,
    },
    landmarks: ['Proximal, middle and distal phalanges', 'Interphalangeal joints'],
    articulations: ['l_mcp', 'l_pip'],
    notes:
      'Fourteen bones across the four fingers (three each) plus two in the thumb. No muscle belly lies distal to the wrist for the long flexors — the fingers are driven by tendons from the forearm.',
  },
  {
    id: 'l_thumb',
    name: 'Thumb (1st metacarpal and phalanges)',
    latin: 'Pollex',
    node: 'l_thumb',
    side: 'left',
    region: 'Hand',
    boneClass: 'long',
    shape: {
      kind: 'digits',
      base: [0, 0, 0],
      direction: [0.28, -1, 0.3],
      spread: [0, 0, 0],
      rays: 1,
      length: 0.075,
      radius: 0.0075,
    },
    landmarks: ['1st metacarpal', 'Proximal and distal phalanges', 'Sesamoids at the MCP joint'],
    articulations: ['l_thumb_cmc', 'l_mcp'],
    notes:
      'Set at right angles to the other digits. Its saddle-shaped carpometacarpal joint is what makes opposition — and therefore the human grip — possible.',
    clinical:
      'The thumb CMC joint is a very common site of primary osteoarthritis, presenting as pain at the base of the thumb on pinch grip.',
  },
  // ---------------------------------------------------------------------- lower limb
  {
    id: 'l_hipbone',
    name: 'Hip bone (ilium, ischium, pubis)',
    latin: 'Os coxae',
    node: 'pelvis',
    side: 'left',
    region: 'Pelvis',
    boneClass: 'irregular',
    shape: { kind: 'hipbone', center: [0.068, 0.004, -0.004], width: 0.088, height: 0.126, depth: 0.1, mirror: false },
    landmarks: [
      'Iliac crest',
      'Anterior superior iliac spine (ASIS)',
      'Anterior inferior iliac spine (AIIS)',
      'Posterior superior iliac spine (PSIS)',
      'Ischial tuberosity',
      'Ischial spine',
      'Pubic tubercle',
      'Acetabulum',
      'Greater sciatic notch',
    ],
    articulations: ['l_hip', 'sacroiliac', 'pubic_symphysis'],
    notes:
      'Three bones fused at the acetabulum by adolescence. Its landmarks are the anchor points for clinical measurement: ASIS for leg length and pelvic tilt, ischial tuberosity for the hamstrings, iliac crest for the abdominal wall.',
    clinical:
      'Avulsion of the ASIS (sartorius) or AIIS (rectus femoris) occurs in adolescent sprinters before the apophyses fuse. Ischial tuberosity pain in a runner suggests high hamstring tendinopathy.',
  },
  {
    id: 'l_femur',
    name: 'Femur',
    latin: 'Femur',
    node: 'l_hip',
    side: 'left',
    region: 'Thigh',
    boneClass: 'long',
    shape: {
      kind: 'long',
      from: [0, 0, 0],
      to: [0.01, -0.44, 0.005],
      shaftRadius: 0.019,
      proximalRadius: 0.028,
      distalRadius: 0.033,
      bow: 0.014,
      bowAxis: [0, 0, 1],
      head: { offset: [-0.024, 0.016, 0], radius: 0.025 },
    },
    landmarks: [
      'Head and neck',
      'Greater trochanter',
      'Lesser trochanter',
      'Intertrochanteric line and crest',
      'Linea aspera',
      'Adductor tubercle',
      'Medial and lateral condyles',
      'Intercondylar fossa',
    ],
    articulations: ['l_hip', 'l_knee'],
    notes:
      'The longest, strongest bone in the body. Its angled neck converts the vertical load of the trunk into a bending load, which is why the neck is the classic osteoporotic failure point.',
    clinical:
      'A femoral neck fracture risks avascular necrosis of the head because the retinacular vessels run along the neck. The Q-angle between the femoral shaft and the patellar tendon is greater in wider pelves and influences patellofemoral tracking.',
  },
  {
    id: 'l_patella',
    name: 'Patella',
    latin: 'Patella',
    node: 'l_knee',
    side: 'left',
    region: 'Knee',
    boneClass: 'sesamoid',
    shape: { kind: 'blob', center: [0.001, 0.028, 0.036], radii: [0.021, 0.025, 0.009] },
    landmarks: ['Base', 'Apex', 'Medial and lateral facets'],
    articulations: ['l_patellofemoral'],
    notes:
      'The largest sesamoid bone, embedded in the quadriceps tendon. It increases the extensor moment arm by roughly 30% and protects the front of the knee.',
    clinical:
      'Lateral patellar tracking causes patellofemoral pain; vastus medialis obliquus timing and hip abductor strength both influence it.',
  },
  {
    id: 'l_tibia',
    name: 'Tibia',
    latin: 'Tibia',
    node: 'l_knee',
    side: 'left',
    region: 'Leg',
    boneClass: 'long',
    shape: {
      kind: 'long',
      from: [-0.005, 0, 0.004],
      to: [-0.005, -0.4, -0.004],
      shaftRadius: 0.016,
      proximalRadius: 0.029,
      distalRadius: 0.022,
    },
    landmarks: [
      'Medial and lateral condyles',
      'Tibial tuberosity',
      'Intercondylar eminence',
      'Anterior border (shin)',
      'Medial malleolus',
      'Soleal line',
    ],
    articulations: ['l_knee', 'l_ankle', 'l_tibiofibular'],
    notes:
      'The weight-bearing bone of the leg — the fibula carries almost none. Its anteromedial surface is subcutaneous for its whole length, which is why the shin is so easily barked.',
    clinical:
      'Tibial tuberosity traction apophysitis is Osgood–Schlatter disease. The tibia is the commonest site of stress fracture in runners and of compartment syndrome after trauma.',
  },
  {
    id: 'l_fibula',
    name: 'Fibula',
    latin: 'Fibula',
    node: 'l_knee',
    side: 'left',
    region: 'Leg',
    boneClass: 'long',
    shape: {
      kind: 'long',
      from: [0.024, -0.02, -0.006],
      to: [0.022, -0.4, -0.008],
      shaftRadius: 0.008,
      proximalRadius: 0.013,
      distalRadius: 0.014,
    },
    landmarks: ['Head', 'Neck', 'Lateral malleolus', 'Interosseous border'],
    articulations: ['l_tibiofibular', 'l_ankle'],
    notes:
      'A muscle-attachment strut rather than a weight-bearing column. Its lateral malleolus descends further than the medial one, which is why the ankle inverts more readily than it everts.',
    clinical:
      'The common peroneal nerve wraps the fibular neck superficially — a plaster cast or crossed legs pressing there causes foot drop.',
  },
  {
    id: 'l_tarsals',
    name: 'Tarsal bones',
    latin: 'Ossa tarsi',
    node: 'l_ankle',
    side: 'left',
    region: 'Foot',
    boneClass: 'short',
    shape: { kind: 'footArch', center: [0, -0.028, 0.012], length: 0.135, width: 0.062, height: 0.055 },
    landmarks: [
      'Talus (trochlea, head)',
      'Calcaneus (tuberosity, sustentaculum tali)',
      'Navicular tuberosity',
      'Cuboid',
      'Three cuneiforms',
    ],
    articulations: ['l_ankle', 'l_subtalar', 'l_midfoot'],
    notes:
      'Seven bones forming the hindfoot and midfoot. The talus receives the whole body load and passes it to the calcaneus behind and the arch in front; no muscle attaches to the talus at all.',
    clinical:
      'Plantar fasciitis presents as pain at the medial calcaneal tuberosity, worst on the first steps of the day.',
  },
  {
    id: 'l_metatarsals',
    name: 'Metatarsals',
    latin: 'Ossa metatarsi',
    node: 'l_ankle',
    side: 'left',
    region: 'Foot',
    boneClass: 'long',
    shape: {
      kind: 'digits',
      base: [0, -0.05, 0.045],
      direction: [0, -0.12, 1],
      spread: [0.055, 0, 0],
      rays: 5,
      length: 0.072,
      radius: 0.0062,
    },
    landmarks: ['Bases', 'Shafts', 'Heads', 'Tuberosity of the 5th metatarsal'],
    articulations: ['l_midfoot', 'l_mtp'],
    notes:
      'Five rays forming the forefoot and the transverse arch. The first metatarsal is short and stout because it takes about twice the load of the others at push-off.',
    clinical:
      "An avulsion fracture of the 5th metatarsal base (peroneus brevis) is common with inversion sprains; a shaft fracture at that site is a Jones fracture and heals poorly.",
  },
  {
    id: 'l_phalanges_foot',
    name: 'Phalanges of the foot',
    latin: 'Phalanges pedis',
    node: 'l_forefoot',
    side: 'left',
    region: 'Foot',
    boneClass: 'long',
    shape: {
      kind: 'digits',
      base: [0, 0, 0],
      direction: [0, -0.08, 1],
      spread: [0.052, 0, 0],
      rays: 5,
      length: 0.044,
      radius: 0.0052,
    },
    landmarks: ['Hallux (two phalanges)', 'Lesser toes (three each)'],
    articulations: ['l_mtp'],
    notes:
      'The toes act as a lever at push-off: extending the MTP joints tightens the plantar fascia and raises the arch, the "windlass mechanism".',
  },
];

const CENTER_BONES: BoneDef[] = [
  {
    id: 'skull',
    name: 'Skull',
    latin: 'Cranium',
    node: 'head',
    side: 'center',
    region: 'Head',
    boneClass: 'flat',
    shape: { kind: 'skull', center: [0, 0.052, -0.002], radius: 0.079 },
    landmarks: [
      'Frontal, parietal, temporal and occipital bones',
      'External occipital protuberance',
      'Mastoid process',
      'Nuchal lines',
      'Zygomatic arch',
      'Foramen magnum',
    ],
    articulations: ['atlantooccipital', 'temporomandibular'],
    notes:
      '22 bones, all but the mandible united by sutures. For musculoskeletal purposes the important features are the posterior attachments — the nuchal lines and mastoid process take trapezius, sternocleidomastoid and the deep neck extensors.',
    clinical:
      'The mastoid process is the reference point for sternocleidomastoid palpation and for assessing forward head posture.',
  },
  {
    id: 'mandible',
    name: 'Mandible',
    latin: 'Mandibula',
    node: 'jaw',
    side: 'center',
    region: 'Head',
    boneClass: 'irregular',
    shape: { kind: 'mandible', center: [0, -0.018, 0.004], width: 0.1, height: 0.062, depth: 0.078 },
    landmarks: ['Body', 'Ramus', 'Angle', 'Condylar process', 'Coronoid process', 'Mental protuberance'],
    articulations: ['temporomandibular'],
    notes:
      'The only mobile bone of the skull, and the strongest facial bone. Its condyle both rotates and translates forward on the temporal bone, which is why the jaw can open so far.',
    clinical:
      'Masseter and temporalis overactivity (bruxism) is a common source of "headache" that is really musculoskeletal.',
  },
  {
    id: 'cervical_vertebrae',
    name: 'Cervical vertebrae (C1–C7)',
    latin: 'Vertebrae cervicales',
    node: 'neck',
    side: 'center',
    region: 'Spine',
    boneClass: 'irregular',
    shape: {
      kind: 'spine',
      from: [0, -0.015, -0.018],
      to: [0, 0.115, -0.004],
      count: 7,
      bodyRadius: 0.018,
      spinous: 0.03,
      curve: -0.016,
    },
    landmarks: [
      'C1 atlas (no body, no spinous process)',
      'C2 axis (dens/odontoid peg)',
      'C7 vertebra prominens',
      'Transverse foramina (vertebral artery)',
      'Bifid spinous processes C2–C6',
    ],
    articulations: ['cervical_spine', 'atlantooccipital', 'atlantoaxial'],
    notes:
      'The most mobile part of the spine. Roughly half of all neck rotation happens at the atlanto-axial joint alone; the transverse foramina are unique to the cervical region.',
    clinical:
      'C7 is the palpable landmark for counting spinal levels. Cervical radiculopathy most often involves C6 and C7 roots, giving thumb-side or middle-finger symptoms respectively.',
  },
  {
    id: 'thoracic_vertebrae',
    name: 'Thoracic vertebrae (T1–T12)',
    latin: 'Vertebrae thoracicae',
    node: 'thorax',
    side: 'center',
    region: 'Spine',
    boneClass: 'irregular',
    shape: {
      kind: 'spine',
      from: [0, -0.005, -0.028],
      to: [0, 0.2, -0.042],
      count: 12,
      bodyRadius: 0.022,
      spinous: 0.042,
      curve: 0.022,
    },
    landmarks: ['Costal facets', 'Long downward-sloping spinous processes', 'Transverse processes'],
    articulations: ['thoracic_spine', 'costovertebral'],
    notes:
      'Rotation is generous here and flexion/extension limited, the opposite of the lumbar spine — the ribs and the near-vertical facet joints set that trade-off. This is why thoracic mobility work spares the lumbar spine in rotational sports.',
    clinical:
      'Adolescent Scheuermann kyphosis and osteoporotic wedge fractures both localise to the mid-thoracic spine.',
  },
  {
    id: 'lumbar_vertebrae',
    name: 'Lumbar vertebrae (L1–L5)',
    latin: 'Vertebrae lumbales',
    node: 'lumbar',
    side: 'center',
    region: 'Spine',
    boneClass: 'irregular',
    shape: {
      kind: 'spine',
      from: [0, -0.02, -0.018],
      to: [0, 0.135, -0.03],
      count: 5,
      bodyRadius: 0.027,
      spinous: 0.046,
      curve: -0.026,
    },
    landmarks: [
      'Large kidney-shaped bodies',
      'Short blunt spinous processes',
      'Mamillary processes',
      'Sagittally oriented facet joints',
    ],
    articulations: ['lumbar_spine', 'sacroiliac'],
    notes:
      'Built for load, not rotation: sagittal facet joints permit generous flexion and extension but only about 13° of total rotation. Attempting to rotate under load here is a classic mechanism of disc injury.',
    clinical:
      'L4–L5 and L5–S1 are the commonest disc herniation levels, compressing the L5 and S1 roots (weak dorsiflexion, weak plantarflexion respectively).',
  },
  {
    id: 'sacrum',
    name: 'Sacrum',
    latin: 'Os sacrum',
    node: 'pelvis',
    side: 'center',
    region: 'Pelvis',
    boneClass: 'irregular',
    shape: { kind: 'sacrum', center: [0, 0.012, -0.048], width: 0.1, height: 0.115 },
    landmarks: ['Base and promontory', 'Auricular surfaces', 'Median sacral crest', 'Sacral hiatus', 'Apex'],
    articulations: ['sacroiliac', 'lumbar_spine'],
    notes:
      'Five fused vertebrae forming the keystone of the pelvic ring. Load from the spine is transferred laterally through the sacroiliac joints to the hip bones, and the joint is locked by form and friction rather than by muscle.',
    clinical:
      'Sacroiliac joint pain refers to the buttock and can mimic lumbar radiculopathy; provocation tests (FABER, thigh thrust) help distinguish them.',
  },
  {
    id: 'coccyx',
    name: 'Coccyx',
    latin: 'Os coccygis',
    node: 'pelvis',
    side: 'center',
    region: 'Pelvis',
    boneClass: 'irregular',
    shape: { kind: 'blob', center: [0, -0.055, -0.056], radii: [0.013, 0.026, 0.011] },
    landmarks: ['Three to five fused rudimentary vertebrae'],
    articulations: ['sacrococcygeal'],
    notes: 'Vestigial tail, but a real attachment for the pelvic floor, the anococcygeal ligament and gluteus maximus fibres.',
    clinical: 'Coccydynia after a fall onto the buttocks; sitting on a wedge cushion offloads it.',
  },
  {
    id: 'ribcage',
    name: 'Ribs',
    latin: 'Costae',
    node: 'thorax',
    side: 'center',
    region: 'Thorax',
    boneClass: 'long',
    shape: { kind: 'ribcage', center: [0, 0.105, 0.012], pairs: 12, height: 0.3, width: 0.215, depth: 0.15 },
    landmarks: [
      'True ribs 1–7 (costal cartilage to sternum)',
      'False ribs 8–10',
      'Floating ribs 11–12',
      'Costal groove (intercostal neurovascular bundle)',
      'Costal margin',
    ],
    articulations: ['costovertebral', 'sternocostal'],
    notes:
      'A spring-loaded cage, not a rigid box. Rib elevation is a "pump handle" motion at the upper ribs and a "bucket handle" motion lower down; both are driven by the intercostals, scalenes and diaphragm.',
    clinical:
      'Rib springing reproduces costovertebral joint pain. The intercostal bundle sits under the lower border of each rib — chest drains go above the rib below.',
  },
  {
    id: 'sternum',
    name: 'Sternum',
    latin: 'Sternum',
    node: 'chest',
    side: 'center',
    region: 'Thorax',
    boneClass: 'flat',
    shape: { kind: 'plate', center: [0, -0.055, 0.071], size: [0.034, 0.165, 0.012] },
    landmarks: ['Manubrium', 'Sternal angle (of Louis)', 'Body', 'Xiphoid process', 'Jugular notch'],
    articulations: ['l_sternoclavicular', 'r_sternoclavicular', 'sternocostal'],
    notes:
      'The anterior anchor of the ribcage and the origin of the sternal head of pectoralis major and of sternocleidomastoid. The sternal angle marks the 2nd costal cartilage and the T4/T5 disc level.',
    clinical: 'Sternal tenderness at the costal cartilages suggests costochondritis rather than cardiac pain.',
  },
];

function mirrorBone(b: BoneDef): BoneDef {
  const swap = (s: string) => s.replace(/^l_/, 'r_');
  return {
    ...b,
    id: swap(b.id),
    node: b.node.startsWith('l_') ? swap(b.node) : b.node,
    side: 'right',
    shape: mirrorShape(b.shape),
    articulations: b.articulations.map((a) => (a.startsWith('l_') ? swap(a) : a)),
  };
}

export const BONES: BoneDef[] = [
  ...CENTER_BONES,
  ...LEFT_BONES,
  ...LEFT_BONES.map(mirrorBone),
];
