import { JOINT_BY_ID } from '../anatomy';
import { RIG_NODES, RIG_NODE_BY_ID } from '../anatomy/rig';
import type { Pose, Vec3 } from '../anatomy/types';
import type { Support } from '../engine/analysis';
import { POSE_PRESETS } from '../engine/poses';

interface PosePanelProps {
  pose: Pose;
  activeNode: string | null;
  activePresetId: string | null;
  support: Support;
  grounded: boolean;
  coupling: boolean;
  canUndo: boolean;
  referenceLabel: string;
  onApplyPreset: (id: string) => void;
  onSetAngle: (node: string, axis: 'x' | 'y' | 'z', value: number) => void;
  onActiveNodeChange: (node: string | null) => void;
  onSupportChange: (support: Support) => void;
  onGroundedChange: (grounded: boolean) => void;
  onCouplingChange: (coupling: boolean) => void;
  onUndo: () => void;
  onReset: () => void;
  onMarkReference: () => void;
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

const POSABLE_NODES = RIG_NODES.filter((n) => n.dofs.length && !n.poseLocked);

const SUPPORT_LABEL: Record<Support, string> = {
  floor: 'Feet on the floor',
  hands: 'Hanging from the hands',
  pelvis: 'Seated / supported',
};

export function PosePanel(props: PosePanelProps) {
  const node = props.activeNode ? RIG_NODE_BY_ID[props.activeNode] : null;
  const angles: Vec3 = (props.activeNode && props.pose[props.activeNode]) || [0, 0, 0];

  return (
    <>
      <div className="section">
        <h2>Pose the model</h2>
        <p className="faint" style={{ margin: 0 }}>
          Drag any bone, muscle or joint marker to move the limb it belongs to — the pointer aims
          the segment, and each joint is held inside its real range of motion. Release to analyse
          which muscles produced the change.
        </p>
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn" onClick={props.onUndo} disabled={!props.canUndo}>
            Undo
          </button>
          <button className="btn" onClick={props.onReset}>
            Reset to neutral
          </button>
          <button className="btn" onClick={props.onMarkReference}>
            Pin as reference
          </button>
        </div>
        <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
          Comparing against: <strong style={{ color: 'var(--text-dim)' }}>{props.referenceLabel}</strong>
        </p>
      </div>

      <div className="section">
        <h2>How the body is supported</h2>
        <div className="chiprow">
          {(['floor', 'hands', 'pelvis'] as Support[]).map((s) => (
            <button
              key={s}
              className="chip"
              aria-pressed={props.support === s}
              onClick={() => props.onSupportChange(s)}
            >
              {SUPPORT_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
          This genuinely changes the answer. With the feet planted, the ground pushes up in front
          of the hip, so lowering into a squat is eccentric work for the extensors. Hanging from a
          bar reverses which muscles are loaded.
        </p>
      </div>

      <div className="section">
        <h2>Reference poses</h2>
        {POSE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="preset"
            aria-pressed={props.activePresetId === preset.id}
            onClick={() => props.onApplyPreset(preset.id)}
          >
            <span className="cat">{preset.category}</span>
            <div className="name">{preset.name}</div>
            {props.activePresetId === preset.id && (
              <div className="faint" style={{ marginTop: 4 }}>
                {preset.description}
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="section">
        <h2>Joint controls</h2>
        <select
          value={props.activeNode ?? ''}
          onChange={(e) => props.onActiveNodeChange(e.target.value || null)}
          style={{
            width: '100%',
            background: 'var(--panel-3)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            marginBottom: 12,
          }}
        >
          <option value="">Select a segment…</option>
          {POSABLE_NODES.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>

        {!node && <p className="faint" style={{ margin: 0 }}>Pick a segment, or drag one in the model.</p>}

        {node &&
          node.dofs.map((dof) => {
            const value = angles[AXIS_INDEX[dof.axis]] ?? 0;
            const joint = JOINT_BY_ID[dof.joint ?? node.joint ?? ''];
            const direction = value > 0 ? dof.positive : value < 0 ? dof.negative : 'neutral';
            return (
              <div className="dof" key={`${node.id}-${dof.axis}`}>
                <div className="dof-head">
                  <span>
                    {dof.negative} / {dof.positive}
                    {joint ? <span className="faint"> · {joint.name.replace(/\s*\(.*\)/, '')}</span> : null}
                  </span>
                  <span className="value">
                    {Math.round(Math.abs(value))}° {direction === 'neutral' ? '' : direction}
                  </span>
                </div>
                <input
                  className="slider"
                  type="range"
                  min={dof.min}
                  max={dof.max}
                  step={1}
                  value={value}
                  onChange={(e) => props.onSetAngle(node.id, dof.axis, Number(e.target.value))}
                />
                <div className="ends">
                  <span>
                    {Math.abs(dof.min)}° {dof.negative}
                  </span>
                  <span>
                    {Math.abs(dof.max)}° {dof.positive}
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      <div className="section">
        <h2>Simulation</h2>
        <div className="toggle-row">
          <label onClick={() => props.onGroundedChange(!props.grounded)}>Keep feet on the floor</label>
          <button
            className="switch"
            aria-pressed={props.grounded}
            aria-label="Keep feet on the floor"
            onClick={() => props.onGroundedChange(!props.grounded)}
          />
        </div>
        <div className="toggle-row">
          <label onClick={() => props.onCouplingChange(!props.coupling)}>Scapulohumeral rhythm</label>
          <button
            className="switch"
            aria-pressed={props.coupling}
            aria-label="Scapulohumeral rhythm"
            onClick={() => props.onCouplingChange(!props.coupling)}
          />
        </div>
        <p className="faint" style={{ marginTop: 6, marginBottom: 0 }}>
          With rhythm on, elevating the arm past 30° rotates the scapula upward at about half the
          rate, as a real shoulder does.
        </p>
      </div>
    </>
  );
}
