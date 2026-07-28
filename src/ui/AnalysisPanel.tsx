import type { StructureRef } from '../anatomy/types';
import type { MuscleRole, PoseAnalysis } from '../engine/analysis';
import { mergeChanges, mergeInvolvement, type MergedInvolvement } from './bilateral';

interface AnalysisPanelProps {
  analysis: PoseAnalysis | null;
  fromLabel: string;
  toLabel: string;
  onSelect: (refs: StructureRef[]) => void;
  onHover: (refs: StructureRef[]) => void;
}

const ROLE_ORDER: { role: MuscleRole; label: string; blurb: string; color: string; meter: string }[] = [
  {
    role: 'eccentric brake',
    label: 'Eccentric — controlling the movement',
    blurb:
      'Gravity is producing the motion, so these muscles lengthen under tension to control it. They are doing the work even though they are getting longer.',
    color: '#ff9a6b',
    meter: 'ecc',
  },
  {
    role: 'prime mover',
    label: 'Prime movers — concentric',
    blurb: 'Shortening under load to produce the movement.',
    color: 'var(--accent)',
    meter: '',
  },
  {
    role: 'synergist',
    label: 'Synergists',
    blurb: 'Assisting the prime movers, or contributing at a second joint.',
    color: '#ffd08a',
    meter: '',
  },
  {
    role: 'stabiliser',
    label: 'Stabilisers — isometric',
    blurb: 'Barely changing length; holding a joint still while others move it.',
    color: 'var(--joint)',
    meter: 'iso',
  },
  {
    role: 'antagonist — stretched',
    label: 'Lengthened without load',
    blurb: 'Stretched by the movement rather than resisting it — the muscles that limit range here.',
    color: '#8892a3',
    meter: 'iso',
  },
  {
    role: 'shortened, unloaded',
    label: 'Shortened, little load',
    blurb: 'Shortening, but gravity is already producing this motion so they need not work hard.',
    color: '#8892a3',
    meter: 'iso',
  },
];

function InvolvementRow({
  item,
  meter,
  onSelect,
  onHover,
}: {
  item: MergedInvolvement;
  meter: string;
  onSelect: (refs: StructureRef[]) => void;
  onHover: (refs: StructureRef[]) => void;
}) {
  const shortened = item.deltaPct < 0;
  return (
    <button
      className="involve"
      onClick={() => onSelect(item.refs)}
      onMouseEnter={() => onHover(item.refs)}
      onMouseLeave={() => onHover([])}
    >
      <span className="row1">
        <span className="mname">
          {item.name}
          {item.bothSides && <span className="faint"> · both sides</span>}
        </span>
        <span className={`delta ${shortened ? 'short' : 'long'}`}>
          {shortened ? '−' : '+'}
          {Math.abs(item.deltaPct * 100).toFixed(1)}%
        </span>
      </span>
      <span className="why">{item.explanation}</span>
      <span className={`meter ${meter}`}>
        <i style={{ width: `${item.score}%` }} />
      </span>
    </button>
  );
}

export function AnalysisPanel({ analysis, fromLabel, toLabel, onSelect, onHover }: AnalysisPanelProps) {
  if (!analysis || !analysis.jointChanges.length) {
    return (
      <div className="empty">
        <strong style={{ display: 'block', color: 'var(--text-dim)', marginBottom: 6 }}>
          No movement to analyse yet
        </strong>
        Drag the model into a new position, or apply a reference pose. The atlas will then compare
        it against {fromLabel.toLowerCase()} and work out which muscles produced the change.
      </div>
    );
  }

  const groups = ROLE_ORDER.map((g) => ({
    ...g,
    items: mergeInvolvement(analysis.involvement.filter((i) => i.role === g.role)).slice(0, 10),
  })).filter((g) => g.items.length);

  const changes = mergeChanges(analysis.jointChanges);

  return (
    <>
      <div className="detail-head">
        <div className="eyebrow">Movement analysis</div>
        <h2>
          {fromLabel} → {toLabel}
        </h2>
        <div className="summary" style={{ marginTop: 10 }}>
          {analysis.summary}
        </div>
      </div>

      <div className="section">
        <h2>Joints that moved ({changes.length})</h2>
        {changes.slice(0, 8).map((change) => (
          <div className="jointchange" key={change.key}>
            <div className="head">
              {change.label} — {change.motion} {Math.round(change.degrees)}°
            </div>
            <div className="angles">
              {Math.round(change.from)}° → {Math.round(change.to)}°
              {change.closedChain ? ' · weight-bearing' : ''}
              {' · gravity '}
              {change.gravity}
            </div>
            <div className="note">{change.note}</div>
          </div>
        ))}
        {changes.length > 8 && (
          <p className="faint" style={{ margin: 0 }}>
            + {changes.length - 8} smaller joint changes.
          </p>
        )}
      </div>

      {groups.map((group) => (
        <div className="section" key={group.role}>
          <div className="rolegroup">
            <div className="label">
              <span className="swatch" style={{ background: group.color }} />
              {group.label}
            </div>
            <p className="faint" style={{ margin: '0 0 8px' }}>
              {group.blurb}
            </p>
            {group.items.map((item) => (
              <InvolvementRow
                key={item.key}
                item={item}
                meter={group.meter}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="section">
        <h2>How this is worked out</h2>
        <p className="faint" style={{ margin: 0 }}>
          Every muscle attachment is pinned to the skeleton, so each muscle's length is a function
          of the pose — the percentages above are real geometric length changes between the two
          positions. Whether a shortening muscle is actually <em>working</em> then depends on
          gravity: for each joint the atlas balances the weight of the segments beyond it against
          the ground reaction under the foot, and works out which direction the muscles must pull.
          That is why the same squat is quadriceps-eccentric on the way down and
          quadriceps-concentric on the way up.
        </p>
      </div>
    </>
  );
}
