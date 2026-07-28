/**
 * Authoring helpers for the muscle dataset.
 *
 * Muscle attachments are stored in rig-node local space (so they follow the pose), but
 * they are far easier to *write* as "where is this landmark on the standing body". `p()`
 * does that conversion, so the datasets read like an anatomy text.
 */

import { localFromWorld } from './rig';
import type { MotionName, MuscleDef, MusclePoint, Vec3 } from './types';

/** Attachment: a world-space landmark, pinned to the given rig node. */
export const p = (node: string, world: Vec3): MusclePoint => ({
  node,
  pos: localFromWorld(node, world),
});

/** Routing waypoint — shapes the line of pull but is not an attachment. */
export const via = (node: string, world: Vec3): MusclePoint => ({
  node,
  pos: localFromWorld(node, world),
  via: true,
});

const MIRRORED_MOTION: Partial<Record<MotionName, MotionName>> = {
  'right rotation': 'left rotation',
  'left rotation': 'right rotation',
  'right lateral flexion': 'left lateral flexion',
  'left lateral flexion': 'right lateral flexion',
};

const swapSide = (id: string): string => (id.startsWith('l_') ? `r_${id.slice(2)}` : id);

/** Reflect a left-side muscle definition into its right-side twin. */
export function mirrorMuscle(m: MuscleDef): MuscleDef {
  return {
    ...m,
    id: swapSide(m.id),
    side: 'right',
    path: m.path.map((pt) => ({
      node: swapSide(pt.node),
      pos: [-pt.pos[0], pt.pos[1], pt.pos[2]] as Vec3,
      via: pt.via,
    })),
    actions: m.actions.map((a) => ({
      ...a,
      joint: swapSide(a.joint),
      motion: MIRRORED_MOTION[a.motion] ?? a.motion,
    })),
    nerve: m.nerve ? swapSide(m.nerve) : undefined,
    antagonists: m.antagonists?.map(swapSide),
    synergists: m.synergists?.map(swapSide),
  };
}

/** Expand a list of left/centre definitions into the full bilateral set. */
export function bilateral(defs: MuscleDef[]): MuscleDef[] {
  const out: MuscleDef[] = [];
  for (const d of defs) {
    out.push(d);
    if (d.side === 'left') out.push(mirrorMuscle(d));
  }
  return out;
}
