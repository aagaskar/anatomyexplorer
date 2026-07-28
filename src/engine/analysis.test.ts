import { describe, expect, it } from 'vitest';

import { analysePoseChange } from './analysis';
import { Rig } from './kinematics';
import { POSE_PRESET_BY_ID } from './poses';

const pose = (id: string) => POSE_PRESET_BY_ID[id].pose;
const support = (id: string) => POSE_PRESET_BY_ID[id].support;

const namesIn = (list: { muscle: { id: string } }[]) => list.map((i) => i.muscle.id);

describe('movement analysis', () => {
  it('reports no movement between identical poses', () => {
    const result = analysePoseChange(pose('squat_bottom'), pose('squat_bottom'), support('squat_bottom'));
    expect(result.jointChanges).toEqual([]);
    expect(result.summary).toMatch(/No joint moved/);
  });

  it('names the joint motions of a squat descent', () => {
    const result = analysePoseChange(pose('anatomical'), pose('squat_bottom'), support('squat_bottom'));
    const knee = result.jointChanges.find((c) => c.joint === 'l_knee');
    const hip = result.jointChanges.find((c) => c.joint === 'l_hip' && c.axis === 'x');
    expect(knee?.motion).toBe('flexion');
    expect(hip?.motion).toBe('flexion');
    expect(Math.round(knee!.degrees)).toBeGreaterThan(90);
  });

  it('treats lowering into a squat as eccentric work for the quadriceps and glutes', () => {
    const result = analysePoseChange(pose('anatomical'), pose('squat_bottom'), support('squat_bottom'));
    const eccentric = namesIn(result.eccentric);
    expect(eccentric).toContain('l_gluteus_maximus');
    expect(eccentric).toContain('l_vastus_lateralis');
    expect(result.summary).toMatch(/eccentric/);
  });

  it('treats standing up out of a squat as concentric work for the same muscles', () => {
    const result = analysePoseChange(pose('squat_bottom'), pose('anatomical'), support('squat_bottom'));
    const movers = [...namesIn(result.primeMovers), ...namesIn(result.synergists)];
    expect(movers).toContain('l_gluteus_maximus');
    expect(movers).toContain('l_vastus_lateralis');
    const glute = result.involvement.find((i) => i.muscle.id === 'l_gluteus_maximus');
    expect(glute?.contraction).toBe('concentric');
  });

  it('identifies the biceps as the prime mover of a curl', () => {
    const result = analysePoseChange(pose('anatomical'), pose('biceps_curl'), support('biceps_curl'));
    const top = result.involvement.slice(0, 12).map((i) => i.muscle.id);
    expect(top).toContain('l_biceps_long');
    const biceps = result.involvement.find((i) => i.muscle.id === 'l_biceps_long')!;
    expect(biceps.deltaPct).toBeLessThan(0);
    expect(['prime mover', 'synergist']).toContain(biceps.role);
    const triceps = result.involvement.find((i) => i.muscle.id === 'l_triceps_long')!;
    expect(triceps.deltaPct).toBeGreaterThan(0);
  });

  it('identifies deltoid and supraspinatus in shoulder abduction', () => {
    const result = analysePoseChange(pose('anatomical'), pose('t_pose'), support('t_pose'));
    const working = [...namesIn(result.primeMovers), ...namesIn(result.synergists)];
    expect(working).toContain('l_deltoid_middle');
    expect(working).toContain('l_supraspinatus');
  });

  it('finds the calf muscles shortening in a calf raise', () => {
    const result = analysePoseChange(pose('anatomical'), pose('calf_raise'), support('calf_raise'));
    const soleus = result.involvement.find((i) => i.muscle.id === 'l_soleus')!;
    expect(soleus.deltaPct).toBeLessThan(0);
    const tibAnt = result.involvement.find((i) => i.muscle.id === 'l_tibialis_anterior')!;
    expect(tibAnt.deltaPct).toBeGreaterThan(0);
  });

  it('names a return toward neutral as extension, not hyperextension', () => {
    // Going from a deep squat back to standing decreases the knee angle, but that is
    // extension — hyperextension only exists past anatomical zero.
    const up = analysePoseChange(pose('squat_bottom'), pose('anatomical'), support('squat_bottom'));
    expect(up.jointChanges.find((c) => c.joint === 'l_knee')?.motion).toBe('extension');
    const down = analysePoseChange(pose('anatomical'), pose('squat_bottom'), support('squat_bottom'));
    expect(down.jointChanges.find((c) => c.joint === 'l_knee')?.motion).toBe('flexion');
    // Lowering an abducted arm is adduction.
    const lower = analysePoseChange(pose('t_pose'), pose('anatomical'));
    expect(lower.jointChanges.find((c) => c.joint === 'l_glenohumeral')?.motion).toBe('adduction');
  });

  it('lengthens the hamstrings in a hip hinge', () => {
    const result = analysePoseChange(pose('anatomical'), pose('hip_hinge'), support('hip_hinge'));
    const ham = result.involvement.find((i) => i.muscle.id === 'l_biceps_femoris_long')!;
    expect(ham.deltaPct).toBeGreaterThan(0.03);
    expect(ham.contraction).toBe('eccentric');
  });
});

describe('kinematics', () => {
  it('keeps the feet on the floor after posing', () => {
    const rig = new Rig();
    rig.applyPose(pose('squat_bottom'));
    const heel = rig.worldPoint('l_ankle', [0, -0.067, -0.06]);
    expect(Math.abs(heel.y)).toBeLessThan(0.01);
  });

  it('clamps angles to the declared range of motion', () => {
    const rig = new Rig();
    rig.applyPose({ l_knee: [999, 0, 0] });
    const knee = rig.nodes.l_knee.rotation.x * (180 / Math.PI);
    expect(knee).toBeCloseTo(150, 1);
  });

  it('applies scapulohumeral rhythm when the arm elevates', () => {
    const rig = new Rig();
    rig.applyPose({ l_shoulder: [0, 0, 150] });
    const scapula = rig.nodes.l_scapula.rotation.z * (180 / Math.PI);
    expect(scapula).toBeGreaterThan(40);
  });
});
