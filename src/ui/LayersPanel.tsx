import { ATLAS_STATS } from '../anatomy';
import type { LayerState } from '../three/viewer';

interface LayersPanelProps {
  layers: LayerState;
  onChange: (patch: Partial<LayerState>) => void;
}

function Switch({
  on,
  onToggle,
  label,
  color,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  color?: string;
}) {
  return (
    <div className="toggle-row">
      <label onClick={onToggle}>
        {color && <span className="swatch" style={{ background: color }} />}
        {label}
      </label>
      <button className="switch" aria-pressed={on} aria-label={label} onClick={onToggle} />
    </div>
  );
}

const LAYER_NAMES = ['Superficial', 'Intermediate', 'Deep'];

export function LayersPanel({ layers, onChange }: LayersPanelProps) {
  const setMuscleLayer = (index: number) => {
    const next = [...layers.muscleLayers] as [boolean, boolean, boolean];
    next[index] = !next[index];
    onChange({ muscleLayers: next });
  };

  return (
    <>
      <div className="section">
        <h2>Layers</h2>
        <Switch
          label="Muscles"
          color="var(--muscle)"
          on={layers.muscles}
          onToggle={() => onChange({ muscles: !layers.muscles })}
        />
        <Switch
          label="Bones"
          color="var(--bone)"
          on={layers.bones}
          onToggle={() => onChange({ bones: !layers.bones })}
        />
        <Switch
          label="Joints"
          color="var(--joint)"
          on={layers.joints}
          onToggle={() => onChange({ joints: !layers.joints })}
        />
        <Switch
          label="Nerves"
          color="var(--nerve)"
          on={layers.nerves}
          onToggle={() => onChange({ nerves: !layers.nerves })}
        />
        <Switch
          label="Body outline"
          color="#c9a48c"
          on={layers.skin}
          onToggle={() => onChange({ skin: !layers.skin })}
        />
      </div>

      <div className="section">
        <h2>Muscle depth</h2>
        <div className="chiprow">
          {LAYER_NAMES.map((name, i) => (
            <button
              key={name}
              className="chip"
              aria-pressed={layers.muscleLayers[i]}
              onClick={() => setMuscleLayer(i)}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
          Peel back the superficial layer to reach the rotator cuff, the deep hip rotators and
          the transversospinalis group underneath.
        </p>

        <h3>Muscle opacity</h3>
        <input
          className="slider"
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={layers.muscleOpacity}
          onChange={(e) => onChange({ muscleOpacity: Number(e.target.value) })}
        />

        <div style={{ marginTop: 6 }}>
          <Switch
            label="Dim everything unhighlighted"
            on={layers.isolate}
            onToggle={() => onChange({ isolate: !layers.isolate })}
          />
        </div>
      </div>

      <div className="section">
        <h2>Atlas contents</h2>
        <div className="statgrid">
          <div className="stat">
            <div className="n">{ATLAS_STATS.muscles}</div>
            <div className="l">Muscles</div>
          </div>
          <div className="stat">
            <div className="n">{ATLAS_STATS.bones}</div>
            <div className="l">Bones</div>
          </div>
          <div className="stat">
            <div className="n">{ATLAS_STATS.joints}</div>
            <div className="l">Joints</div>
          </div>
          <div className="stat">
            <div className="n">{ATLAS_STATS.nerves}</div>
            <div className="l">Nerves</div>
          </div>
        </div>
        <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
          {ATLAS_STATS.exercises} exercises, stretches and clinical tests, indexed by the muscle
          each one targets.
        </p>
      </div>
    </>
  );
}
