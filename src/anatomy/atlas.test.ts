import { describe, expect, it } from 'vitest';

import { ATLAS_STATS, MUSCLES, MUSCLES_BY_JOINT, validateDataset } from './index';
import { REST_WORLD_POSITION, RIG_NODES } from './rig';

describe('anatomy dataset', () => {
  it('has no dangling cross-references', () => {
    const issues = validateDataset();
    expect(issues).toEqual([]);
  });

  it('is bilaterally complete', () => {
    for (const m of MUSCLES) {
      if (m.side === 'center') continue;
      const twin = m.side === 'left' ? m.id.replace(/^l_/, 'r_') : m.id.replace(/^r_/, 'l_');
      expect(MUSCLES.some((x) => x.id === twin), `${m.id} is missing its twin ${twin}`).toBe(true);
    }
  });

  it('covers the major joints with muscles on both sides', () => {
    for (const joint of ['l_hip', 'r_hip', 'l_knee', 'r_knee', 'l_glenohumeral', 'l_elbow', 'lumbar_spine']) {
      expect(MUSCLES_BY_JOINT[joint]?.length ?? 0, `no muscles act at ${joint}`).toBeGreaterThan(2);
    }
  });

  it('places the rig on the floor with a plausible stature', () => {
    const lowest = Math.min(
      ...Object.values(REST_WORLD_POSITION).map((v) => v[1]),
    );
    const highest = Math.max(...Object.values(REST_WORLD_POSITION).map((v) => v[1]));
    expect(lowest).toBeLessThan(0.1);
    expect(highest).toBeGreaterThan(1.4);
  });

  it('mirrors every lateral rig node', () => {
    const ids = new Set(RIG_NODES.map((n) => n.id));
    for (const n of RIG_NODES) {
      if (n.side === 'left') expect(ids.has(n.id.replace(/^l_/, 'r_'))).toBe(true);
    }
  });

  it('is a substantial atlas', () => {
    expect(ATLAS_STATS.muscles).toBeGreaterThan(150);
    expect(ATLAS_STATS.bones).toBeGreaterThan(40);
    expect(ATLAS_STATS.joints).toBeGreaterThan(40);
    expect(ATLAS_STATS.nerves).toBeGreaterThan(40);
    expect(ATLAS_STATS.exercises).toBeGreaterThan(400);
  });
});
