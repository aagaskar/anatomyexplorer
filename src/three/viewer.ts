/**
 * The 3D viewer: builds the scene from the atlas, handles picking, highlighting, layer
 * visibility, camera framing and drag-to-pose.
 *
 * It is deliberately imperative and framework-free. React owns the panels and the app
 * state; this class owns the canvas and exposes a small command surface.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  GridHelper,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { BONES, JOINTS, MUSCLES, NERVES } from '../anatomy';
import { RIG_NODE_BY_ID } from '../anatomy/rig';
import type { MuscleDef, NerveDef, Pose, StructureKind, StructureRef, Vec3 } from '../anatomy/types';
import { clampNodeAngles, Rig } from '../engine/kinematics';
import { buildBoneGeometry } from './boneGeometry';
import { MuscleTube } from './muscleTube';
import { buildSilhouette } from './silhouette';

const DEG = 180 / Math.PI;

export type ViewerMode = 'explore' | 'search' | 'pose';

export interface LayerState {
  bones: boolean;
  muscles: boolean;
  joints: boolean;
  nerves: boolean;
  skin: boolean;
  /** Superficial / intermediate / deep muscle layers. */
  muscleLayers: [boolean, boolean, boolean];
  /** Dim everything that is not highlighted. */
  isolate: boolean;
  muscleOpacity: number;
}

export const DEFAULT_LAYERS: LayerState = {
  bones: true,
  muscles: true,
  joints: true,
  nerves: false,
  skin: false,
  muscleLayers: [true, true, false],
  isolate: false,
  muscleOpacity: 1,
};

export interface ViewerCallbacks {
  onHover?: (ref: StructureRef | null) => void;
  onSelect?: (ref: StructureRef | null, additive: boolean) => void;
  /** Fired continuously while dragging, and once more with `committed` on release. */
  onPoseChange?: (pose: Pose, committed: boolean) => void;
  onDragStart?: (nodeId: string) => void;
}

interface Entry {
  ref: StructureRef;
  mesh: Mesh;
  material: MeshStandardMaterial;
  baseColor: Color;
  baseOpacity: number;
  /** Rig node used when this structure is dragged. */
  dragNode?: string;
  layer?: 1 | 2 | 3;
  tube?: MuscleTube;
  path?: { node: string; pos: Vec3 }[];
}

/**
 * Muscles are all shades of red, which makes a wall of them hard to read. Nudging hue and
 * lightness deterministically per functional group keeps neighbouring muscles
 * distinguishable without inventing unanatomical colours.
 */
function bellyColorFor(group: string): Color {
  let hash = 0;
  for (let i = 0; i < group.length; i++) hash = (hash * 31 + group.charCodeAt(i)) % 100000;
  const hue = 0.015 + ((hash % 100) / 100) * 0.028;
  const lightness = 0.29 + (((hash >> 7) % 100) / 100) * 0.09;
  return new Color().setHSL(hue, 0.64, lightness);
}

const COLORS = {
  bone: new Color('#ded6c4'),
  muscleHighlight: new Color('#ff7a4d'),
  joint: new Color('#59c2e8'),
  nerve: new Color('#f2d24b'),
  select: new Color('#ffb648'),
  search: new Color('#4fd6b0'),
  hover: new Color('#ffffff'),
};

