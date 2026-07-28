# Anatomy Explorer

An interactive 3D atlas of human musculoskeletal anatomy. Click structures to identify them,
search to highlight them, read the exercises that isolate any muscle, and drag the model into
a pose to find out which muscles produced the movement.

Everything runs in the browser with no external assets — the entire body is generated
procedurally from the datasets in `src/anatomy/`.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # dataset + biomechanics tests
npm run build      # typecheck + production bundle
```

## The three modes

**Identify** — click any muscle, bone, joint or nerve. The panel gives its origin and
insertion, its actions joint by joint, its nerve and blood supply, its synergists and
antagonists, how to palpate it, and the clinically relevant notes. Cross-references are
clickable, so you can walk from a muscle to its nerve to everything else that nerve supplies.
Layers can be toggled and muscles peeled back by depth (superficial → intermediate → deep) to
reach the rotator cuff, the deep hip rotators and the transversospinalis group.

**Search** — matches are highlighted in green in the 3D view. The index covers more than
names:

| Query | What you get |
| --- | --- |
| `gluteus medius`, `scaphoid`, `Musculus soleus` | the structure |
| `hip abduction`, `elbow flexion` | every muscle that produces that motion at that joint |
| `Romanian deadlift`, `Copenhagen adduction` | every muscle the exercise works |
| `rotator cuff`, `hamstrings`, `quads`, `lats` | the functional group (lay terms included) |

**Pose & analyse** — drag any bone, muscle or joint marker to move the limb it belongs to.
Every joint is held inside its real range of motion, so an elbow can only fold in its own
plane and a hip stops at 125° of flexion. Release the drag and the atlas compares the new
position against the previous one and reports which muscles produced the change. There are
also 18 reference poses (deep squat, hip hinge, split lunge, dead hang, pull-up top, throwing
late-cocking, sprint drive, Trendelenburg test, forward head posture …) and
per-degree-of-freedom sliders for precise work.

## How the movement analysis works

This is the part worth explaining, because "which muscles are used to get into this position"
has a subtler answer than "which muscles shortened".

1. **Kinematics.** The two poses are compared joint by joint to produce named motions. Naming
   respects anatomical zero: returning from 100° of knee flexion to standing is *extension*,
   not hyperextension, even though the angle decreased.

2. **Muscle length.** Every muscle is defined as a path of attachment points, each pinned to a
   bone in the rig. Muscle length is therefore a pure function of the pose, and the
   percentages in the analysis panel are real geometric length changes between the two
   positions — not a lookup table.

3. **Gravity, via quasi-static inverse dynamics.** Shortening does not mean working. Lowering
   into a squat is produced by the quadriceps and glutes *lengthening* under control, not by
   the hip flexors shortening. So for each joint that moved, the atlas takes everything distal
   to it as a free body, sums the weights of those segments plus the ground reaction wherever
   the body is in contact with the floor, and works out the muscle moment needed to balance
   it. If that moment points the way the joint moved, the muscles producing the motion
   shortened under load (concentric). If it points the other way, the muscles opposing the
   motion paid out under tension (eccentric).

Handling the ground reaction is what makes weight-bearing positions come out right: in a squat
the upward force under the foot passes in front of the hip, which is why the hip extensors must
work even though the hip is flexing. Because support matters this much, it is an explicit
control — feet on the floor, hanging from the hands, or seated — and switching it changes the
answer, as it should.

Muscles are then grouped as eccentric brakes, prime movers, synergists, isometric stabilisers,
and those merely lengthened or shortened without load, ranked by an involvement score that
weighs excursion, physiological size and the size of the joint excursion.

The result: the same squat reports quadriceps-eccentric on the way down and
quadriceps-concentric on the way up, which is the answer a coach or clinician would give.

## Contents

- 206 muscle instances (103 unique, mirrored) with attachments, actions, innervation, blood
  supply, palpation, clinical notes and synergist/antagonist relationships
- 43 bones with surface landmarks, articulations and clinical notes
- 49 joints with classification, ligaments, range of motion and the muscles acting at each
- 58 nerves and plexuses with roots, course, motor and sensory territory, and the muscles they
  supply
- 542 exercises, stretches, activation drills and clinical tests, each with the cue that
  biases the target muscle, and indexed so you can search by exercise name

## Architecture

```
src/
  anatomy/          the dataset — the source of truth
    rig.ts          articulated skeleton: joint tree, axis conventions, ranges of motion
    bones.ts        43 bones as declarative geometry recipes + reference text
    joints.ts       49 articulations
    musclesUpper.ts | musclesTrunk.ts | musclesLower.ts
    nerves.ts
    search.ts       search index over structures, motions, exercises and groups
    index.ts        assembled atlas, lookup indices and a cross-reference validator
  engine/           biomechanics, framework-free and testable headlessly
    kinematics.ts   forward kinematics, range-of-motion clamping, auto-grounding,
                    scapulohumeral rhythm
    analysis.ts     joint diffing, muscle length change, inverse dynamics, role assignment
    poses.ts        18 reference poses
  three/            rendering
    boneGeometry.ts procedural bone geometry from the shape recipes
    muscleTube.ts   deformable muscle tubes rebuilt in place as the pose changes
    silhouette.ts   translucent body outline
    viewer.ts       scene, picking, highlighting, layers, camera, drag-to-pose
  ui/               React panels
```

Two conventions are load-bearing, and are documented in the files that own them:

- **Rig axes** (`rig.ts`): +X is the subject's left, +Y up, +Z anterior. The rest pose is
  anatomical position, so a joint angle of 0 is anatomical neutral and reported angles read
  like a goniometer. Muscle attachments are authored as world-space landmarks on the standing
  body and converted to node-local space by `localFromWorld`.
- **Pose authoring** (`poses.ts`): whole-body lean lives on the `root` node, not on the joints,
  and a planted foot must satisfy `root.x + hip.x + knee.x + ankle.x = 0`. Both matter for the
  analysis: writing a hip hinge as hip flexion alone tips the legs over, and a tilted sole puts
  the ground reaction in the wrong place.

## Tests

`npm test` covers both layers:

- **Dataset integrity** — every joint, nerve, bone and muscle cross-reference resolves; every
  lateral structure has its mirror twin; the rig stands on the floor at a plausible stature.
  A typo in an id fails the build rather than silently emptying a panel.
- **Biomechanics** — a squat descent is eccentric for the quadriceps and glutes while standing
  up is concentric for the same muscles; the biceps is the prime mover of a curl and the
  triceps lengthens; the deltoid and supraspinatus drive shoulder abduction; the hamstrings
  lengthen eccentrically in a hip hinge; ranges of motion clamp; scapulohumeral rhythm engages.

## Known limits

- Muscles are modelled as swept tubes along their line of pull, not as volumetric sheets, so
  broad muscles like pectoralis major and latissimus dorsi read as thick straps rather than
  fans. Length change — which is what the analysis depends on — is unaffected.
- The analysis is quasi-static. It answers "which muscles must be working to hold and control
  this movement", not "how much force", and it ignores momentum, so ballistic movements are
  described by their positions rather than their accelerations.
- Bone geometry is stylised. Landmarks are described in the reference text and positioned
  plausibly, but this is an atlas for understanding relationships and function, not a source of
  morphometric measurements.
