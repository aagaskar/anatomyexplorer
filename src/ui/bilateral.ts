/**
 * Almost every movement is symmetrical, which would otherwise fill the analysis panel with
 * identical left and right rows. These helpers fold matched pairs into one entry so the
 * reader sees "Hip joints — flexion 100°, both sides" instead of the same line twice.
 */

import type { JointChange, MuscleInvolvement } from '../engine/analysis';
import type { StructureRef } from '../anatomy/types';

const stripSide = (id: string) => id.replace(/^[lr]_/, '');

export interface MergedChange {
  key: string;
  label: string;
  motion: string;
  degrees: number;
  from: number;
  to: number;
  gravity: string;
  closedChain: boolean;
  note: string;
  bothSides: boolean;
}

/** Degrees of asymmetry tolerated before two sides are reported separately. */
const SYMMETRY_TOLERANCE = 2.5;

export function mergeChanges(changes: JointChange[]): MergedChange[] {
  const used = new Set<number>();
  const out: MergedChange[] = [];

  changes.forEach((change, index) => {
    if (used.has(index)) return;
    const base = stripSide(change.joint);
    let partner = -1;
    if (change.joint !== base) {
      partner = changes.findIndex(
        (other, j) =>
          j !== index &&
          !used.has(j) &&
          other.joint !== change.joint &&
          stripSide(other.joint) === base &&
          other.axis === change.axis &&
          other.motion === change.motion &&
          Math.abs(other.degrees - change.degrees) < SYMMETRY_TOLERANCE,
      );
    }
    used.add(index);
    if (partner >= 0) used.add(partner);

    const cleanName = change.jointName.replace(/\s*\(.*\)/, '');
    const merged = cleanName
      .replace(/^(Left|Right)\s+/, '')
      .replace(/^./, (c) => c.toUpperCase());

    out.push({
      key: `${change.node}-${change.axis}`,
      label: partner >= 0 ? `${merged} (both sides)` : cleanName,
      motion: change.motion,
      degrees: change.degrees,
      from: change.from,
      to: change.to,
      gravity: change.gravity,
      closedChain: change.closedChain,
      note: change.note,
      bothSides: partner >= 0,
    });
  });

  return out;
}

export interface MergedInvolvement {
  key: string;
  name: string;
  bothSides: boolean;
  deltaPct: number;
  score: number;
  explanation: string;
  refs: StructureRef[];
}

export function mergeInvolvement(items: MuscleInvolvement[]): MergedInvolvement[] {
  const used = new Set<number>();
  const out: MergedInvolvement[] = [];

  items.forEach((item, index) => {
    if (used.has(index)) return;
    const base = stripSide(item.muscle.id);
    let partner = -1;
    if (item.muscle.side !== 'center') {
      partner = items.findIndex(
        (other, j) =>
          j !== index &&
          !used.has(j) &&
          other.muscle.id !== item.muscle.id &&
          stripSide(other.muscle.id) === base &&
          other.role === item.role &&
          Math.abs(other.deltaPct - item.deltaPct) < 0.02,
      );
    }
    used.add(index);
    if (partner >= 0) used.add(partner);

    const refs: StructureRef[] = [{ kind: 'muscle', id: item.muscle.id }];
    if (partner >= 0) refs.push({ kind: 'muscle', id: items[partner].muscle.id });

    const sidePrefix =
      partner >= 0 || item.muscle.side === 'center' ? '' : item.muscle.side === 'left' ? 'L · ' : 'R · ';

    out.push({
      key: item.muscle.id,
      name: `${sidePrefix}${item.muscle.name}`,
      bothSides: partner >= 0,
      deltaPct: item.deltaPct,
      score: item.score,
      explanation: item.explanation.replace(/\bthe (left|right) /g, 'the '),
      refs,
    });
  });

  return out;
}