export class AnatomyViewer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly rig = new Rig();
  private readonly entries = new Map<string, Entry>();
  private readonly muscleGroup = new Group();
  private readonly nerveGroup = new Group();
  private readonly jointGroup = new Group();
  private silhouetteMeshes: Mesh[] = [];

  private layers: LayerState = { ...DEFAULT_LAYERS };
  private mode: ViewerMode = 'explore';
  private pose: Pose = {};
  private grounded = true;
  private coupling = true;

  private hovered: string | null = null;
  private selected = new Set<string>();
  private searchHits = new Set<string>();

  private drag:
    | {
        node: string;
        /** Hinges rotate along a screen-space arc; ball joints aim at a plane. */
        kind: 'hinge';
        axisIndex: 0 | 1 | 2;
        startAngle: number;
        startPointer: Vector2;
        moved: boolean;
      }
    | {
        node: string;
        kind: 'aim';
        plane: Plane;
        twist: number;
        moved: boolean;
      }
    | null = null;

  private disposed = false;
  private needsRender = true;
  private readonly callbacks: ViewerCallbacks;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement, callbacks: ViewerCallbacks = {}) {
    this.callbacks = callbacks;

    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.scene.background = new Color('#0d1015');

    this.camera = new PerspectiveCamera(34, 1, 0.05, 60);
    this.camera.position.set(0.95, 1.15, 3.1);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.88, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 8;
    this.controls.addEventListener('change', () => {
      this.needsRender = true;
    });

    this.setupLights();
    this.setupGround();

    this.scene.add(this.rig.root);
    this.scene.add(this.muscleGroup, this.nerveGroup, this.jointGroup);

    this.buildBones();
    this.buildJoints();
    this.buildMuscles();
    this.buildNerves();
    this.silhouetteMeshes = buildSilhouette(this.rig.nodes);

    this.applyPose();
    this.applyLayers();

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  // ------------------------------------------------------------------ scene setup

  private setupLights(): void {
    this.scene.add(new HemisphereLight('#cfe4ff', '#26211c', 0.55));
    this.scene.add(new AmbientLight('#ffffff', 0.13));

    const key = new DirectionalLight('#fff2e0', 1.5);
    key.position.set(2.2, 3.4, 2.6);
    this.scene.add(key);

    const fill = new DirectionalLight('#9fc4ff', 0.48);
    fill.position.set(-2.6, 1.4, 1.2);
    this.scene.add(fill);

    const rim = new DirectionalLight('#ffd9b0', 0.6);
    rim.position.set(-0.6, 1.8, -3);
    this.scene.add(rim);
  }

  private setupGround(): void {
    const disc = new Mesh(
      new CircleGeometry(2.4, 64),
      new MeshStandardMaterial({ color: '#151a21', roughness: 1, metalness: 0, side: DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.002;
    this.scene.add(disc);

    const grid = new GridHelper(4.8, 24, '#2a3340', '#1c232c');
    const gridMaterial = grid.material as LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.5;
    this.scene.add(grid);
  }

  // ------------------------------------------------------------------ build atlas

  private key(kind: StructureKind, id: string): string {
    return `${kind}:${id}`;
  }

  private register(entry: Entry): void {
    entry.mesh.userData.structure = entry.ref;
    this.entries.set(this.key(entry.ref.kind, entry.ref.id), entry);
  }

  private buildBones(): void {
    for (const bone of BONES) {
      const parent = this.rig.nodes[bone.node];
      if (!parent) continue;
      const geometry = buildBoneGeometry(bone.shape);
      geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({
        color: COLORS.bone.clone(),
        roughness: 0.68,
        metalness: 0.02,
        transparent: true,
        opacity: 1,
      });
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = 1;
      parent.add(mesh);
      this.register({
        ref: { kind: 'bone', id: bone.id },
        mesh,
        material,
        baseColor: COLORS.bone.clone(),
        baseOpacity: 1,
        dragNode: bone.node,
      });
    }
  }

  private buildJoints(): void {
    const geometry = new SphereGeometry(1, 16, 12);
    for (const joint of JOINTS) {
      const parent = this.rig.nodes[joint.node];
      if (!parent) continue;
      const material = new MeshStandardMaterial({
        color: COLORS.joint.clone(),
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55,
        emissive: COLORS.joint.clone().multiplyScalar(0.25),
      });
      const mesh = new Mesh(geometry, material);
      mesh.scale.setScalar(joint.markerRadius);
      mesh.position.set(joint.marker[0], joint.marker[1], joint.marker[2]);
      mesh.renderOrder = 3;
      parent.add(mesh);
      this.register({
        ref: { kind: 'joint', id: joint.id },
        mesh,
        material,
        baseColor: COLORS.joint.clone(),
        baseOpacity: 0.55,
        dragNode: joint.node,
      });
    }
  }

  private tubeFor(def: MuscleDef | NerveDef, isNerve: boolean): Entry {
    const path = def.path.map((p) => ({ node: p.node, pos: p.pos }));
    const restLength = this.restLength(path);
    const girth = isNerve ? (def as NerveDef).radius : (def as MuscleDef).girth;
    const tube = new MuscleTube({
      girth,
      restLength,
      tubular: Math.min(30, Math.max(14, path.length * 8)),
      radial: isNerve ? 6 : 9,
      tendonRatio: isNerve ? 0.95 : 0.34,
      bellyColor: isNerve ? new Color('#f0cf4a') : bellyColorFor((def as MuscleDef).group),
      tendonColor: isNerve ? new Color('#fdf0b0') : new Color('#e9e3d6'),
    });
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: isNerve ? 0.4 : 0.72,
      metalness: 0.02,
      transparent: true,
      opacity: 1,
    });
    const mesh = new Mesh(tube.geometry, material);
    mesh.renderOrder = isNerve ? 4 : 2;
    return {
      ref: { kind: isNerve ? 'nerve' : 'muscle', id: def.id },
      mesh,
      material,
      baseColor: new Color('#ffffff'),
      baseOpacity: 1,
      tube,
      path,
      layer: isNerve ? undefined : (def as MuscleDef).layer,
      dragNode: path[path.length - 1]?.node,
    };
  }

  private restLength(path: { node: string; pos: Vec3 }[]): number {
    const rest = new Rig();
    rest.applyPose({}, { ground: false, coupling: false });
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const a = rest.worldPoint(path[i - 1].node, path[i - 1].pos);
      const b = rest.worldPoint(path[i].node, path[i].pos);
      total += a.distanceTo(b);
    }
    return total;
  }

  private buildMuscles(): void {
    for (const muscle of MUSCLES) {
      const entry = this.tubeFor(muscle, false);
      this.muscleGroup.add(entry.mesh);
      this.register(entry);
    }
  }

  private buildNerves(): void {
    for (const nerve of NERVES) {
      const entry = this.tubeFor(nerve, true);
      this.nerveGroup.add(entry.mesh);
      this.register(entry);
    }
  }

  // ------------------------------------------------------------------- public API

  setPose(pose: Pose, options: { grounded?: boolean; coupling?: boolean } = {}): void {
    this.pose = pose;
    if (options.grounded !== undefined) this.grounded = options.grounded;
    if (options.coupling !== undefined) this.coupling = options.coupling;
    this.applyPose();
  }

  getPose(): Pose {
    return this.pose;
  }

  setMode(mode: ViewerMode): void {
    this.mode = mode;
    this.canvas.style.cursor = mode === 'pose' ? 'grab' : 'default';
    this.needsRender = true;
  }

  setLayers(layers: Partial<LayerState>): void {
    this.layers = { ...this.layers, ...layers };
    this.applyLayers();
  }

  getLayers(): LayerState {
    return this.layers;
  }

  setSelection(refs: StructureRef[]): void {
    this.selected = new Set(refs.map((r) => this.key(r.kind, r.id)));
    this.applyAppearance();
  }

  setSearchHits(refs: StructureRef[]): void {
    this.searchHits = new Set(refs.map((r) => this.key(r.kind, r.id)));
    this.applyAppearance();
  }

  /** Frame the camera on a structure, keeping the current viewing direction. */
  focus(ref: StructureRef): void {
    const entry = this.entries.get(this.key(ref.kind, ref.id));
    if (!entry) return;
    entry.mesh.updateMatrixWorld(true);
    const box = new Box3().setFromObject(entry.mesh);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const radius = Math.max(box.getSize(new Vector3()).length() / 2, 0.06);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const distance = Math.max(radius * 4.2, 0.42);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.update();
    this.needsRender = true;
  }

  resetCamera(): void {
    this.controls.target.set(0, 0.88, 0);
    this.camera.position.set(0.95, 1.15, 3.1);
    this.controls.update();
    this.needsRender = true;
  }

  setCameraPreset(preset: 'front' | 'back' | 'left' | 'right' | 'top'): void {
    const target = new Vector3(0, 0.88, 0);
    const distance = 3.2;
    const positions: Record<string, Vector3> = {
      front: new Vector3(0, 0.95, distance),
      back: new Vector3(0, 0.95, -distance),
      left: new Vector3(distance, 0.95, 0),
      right: new Vector3(-distance, 0.95, 0),
      top: new Vector3(0.001, 0.95 + distance, 0.001),
    };
    this.controls.target.copy(target);
    this.camera.position.copy(positions[preset]);
    this.controls.update();
    this.needsRender = true;
  }

  /** PNG data URL of the current view. */
  snapshot(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    for (const entry of this.entries.values()) {
      entry.material.dispose();
      if (entry.tube) entry.tube.dispose();
      else entry.mesh.geometry.dispose();
    }
    this.controls.dispose();
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------- internals

  private applyPose(): void {
    this.rig.applyPose(this.pose, { ground: this.grounded, coupling: this.coupling });
    const points: Vector3[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.tube || !entry.path) continue;
      points.length = 0;
      for (const p of entry.path) points.push(this.rig.worldPoint(p.node, p.pos, new Vector3()));
      entry.tube.update(points);
    }
    this.needsRender = true;
  }

  private applyLayers(): void {
    for (const entry of this.entries.values()) {
      let visible = true;
      switch (entry.ref.kind) {
        case 'bone':
          visible = this.layers.bones;
          break;
        case 'joint':
          visible = this.layers.joints;
          break;
        case 'nerve':
          visible = this.layers.nerves;
          break;
        case 'muscle':
          visible = this.layers.muscles && this.layers.muscleLayers[(entry.layer ?? 1) - 1];
          break;
      }
      entry.mesh.visible = visible;
    }
    for (const mesh of this.silhouetteMeshes) mesh.visible = this.layers.skin;
    this.applyAppearance();
  }

  /** Recompute per-structure colour and opacity from selection, search and hover state. */
  private applyAppearance(): void {
    const anyHighlight = this.selected.size > 0 || this.searchHits.size > 0;
    for (const [key, entry] of this.entries) {
      const isSelected = this.selected.has(key);
      const isHit = this.searchHits.has(key);
      const isHovered = this.hovered === key;
      const material = entry.material;

      let emissive = 0;
      let emissiveColor = COLORS.select;
      // Search hits win over selection: picking a "hip abduction" result selects the whole
      // set, and it should read as one green group rather than a mix of green and amber.
      if (isHit) {
        emissive = 0.8;
        emissiveColor = COLORS.search;
      } else if (isSelected) {
        emissive = 0.85;
        emissiveColor = COLORS.select;
      } else if (isHovered) {
        emissive = 0.4;
        emissiveColor = COLORS.hover;
      }

      material.emissive.copy(emissiveColor).multiplyScalar(emissive);
      material.emissiveIntensity = 1;

      let opacity = entry.baseOpacity;
      if (entry.ref.kind === 'muscle') opacity *= this.layers.muscleOpacity;
      if (this.layers.isolate && anyHighlight && !isSelected && !isHit) opacity *= 0.08;
      material.opacity = opacity;
      material.transparent = opacity < 0.999;
      material.depthWrite = opacity > 0.9;
      material.needsUpdate = false;
    }
    this.needsRender = true;
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pick(): Entry | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const candidates: Mesh[] = [];
    for (const entry of this.entries.values()) {
      if (entry.mesh.visible && entry.material.opacity > 0.12) candidates.push(entry.mesh);
    }
    const hits = this.raycaster.intersectObjects(candidates, false);
    if (!hits.length) return null;
    const ref = hits[0].object.userData.structure as StructureRef | undefined;
    if (!ref) return null;
    return this.entries.get(this.key(ref.kind, ref.id)) ?? null;
  }

  private onPointerMove = (event: PointerEvent) => {
    this.updatePointer(event);
    if (this.drag) {
      this.dragTo();
      return;
    }
    const entry = this.pick();
    const key = entry ? this.key(entry.ref.kind, entry.ref.id) : null;
    if (key !== this.hovered) {
      this.hovered = key;
      this.applyAppearance();
      this.callbacks.onHover?.(entry ? entry.ref : null);
      this.canvas.style.cursor = entry
        ? this.mode === 'pose'
          ? 'grab'
          : 'pointer'
        : this.mode === 'pose'
          ? 'grab'
          : 'default';
    }
  };

  private onPointerLeave = () => {
    if (this.hovered) {
      this.hovered = null;
      this.applyAppearance();
      this.callbacks.onHover?.(null);
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.updatePointer(event);
    const entry = this.pick();

    if (this.mode === 'pose' && entry?.dragNode) {
      const node = this.resolveDragNode(entry);
      if (node) {
        this.beginDrag(node);
        return;
      }
    }
    if (!entry) {
      this.callbacks.onSelect?.(null, event.shiftKey);
      return;
    }
    this.callbacks.onSelect?.(entry.ref, event.shiftKey || event.metaKey || event.ctrlKey);
  };

  /**
   * Which rig node should a drag on this structure rotate? For a bone or joint it is the
   * node it belongs to. For a muscle we take the attachment nearest the click, which makes
   * dragging a hamstring move the leg rather than the pelvis.
   */
  private resolveDragNode(entry: Entry): string | null {
    let node = entry.dragNode ?? null;
    if (entry.ref.kind === 'muscle' && entry.path) {
      const hit = this.raycaster.intersectObject(entry.mesh, false)[0];
      if (hit) {
        let best = Infinity;
        for (const p of entry.path) {
          const world = this.rig.worldPoint(p.node, p.pos, new Vector3());
          const d = world.distanceTo(hit.point);
          if (d < best) {
            best = d;
            node = p.node;
          }
        }
      }
    }
    // Walk up to the nearest node that can actually be posed.
    let cursor: string | null = node;
    while (cursor) {
      const def = RIG_NODE_BY_ID[cursor];
      if (def && def.dofs.length && !def.poseLocked) return cursor;
      cursor = def?.parent ?? null;
    }
    return null;
  }

  private beginDrag(node: string): void {
    const object = this.rig.nodes[node];
    if (!object) return;
    const def = RIG_NODE_BY_ID[node];
    const current = this.pose[node] ?? [0, 0, 0];

    if (def.dofs.length === 1) {
      // A hinge has one answer per gesture, so track the pointer along the arc the segment
      // sweeps on screen. That works from any viewpoint — including looking straight down
      // the plane of motion, where a plane-projected drag gives nothing.
      const axisIndex = { x: 0, y: 1, z: 2 }[def.dofs[0].axis] as 0 | 1 | 2;
      this.drag = {
        node,
        kind: 'hinge',
        axisIndex,
        startAngle: current[axisIndex],
        startPointer: this.pointer.clone(),
        moved: false,
      };
    } else {
      const origin = new Vector3().setFromMatrixPosition(object.matrixWorld);
      const normal = this.camera.getWorldDirection(new Vector3()).negate();
      const twistAxis = def.dofs.find((d) => this.axisMatchesAim(d.axis, def.aim));
      const twist = twistAxis ? current[{ x: 0, y: 1, z: 2 }[twistAxis.axis]] : 0;
      this.drag = {
        node,
        kind: 'aim',
        plane: new Plane().setFromNormalAndCoplanarPoint(normal, origin),
        twist,
        moved: false,
      };
    }

    this.controls.enabled = false;
    this.canvas.style.cursor = 'grabbing';
    this.callbacks.onDragStart?.(node);
  }

  /** Project a world point into pixel coordinates on the canvas. */
  private toScreen(point: Vector3, target = new Vector2()): Vector2 {
    const ndc = point.clone().project(this.camera);
    return target.set((ndc.x * this.canvas.clientWidth) / 2, (ndc.y * this.canvas.clientHeight) / 2);
  }

  /**
   * How far, and in which screen direction, does the end of this segment travel per degree
   * of rotation? Used to convert a pointer drag into a hinge angle.
   */
  private hingeScreenGradient(node: string, axis: 'x' | 'y' | 'z'): { direction: Vector2; degreesPerPixel: number } {
    const def = RIG_NODE_BY_ID[node];
    const origin = this.rig.worldPosition(node);
    const axisWorld = this.rig.worldAxis(node, axis);
    const aim = new Vector3(...(def.aim ?? [0, -1, 0]));
    const length = def.segmentLength ?? 0.15;
    const tip = aim
      .normalize()
      .multiplyScalar(length)
      .applyMatrix4(new Matrix4().extractRotation(this.rig.nodes[node].matrixWorld))
      .add(origin);

    const probeDegrees = 6;
    const rotated = tip.clone().sub(origin).applyAxisAngle(axisWorld, probeDegrees / DEG).add(origin);

    const a = this.toScreen(tip);
    const b = this.toScreen(rotated);
    const delta = b.sub(a);
    const pixels = delta.length();
    if (pixels < 0.75) return { direction: new Vector2(1, 0), degreesPerPixel: 0 };
    return { direction: delta.divideScalar(pixels), degreesPerPixel: Math.min(probeDegrees / pixels, 1.4) };
  }

  private axisMatchesAim(axis: 'x' | 'y' | 'z', aim?: Vec3): boolean {
    if (!aim) return false;
    const v = { x: Math.abs(aim[0]), y: Math.abs(aim[1]), z: Math.abs(aim[2]) };
    const max = Math.max(v.x, v.y, v.z);
    return v[axis] === max;
  }

  /**
   * Aim the dragged segment at the pointer.
   *
   * The pointer is projected onto a plane through the joint facing the camera, then the
   * node is rotated so its rest direction points at that target. Clamping to the declared
   * range of motion is what makes a hinge behave like a hinge: axes with no degree of
   * freedom are zeroed, so an elbow can only ever fold in its own plane.
   */
  private dragTo(): void {
    if (!this.drag) return;
    const object = this.rig.nodes[this.drag.node];
    const def = RIG_NODE_BY_ID[this.drag.node];
    if (!object || !def) return;

    if (this.drag.kind === 'hinge') {
      const dof = def.dofs[0];
      const { direction, degreesPerPixel } = this.hingeScreenGradient(this.drag.node, dof.axis);
      if (!degreesPerPixel) return;
      const moved = new Vector2(
        ((this.pointer.x - this.drag.startPointer.x) * this.canvas.clientWidth) / 2,
        ((this.pointer.y - this.drag.startPointer.y) * this.canvas.clientHeight) / 2,
      );
      const angle = this.drag.startAngle + moved.dot(direction) * degreesPerPixel;
      const next: Vec3 = [0, 0, 0];
      next[this.drag.axisIndex] = angle;
      this.commitDrag(def, clampNodeAngles(def, next));
      return;
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const target = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.drag.plane, target)) return;

    const origin = new Vector3().setFromMatrixPosition(object.matrixWorld);
    const desiredWorld = target.sub(origin);
    if (desiredWorld.lengthSq() < 1e-6) return;
    desiredWorld.normalize();

    const parent = object.parent ?? this.rig.root;
    const parentQuat = parent.getWorldQuaternion(new Quaternion()).invert();
    const desiredLocal = desiredWorld.applyQuaternion(parentQuat).normalize();

    const rest = new Vector3(...(def.aim ?? [0, -1, 0])).normalize();
    const swing = new Quaternion().setFromUnitVectors(rest, desiredLocal);

    // Preserve any axial rotation the user had already dialled in.
    const twistAxis = def.dofs.find((d) => this.axisMatchesAim(d.axis, def.aim));
    if (twistAxis && this.drag.twist) {
      swing.multiply(new Quaternion().setFromAxisAngle(rest, this.drag.twist / DEG));
    }
    const euler = new Euler().setFromQuaternion(swing, 'XYZ');
    this.commitDrag(def, clampNodeAngles(def, [euler.x * DEG, euler.y * DEG, euler.z * DEG]));
  }

  private commitDrag(def: { id: string }, angles: Vec3): void {
    if (!this.drag) return;
    this.drag.moved = true;
    this.pose = { ...this.pose, [def.id]: angles };
    this.applyPose();
    this.callbacks.onPoseChange?.(this.pose, false);
  }

  private onPointerUp = () => {
    if (!this.drag) return;
    const moved = this.drag.moved;
    this.drag = null;
    this.controls.enabled = true;
    this.canvas.style.cursor = this.mode === 'pose' ? 'grab' : 'default';
    if (moved) this.callbacks.onPoseChange?.(this.pose, true);
  };

  private resize(): void {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? this.canvas.clientWidth;
    const height = parent?.clientHeight ?? this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private tick = () => {
    if (this.disposed) return;
    if (this.controls.enableDamping) this.controls.update();
    if (this.needsRender) this.render();
  };

  private render(): void {
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
  }
}

/** Exposed for the UI so it can label drag targets. */
export function nodeLabel(nodeId: string): string {
  return RIG_NODE_BY_ID[nodeId]?.label ?? nodeId;
}

export type { Object3D };
