import { useCallback, useMemo, useRef, useState } from 'react';

import { JOINT_BY_ID, getStructure, validateDataset } from './anatomy';
import type { SearchResult } from './anatomy/search';
import { RIG_NODE_BY_ID } from './anatomy/rig';
import type { Pose, StructureRef, Vec3 } from './anatomy/types';
import { analysePoseChange, detectSupport, type Support } from './engine/analysis';
import { clampNodeAngles } from './engine/kinematics';
import { POSE_PRESET_BY_ID, POSE_PRESETS } from './engine/poses';
import { AnalysisPanel } from './ui/AnalysisPanel';
import { DetailsPanel } from './ui/DetailsPanel';
import { LayersPanel } from './ui/LayersPanel';
import { PosePanel } from './ui/PosePanel';
import { SearchPanel } from './ui/SearchPanel';
import { Viewport } from './ui/Viewport';
import { AnatomyViewer, DEFAULT_LAYERS, type LayerState, type ViewerMode } from './three/viewer';

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

const MODE_HINTS: Record<ViewerMode, string> = {
  explore:
    'Click any structure to identify it. Drag to orbit, scroll to zoom. Shift-click to add to the selection.',
  search:
    'Matches are highlighted in green. Pick a result to light it up; “hip abduction” or “Romanian deadlift” work too.',
  pose: 'Drag a bone, muscle or joint marker to move that limb. Release to see which muscles drove the change.',
};

const KIND_LABEL: Record<string, string> = {
  muscle: 'Muscle',
  bone: 'Bone',
  joint: 'Joint',
  nerve: 'Nerve',
};

/** Dataset cross-references are checked once in dev so typos surface loudly. */
if (import.meta.env.DEV) {
  const issues = validateDataset();
  if (issues.length) console.warn('Anatomy dataset issues:', issues);
}

const sided = (side: string, name: string) =>
  side === 'center' ? name : `${side === 'left' ? 'Left' : 'Right'} ${name}`;

