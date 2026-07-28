/**
 * Assembles the complete atlas and builds the lookup indices the rest of the app uses.
 */

import { BONES } from './bones';
import { JOINTS } from './joints';
import { bilateral } from './muscleHelpers';
import { LOWER_MUSCLES } from './musclesLower';
import { TRUNK_MUSCLES } from './musclesTrunk';
import { UPPER_MUSCLES } from './musclesUpper';
import { NERVES } from './nerves';
import { RIG_NODE_BY_ID } from './rig';
import type { BoneDef, JointDef, MuscleDef, NerveDef, StructureKind, StructureRef } from './types';

export const MUSCLES: MuscleDef[] = bilateral([
  ...UPPER_MUSCLES,
  ...TRUNK_MUSCLES,
  ...LOWER_MUSCLES,
]);

export { BONES, JOINTS, NERVES };

export const MUSCLE_BY_ID: Record<string, MuscleDef> = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));
export const BONE_BY_ID: Record<string, BoneDef> = Object.fromEntries(BONES.map((b) => [b.id, b]));
export const JOINT_BY_ID: Record<string, JointDef> = Object.fromEntries(JOINTS.map((j) => [j.id, j]));
export const NERVE_BY_ID: Record<string, NerveDef> = Object.fromEntries(NERVES.map((n) => [n.id, n]));

export type AnyStructure = MuscleDef | BoneDef | JointDef | NerveDef;

export function getStructure(kind: StructureKind, id: string): AnyStructure | undefined {
  switch (kind) {
    case 'muscle':
      return MUSCLE_BY_ID[id];
    case 'bone':
      return BONE_BY_ID[id];
    case 'joint':
      return JOINT_BY_ID[id];
    case 'nerve':
      return NERVE_BY_ID[id];
  }
}

export function structureName(ref: StructureRef): string {
  const s = getStructure(ref.kind, ref.id);
  if (!s) return ref.id;
  const side = s.side === 'center' ? '' : `${s.side === 'left' ? 'Left' : 'Right'} `;
  return `${side}${s.name}`;
}

/** Muscles acting at a given joint, grouped by the motion they produce. */
export const MUSCLES_BY_JOINT: Record<string, MuscleDef[]> = (() => {
  const out: Record<string, MuscleDef[]> = {};
  for (const m of MUSCLES) {
    for (const a of m.actions) {
      (out[a.joint] ??= []).push(m);
    }
  }
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key])];
  return out;
})();

/** Muscles supplied by a given nerve (built from both directions of the relationship). */
export const MUSCLES_BY_NERVE: Record<string, MuscleDef[]> = (() => {
  const out: Record<string, MuscleDef[]> = {};
  for (const m of MUSCLES) {
    if (m.nerve) (out[m.nerve] ??= []).push(m);
  }
  for (const n of NERVES) {
    for (const id of n.muscles) {
      const m = MUSCLE_BY_ID[id];
      if (m && !(out[n.id] ??= []).includes(m)) out[n.id].push(m);
    }
  }
  return out;
})();

/** Muscles attaching to a given bone, inferred from the rig node their attachments use. */
export const MUSCLES_BY_BONE: Record<string, MuscleDef[]> = (() => {
  const nodeToBones: Record<string, string[]> = {};
  for (const b of BONES) (nodeToBones[b.node] ??= []).push(b.id);
  const out: Record<string, MuscleDef[]> = {};
  for (const m of MUSCLES) {
    const bones = new Set<string>();
    for (const pt of m.path) {
      if (pt.via) continue;
      for (const b of nodeToBones[pt.node] ?? []) bones.add(b);
    }
    for (const b of bones) (out[b] ??= []).push(m);
  }
  return out;
})();

export interface DatasetIssue {
  where: string;
  problem: string;
}

/**
 * Cross-reference check for the datasets. Run in dev (and in the test suite) so a typo in
 * a joint or nerve id surfaces immediately rather than as a silently empty panel.
 */
export function validateDataset(): DatasetIssue[] {
  const issues: DatasetIssue[] = [];
  const nodeExists = (n: string) => Boolean(RIG_NODE_BY_ID[n]);

  for (const m of MUSCLES) {
    if (m.path.length < 2) issues.push({ where: m.id, problem: 'muscle path needs at least two points' });
    for (const pt of m.path) {
      if (!nodeExists(pt.node)) issues.push({ where: m.id, problem: `unknown rig node "${pt.node}"` });
    }
    for (const a of m.actions) {
      if (!JOINT_BY_ID[a.joint]) issues.push({ where: m.id, problem: `unknown joint "${a.joint}"` });
    }
    if (m.nerve && !NERVE_BY_ID[m.nerve]) issues.push({ where: m.id, problem: `unknown nerve "${m.nerve}"` });
    for (const rel of [...(m.antagonists ?? []), ...(m.synergists ?? [])]) {
      if (!MUSCLE_BY_ID[rel]) issues.push({ where: m.id, problem: `unknown related muscle "${rel}"` });
    }
    if (!m.exercises.length) issues.push({ where: m.id, problem: 'no exercises listed' });
  }

  for (const b of BONES) {
    if (!nodeExists(b.node)) issues.push({ where: b.id, problem: `unknown rig node "${b.node}"` });
    for (const a of b.articulations) {
      if (!JOINT_BY_ID[a]) issues.push({ where: b.id, problem: `unknown joint "${a}"` });
    }
  }

  for (const j of JOINTS) {
    if (!nodeExists(j.node)) issues.push({ where: j.id, problem: `unknown rig node "${j.node}"` });
    for (const b of j.bones) {
      if (!BONE_BY_ID[b]) issues.push({ where: j.id, problem: `unknown bone "${b}"` });
    }
  }

  for (const n of NERVES) {
    for (const pt of n.path) {
      if (!nodeExists(pt.node)) issues.push({ where: n.id, problem: `unknown rig node "${pt.node}"` });
    }
    for (const m of n.muscles) {
      if (!MUSCLE_BY_ID[m]) issues.push({ where: n.id, problem: `unknown muscle "${m}"` });
    }
  }

  // Every degree of freedom should point at a joint that exists.
  for (const node of Object.values(RIG_NODE_BY_ID)) {
    for (const d of node.dofs) {
      const joint = d.joint ?? node.joint;
      if (joint && !JOINT_BY_ID[joint]) {
        issues.push({ where: node.id, problem: `DOF references unknown joint "${joint}"` });
      }
    }
  }

  return issues;
}

export const ATLAS_STATS = {
  muscles: MUSCLES.length,
  bones: BONES.length,
  joints: JOINTS.length,
  nerves: NERVES.length,
  exercises: MUSCLES.reduce((n, m) => n + m.exercises.length, 0),
};
