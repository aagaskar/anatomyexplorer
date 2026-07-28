import { useEffect, useRef } from 'react';

import type { Pose, StructureRef } from '../anatomy/types';
import { AnatomyViewer, type LayerState, type ViewerMode } from '../three/viewer';

interface ViewportProps {
  mode: ViewerMode;
  layers: LayerState;
  pose: Pose;
  grounded: boolean;
  coupling: boolean;
  selection: StructureRef[];
  searchHits: StructureRef[];
  onHover: (ref: StructureRef | null) => void;
  onSelect: (ref: StructureRef | null, additive: boolean) => void;
  onPoseChange: (pose: Pose, committed: boolean) => void;
  onDragStart: (nodeId: string) => void;
  onReady: (viewer: AnatomyViewer) => void;
}

/**
 * Bridges React state onto the imperative `AnatomyViewer`. The viewer is created once;
 * everything after that is a targeted sync, so posing never triggers a scene rebuild.
 */
export function Viewport(props: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<AnatomyViewer | null>(null);
  // Callbacks change every render; route them through a ref so the viewer keeps one identity.
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewer = new AnatomyViewer(canvas, {
      onHover: (ref) => handlers.current.onHover(ref),
      onSelect: (ref, additive) => handlers.current.onSelect(ref, additive),
      onPoseChange: (pose, committed) => handlers.current.onPoseChange(pose, committed),
      onDragStart: (node) => handlers.current.onDragStart(node),
    });
    viewerRef.current = viewer;
    handlers.current.onReady(viewer);
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerRef.current?.setMode(props.mode);
  }, [props.mode]);

  useEffect(() => {
    viewerRef.current?.setLayers(props.layers);
  }, [props.layers]);

  useEffect(() => {
    viewerRef.current?.setPose(props.pose, { grounded: props.grounded, coupling: props.coupling });
  }, [props.pose, props.grounded, props.coupling]);

  useEffect(() => {
    viewerRef.current?.setSelection(props.selection);
  }, [props.selection]);

  useEffect(() => {
    viewerRef.current?.setSearchHits(props.searchHits);
  }, [props.searchHits]);

  return <canvas ref={canvasRef} />;
}