export default function App() {
  const viewerRef = useRef<AnatomyViewer | null>(null);

  const [mode, setMode] = useState<ViewerMode>('explore');
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [selection, setSelection] = useState<StructureRef[]>([]);
  const [hovered, setHovered] = useState<StructureRef | null>(null);
  const [transientHighlight, setTransientHighlight] = useState<StructureRef[]>([]);

  const [query, setQuery] = useState('');
  const [activeResult, setActiveResult] = useState<SearchResult | null>(null);

  const [pose, setPose] = useState<Pose>({});
  const [referencePose, setReferencePose] = useState<Pose>({});
  const [referenceLabel, setReferenceLabel] = useState('Anatomical position');
  const [history, setHistory] = useState<Pose[]>([]);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>('anatomical');
  const [support, setSupport] = useState<Support>('floor');
  const [grounded, setGrounded] = useState(true);
  const [coupling, setCoupling] = useState(true);
  const [rightTab, setRightTab] = useState<'movement' | 'structure'>('movement');

  // ------------------------------------------------------------------ selection

  const handleSelect = useCallback((ref: StructureRef | null, additive: boolean) => {
    if (!ref) {
      if (!additive) setSelection([]);
      return;
    }
    setSelection((current) => {
      const key = `${ref.kind}:${ref.id}`;
      const exists = current.some((r) => `${r.kind}:${r.id}` === key);
      if (additive) {
        return exists ? current.filter((r) => `${r.kind}:${r.id}` !== key) : [...current, ref];
      }
      return exists && current.length === 1 ? [] : [ref];
    });
    if (ref.kind === 'joint') {
      const joint = JOINT_BY_ID[ref.id];
      if (joint) setActiveNode(joint.node);
    }
    setRightTab('structure');
  }, []);

  const selectRefs = useCallback((refs: StructureRef[]) => {
    if (!refs.length) return;
    setSelection(refs);
    setRightTab('structure');
    const joint = refs.find((r) => r.kind === 'joint');
    if (joint) {
      const def = JOINT_BY_ID[joint.id];
      if (def) setActiveNode(def.node);
    }
  }, []);

  const selectFromPanel = useCallback((ref: StructureRef) => selectRefs([ref]), [selectRefs]);

  const focusStructure = useCallback((ref: StructureRef) => {
    viewerRef.current?.focus(ref);
  }, []);

  // --------------------------------------------------------------------- search

  const handlePickResult = useCallback((result: SearchResult) => {
    setActiveResult(result);
    if (result.primary) {
      setSelection([result.primary]);
      viewerRef.current?.focus(result.primary);
    } else {
      // Group results (a motion, an exercise, a muscle group) select the whole match set so
      // the details panel lists them and each one is one click away.
      setSelection(result.refs);
    }
    setRightTab('structure');
  }, []);

  const searchHits = useMemo<StructureRef[]>(() => {
    if (mode === 'search' && activeResult) return activeResult.refs;
    return transientHighlight;
  }, [mode, activeResult, transientHighlight]);

  // ----------------------------------------------------------------------- pose

  /** Snapshot a pose as both the undo step and the analysis reference. */
  const rememberPose = useCallback((snapshot: Pose, presetId: string | null) => {
    setHistory((h) => [...h.slice(-24), snapshot]);
    setReferencePose(snapshot);
    setReferenceLabel(labelForPose(snapshot, presetId));
  }, []);

  const pushHistory = useCallback(
    () => rememberPose(pose, activePresetId),
    [rememberPose, pose, activePresetId],
  );

  /**
   * A drag emits many intermediate poses, so the pose state has already moved on by the time
   * the gesture is released. Capture the pre-drag pose up front — that is what the movement
   * analysis has to compare against.
   */
  const gestureStart = useRef<{ pose: Pose; presetId: string | null } | null>(null);

  const handleDragStart = useCallback(
    (node: string) => {
      setActiveNode(node);
      gestureStart.current = { pose, presetId: activePresetId };
    },
    [pose, activePresetId],
  );

  const handleApplyPreset = useCallback(
    (id: string) => {
      const preset = POSE_PRESET_BY_ID[id];
      if (!preset) return;
      pushHistory();
      setPose(preset.pose);
      setActivePresetId(id);
      setGrounded(preset.grounded ?? true);
      setSupport(preset.support ?? detectSupport(preset.pose));
      setMode('pose');
      setRightTab('movement');
    },
    [pushHistory],
  );

  /**
   * Live drag updates should not each become an undo step, so the pose is replaced
   * silently until the drag is released.
   */
  const handlePoseChange = useCallback(
    (next: Pose, committed: boolean) => {
      if (!committed) {
        setPose(next);
        return;
      }
      const start = gestureStart.current;
      rememberPose(start?.pose ?? pose, start?.presetId ?? activePresetId);
      gestureStart.current = null;
      setPose(next);
      setActivePresetId(null);
      setRightTab('movement');
    },
    [rememberPose, pose, activePresetId],
  );

  const handleSetAngle = useCallback(
    (node: string, axis: 'x' | 'y' | 'z', value: number) => {
      const def = RIG_NODE_BY_ID[node];
      if (!def) return;
      const current: Vec3 = [...((pose[node] as Vec3) ?? [0, 0, 0])] as Vec3;
      current[AXIS_INDEX[axis]] = value;
      const next = { ...pose, [node]: clampNodeAngles(def, current) };
      // Slider drags are continuous; keep one history entry for the whole gesture.
      if (activePresetId !== null) {
        pushHistory();
        setActivePresetId(null);
      }
      setPose(next);
      setRightTab('movement');
    },
    [pose, activePresetId, pushHistory],
  );

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const previous = h[h.length - 1];
      setPose(previous);
      setActivePresetId(null);
      return h.slice(0, -1);
    });
  }, []);

  const handleReset = useCallback(() => {
    pushHistory();
    setPose({});
    setActivePresetId('anatomical');
    setGrounded(true);
    setSupport('floor');
  }, [pushHistory]);

  const handleMarkReference = useCallback(() => {
    setReferencePose(pose);
    setReferenceLabel(labelForPose(pose, activePresetId) + ' (pinned)');
  }, [pose, activePresetId]);

  const analysis = useMemo(() => {
    if (mode !== 'pose') return null;
    return analysePoseChange(referencePose, pose, support);
  }, [mode, referencePose, pose, support]);

  const currentLabel = labelForPose(pose, activePresetId);

  // ----------------------------------------------------------------------- view

  const hoverLabel = useMemo(() => {
    if (!hovered) return null;
    const structure = getStructure(hovered.kind, hovered.id);
    if (!structure) return null;
    return { kind: KIND_LABEL[hovered.kind], name: sided(structure.side, structure.name) };
  }, [hovered]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Anatomy Explorer</h1>
          <span className="tag">Interactive musculoskeletal atlas</span>
        </div>

        <div className="modes" role="group" aria-label="Mode">
          {(['explore', 'search', 'pose'] as ViewerMode[]).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                if (m === 'pose') setRightTab('movement');
                if (m !== 'search') setActiveResult(null);
              }}
            >
              {m === 'explore' ? 'Identify' : m === 'search' ? 'Search' : 'Pose & analyse'}
            </button>
          ))}
        </div>

        <div className="topbar-right">
          <div className="viewbtns">
            {(['front', 'back', 'left', 'right', 'top'] as const).map((view) => (
              <button key={view} onClick={() => viewerRef.current?.setCameraPreset(view)}>
                {view}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => viewerRef.current?.resetCamera()}>
            Reset view
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          {mode === 'search' ? (
            <SearchPanel
              query={query}
              activeKey={activeResult?.key ?? null}
              onQueryChange={(q) => {
                setQuery(q);
                setActiveResult(null);
              }}
              onPick={handlePickResult}
            />
          ) : mode === 'pose' ? (
            <PosePanel
              pose={pose}
              activeNode={activeNode}
              activePresetId={activePresetId}
              support={support}
              grounded={grounded}
              coupling={coupling}
              canUndo={history.length > 0}
              referenceLabel={referenceLabel}
              onApplyPreset={handleApplyPreset}
              onSetAngle={handleSetAngle}
              onActiveNodeChange={setActiveNode}
              onSupportChange={setSupport}
              onGroundedChange={setGrounded}
              onCouplingChange={setCoupling}
              onUndo={handleUndo}
              onReset={handleReset}
              onMarkReference={handleMarkReference}
            />
          ) : (
            <LayersPanel layers={layers} onChange={(patch) => setLayers((l) => ({ ...l, ...patch }))} />
          )}

          {mode !== 'explore' && (
            <LayersPanel layers={layers} onChange={(patch) => setLayers((l) => ({ ...l, ...patch }))} />
          )}
        </aside>

        <main className="stage">
          <Viewport
            mode={mode}
            layers={layers}
            pose={pose}
            grounded={grounded}
            coupling={coupling}
            selection={selection}
            searchHits={searchHits}
            onHover={setHovered}
            onSelect={handleSelect}
            onPoseChange={handlePoseChange}
            onDragStart={handleDragStart}
            onReady={(viewer) => {
              viewerRef.current = viewer;
            }}
          />
          <div className="stage-hint">{MODE_HINTS[mode]}</div>
          {hoverLabel && (
            <div className="hoverchip">
              <span className="kind">{hoverLabel.kind}</span>
              {hoverLabel.name}
            </div>
          )}
        </main>

        <aside className="sidebar right">
          {mode === 'pose' && (
            <div className="section" style={{ paddingBottom: 10 }}>
              <div className="modes" style={{ width: '100%' }}>
                <button
                  style={{ flex: 1 }}
                  aria-pressed={rightTab === 'movement'}
                  onClick={() => setRightTab('movement')}
                >
                  Movement
                </button>
                <button
                  style={{ flex: 1 }}
                  aria-pressed={rightTab === 'structure'}
                  onClick={() => setRightTab('structure')}
                >
                  Structure
                </button>
              </div>
            </div>
          )}

          {mode === 'pose' && rightTab === 'movement' ? (
            <AnalysisPanel
              analysis={analysis}
              fromLabel={referenceLabel}
              toLabel={currentLabel}
              onSelect={(refs) => selectRefs(refs)}
              onHover={setTransientHighlight}
            />
          ) : (
            <DetailsPanel
              refs={selection}
              onSelect={selectFromPanel}
              onFocus={focusStructure}
              onClear={() => setSelection([])}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function labelForPose(pose: Pose, presetId: string | null): string {
  if (presetId && POSE_PRESET_BY_ID[presetId]) return POSE_PRESET_BY_ID[presetId].name;
  if (!Object.keys(pose).length) return 'Anatomical position';
  const preset = POSE_PRESETS.find((p) => samePose(p.pose, pose));
  return preset ? preset.name : 'Custom pose';
}

function samePose(a: Pose, b: Pose): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const va = a[key] ?? [0, 0, 0];
    const vb = b[key] ?? [0, 0, 0];
    for (let i = 0; i < 3; i++) if (Math.abs(va[i] - vb[i]) > 0.5) return false;
  }
  return true;
}
