import {
  BONE_BY_ID,
  JOINT_BY_ID,
  MUSCLES_BY_BONE,
  MUSCLES_BY_JOINT,
  MUSCLES_BY_NERVE,
  MUSCLE_BY_ID,
  NERVE_BY_ID,
  getStructure,
} from '../anatomy';
import { musclesForMotion } from '../engine/analysis';
import type {
  BoneDef,
  Exercise,
  JointDef,
  MotionName,
  MuscleDef,
  NerveDef,
  StructureRef,
} from '../anatomy/types';

interface DetailsPanelProps {
  refs: StructureRef[];
  onSelect: (ref: StructureRef) => void;
  onFocus: (ref: StructureRef) => void;
  onClear: () => void;
}

const sided = (side: string, name: string) =>
  side === 'center' ? name : `${side === 'left' ? 'Left' : 'Right'} ${name}`;

const KIND_LABEL: Record<string, string> = {
  muscle: 'Muscle',
  bone: 'Bone',
  joint: 'Joint',
  nerve: 'Nerve',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <dl className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </dl>
  );
}

function StructureLinks({
  ids,
  kind,
  onSelect,
  empty,
}: {
  ids: string[];
  kind: StructureRef['kind'];
  onSelect: (ref: StructureRef) => void;
  empty?: string;
}) {
  if (!ids.length) return <span className="faint">{empty ?? 'None recorded.'}</span>;
  return (
    <ul className="pill-list">
      {ids.map((id) => {
        const s = getStructure(kind, id);
        return (
          <li key={id}>
            <button className="link-btn" onClick={() => onSelect({ kind, id })}>
              {s ? sided(s.side, s.name) : id}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <div className="exercise">
      <div className="top">
        <span className="name">{exercise.name}</span>
        <span className={`kind ${exercise.kind.replace(' ', '-')}`}>{exercise.kind}</span>
      </div>
      <div className="meta">
        {exercise.equipment} · {exercise.motion}
      </div>
      <div className="cue">{exercise.cue}</div>
    </div>
  );
}

function MuscleDetails({
  muscle,
  onSelect,
}: {
  muscle: MuscleDef;
  onSelect: (ref: StructureRef) => void;
}) {
  const attachments = muscle.path.filter((p) => !p.via);
  const isolation = muscle.exercises.filter((e) => e.kind === 'isolation' || e.kind === 'activation');
  const other = muscle.exercises.filter((e) => e.kind !== 'isolation' && e.kind !== 'activation');

  return (
    <>
      <div className="section">
        <h2>Attachments</h2>
        <Fact label="Origin">{muscle.originDesc}</Fact>
        <Fact label="Insertion">{muscle.insertionDesc}</Fact>
        <p className="faint">
          Modelled with {attachments.length} attachment points and{' '}
          {muscle.path.length - attachments.length} routing waypoints, so its length tracks the pose.
        </p>
      </div>

      <div className="section">
        <h2>Actions</h2>
        {muscle.actions.map((action, i) => {
          const joint = JOINT_BY_ID[action.joint];
          return (
            <div className="toggle-row" key={`${action.joint}-${action.motion}-${i}`}>
              <span style={{ fontSize: 13 }}>
                <strong style={{ fontWeight: 550 }}>{action.motion}</strong>{' '}
                <span className="faint">at the</span>{' '}
                <button className="link-btn" onClick={() => onSelect({ kind: 'joint', id: action.joint })}>
                  {joint ? sided(joint.side, joint.name).replace(/\s*\(.*\)/, '') : action.joint}
                </button>
              </span>
              <span className="kindtag">{action.role === 'prime' ? 'prime' : action.role}</span>
            </div>
          );
        })}
      </div>

      <div className="section">
        <h2>Isolating exercises &amp; motions</h2>
        {isolation.map((e) => (
          <ExerciseCard key={e.name} exercise={e} />
        ))}
        {other.length > 0 && (
          <>
            <h3>Compound work, stretches and tests</h3>
            {other.map((e) => (
              <ExerciseCard key={e.name} exercise={e} />
            ))}
          </>
        )}
      </div>

      <div className="section">
        <h2>Nerve &amp; blood supply</h2>
        <Fact label="Innervation">
          {muscle.nerve && NERVE_BY_ID[muscle.nerve] ? (
            <button className="link-btn" onClick={() => onSelect({ kind: 'nerve', id: muscle.nerve! })}>
              {muscle.innervation}
            </button>
          ) : (
            muscle.innervation
          )}
        </Fact>
        {muscle.bloodSupply && <Fact label="Blood supply">{muscle.bloodSupply}</Fact>}
        {muscle.fiberType && <Fact label="Architecture">{muscle.fiberType}</Fact>}
      </div>

      {(muscle.synergists?.length || muscle.antagonists?.length) && (
        <div className="section">
          <h2>Functional partners</h2>
          {muscle.synergists?.length ? (
            <Fact label="Synergists">
              <StructureLinks ids={muscle.synergists} kind="muscle" onSelect={onSelect} />
            </Fact>
          ) : null}
          {muscle.antagonists?.length ? (
            <Fact label="Antagonists">
              <StructureLinks ids={muscle.antagonists} kind="muscle" onSelect={onSelect} />
            </Fact>
          ) : null}
        </div>
      )}

      {(muscle.palpation || muscle.clinical) && (
        <div className="section">
          <h2>Notes</h2>
          {muscle.palpation && <div className="callout">How to find it: {muscle.palpation}</div>}
          {muscle.clinical && <div className="callout clinical">{muscle.clinical}</div>}
        </div>
      )}
    </>
  );
}

function BoneDetails({ bone, onSelect }: { bone: BoneDef; onSelect: (ref: StructureRef) => void }) {
  const muscles = MUSCLES_BY_BONE[bone.id] ?? [];
  return (
    <>
      <div className="section">
        <h2>Classification</h2>
        <Fact label="Region">{bone.region}</Fact>
        <Fact label="Type">{bone.boneClass} bone</Fact>
      </div>

      <div className="section">
        <h2>Surface landmarks</h2>
        <ul className="bullets">
          {bone.landmarks.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h2>Articulations</h2>
        <StructureLinks ids={bone.articulations} kind="joint" onSelect={onSelect} />
      </div>

      <div className="section">
        <h2>Muscles attaching here ({muscles.length})</h2>
        <StructureLinks
          ids={muscles.map((m) => m.id)}
          kind="muscle"
          onSelect={onSelect}
          empty="No modelled attachments on this bone."
        />
      </div>

      <div className="section">
        <h2>Notes</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{bone.notes}</p>
        {bone.clinical && <div className="callout clinical">{bone.clinical}</div>}
      </div>
    </>
  );
}

function JointDetails({ joint, onSelect }: { joint: JointDef; onSelect: (ref: StructureRef) => void }) {
  const acting = MUSCLES_BY_JOINT[joint.id] ?? [];
  const motions = [...new Set(acting.flatMap((m) => m.actions.filter((a) => a.joint === joint.id).map((a) => a.motion)))];

  return (
    <>
      <div className="section">
        <h2>Classification</h2>
        <Fact label="Type">{joint.jointClass}</Fact>
        <Fact label="Bones">
          <StructureLinks ids={joint.bones} kind="bone" onSelect={onSelect} />
        </Fact>
      </div>

      <div className="section">
        <h2>Range of motion</h2>
        <ul className="bullets">
          {joint.rangeOfMotion.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h2>Muscles by motion</h2>
        {motions.map((motion) => {
          const list = musclesForMotion(joint.id, motion as MotionName);
          return (
            <div key={motion} style={{ marginBottom: 10 }}>
              <h3 style={{ margin: '0 0 3px' }}>{motion}</h3>
              <StructureLinks ids={list.map((m) => m.id)} kind="muscle" onSelect={onSelect} />
            </div>
          );
        })}
        {!motions.length && <span className="faint">No muscles in the atlas act directly here.</span>}
      </div>

      <div className="section">
        <h2>Ligaments</h2>
        <ul className="bullets">
          {joint.ligaments.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h2>Notes</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{joint.notes}</p>
        {joint.clinical && <div className="callout clinical">{joint.clinical}</div>}
      </div>
    </>
  );
}

function NerveDetails({ nerve, onSelect }: { nerve: NerveDef; onSelect: (ref: StructureRef) => void }) {
  const supplied = MUSCLES_BY_NERVE[nerve.id] ?? [];
  return (
    <>
      <div className="section">
        <h2>Origin</h2>
        <Fact label="Spinal levels">{nerve.roots}</Fact>
        {nerve.plexus && <Fact label="Plexus">{nerve.plexus}</Fact>}
        <Fact label="Fibre type">{nerve.kind}</Fact>
      </div>

      <div className="section">
        <h2>Course</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{nerve.course}</p>
      </div>

      <div className="section">
        <h2>Motor supply</h2>
        <ul className="bullets">
          {nerve.motorSupply.length ? (
            nerve.motorSupply.map((m) => <li key={m}>{m}</li>)
          ) : (
            <li>Purely sensory — no motor branches.</li>
          )}
        </ul>
        {supplied.length > 0 && (
          <>
            <h3>Modelled muscles ({supplied.length})</h3>
            <StructureLinks ids={supplied.map((m) => m.id)} kind="muscle" onSelect={onSelect} />
          </>
        )}
      </div>

      <div className="section">
        <h2>Sensory supply</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{nerve.sensorySupply}</p>
      </div>

      {nerve.clinical && (
        <div className="section">
          <h2>Clinical</h2>
          <div className="callout clinical">{nerve.clinical}</div>
        </div>
      )}
    </>
  );
}

export function DetailsPanel({ refs, onSelect, onFocus, onClear }: DetailsPanelProps) {
  if (!refs.length) {
    return (
      <div className="empty">
        <strong style={{ display: 'block', color: 'var(--text-dim)', marginBottom: 6 }}>
          Nothing selected
        </strong>
        Click any muscle, bone, joint or nerve in the model to identify it and read its
        attachments, actions, nerve supply and the exercises that isolate it.
      </div>
    );
  }

  const primary = refs[refs.length - 1];
  const structure = getStructure(primary.kind, primary.id);
  if (!structure) return <div className="empty">Unknown structure.</div>;

  const latin = 'latin' in structure ? structure.latin : undefined;

  return (
    <>
      {refs.length > 1 && (
        <div className="section">
          <h2>Selected ({refs.length})</h2>
          <div className="selected-list">
            {refs.map((r) => {
              const s = getStructure(r.kind, r.id);
              return (
                <button key={`${r.kind}:${r.id}`} onClick={() => onSelect(r)}>
                  {s ? sided(s.side, s.name) : r.id}
                </button>
              );
            })}
          </div>
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="btn" onClick={onClear}>
              Clear selection
            </button>
          </div>
        </div>
      )}

      <div className="detail-head">
        <div className="eyebrow">{KIND_LABEL[primary.kind]}</div>
        <h2>{sided(structure.side, structure.name)}</h2>
        {latin && <div className="latin">{latin}</div>}
        {primary.kind === 'muscle' && (
          <div className="faint" style={{ marginTop: 4 }}>
            {MUSCLE_BY_ID[primary.id].group} · layer{' '}
            {['superficial', 'intermediate', 'deep'][MUSCLE_BY_ID[primary.id].layer - 1]}
          </div>
        )}
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => onFocus(primary)}>
            Zoom to structure
          </button>
          {refs.length === 1 && (
            <button className="btn" onClick={onClear}>
              Deselect
            </button>
          )}
        </div>
      </div>

      {primary.kind === 'muscle' && <MuscleDetails muscle={MUSCLE_BY_ID[primary.id]} onSelect={onSelect} />}
      {primary.kind === 'bone' && <BoneDetails bone={BONE_BY_ID[primary.id]} onSelect={onSelect} />}
      {primary.kind === 'joint' && <JointDetails joint={JOINT_BY_ID[primary.id]} onSelect={onSelect} />}
      {primary.kind === 'nerve' && <NerveDetails nerve={NERVE_BY_ID[primary.id]} onSelect={onSelect} />}
    </>
  );
}
