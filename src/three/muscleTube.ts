/**
 * Deformable muscle and nerve geometry.
 *
 * A muscle is drawn as a tube swept along its attachment path. Because the path moves with
 * the pose, the tube has to be rebuilt whenever the model is posed — but reallocating a
 * geometry per muscle per frame would be wasteful, so the buffers are allocated once and
 * only the vertex positions and normals are rewritten in place.
 *
 * Two touches make it read as muscle rather than pipe: the radius tapers to a thin tendon
 * at each end, and the belly bulges as the muscle shortens, roughly conserving volume the
 * way real muscle does.
 */

import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Vector3 } from 'three';

export interface MuscleTubeOptions {
  /** Radius of the belly at rest, metres. */
  girth: number;
  /** Length of the path in the rest pose, used for the bulge calculation. */
  restLength: number;
  tubular?: number;
  radial?: number;
  /** Fraction of the girth the tendon ends taper to. 1 = no taper (used for nerves). */
  tendonRatio?: number;
  bellyColor?: Color;
  tendonColor?: Color;
}

const TENDON = new Color('#e8e2d4');
const BELLY = new Color('#b3402f');

export class MuscleTube {
  readonly geometry = new BufferGeometry();
  private readonly tubular: number;
  private readonly radial: number;
  private readonly girth: number;
  private readonly tendonRatio: number;
  private restLength: number;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;

  /** Length of the path as last drawn, metres. */
  currentLength = 0;

  constructor(options: MuscleTubeOptions) {
    this.tubular = options.tubular ?? 24;
    this.radial = options.radial ?? 8;
    this.girth = options.girth;
    this.tendonRatio = options.tendonRatio ?? 0.4;
    this.restLength = Math.max(options.restLength, 1e-4);

    const rings = this.tubular + 1;
    const perRing = this.radial + 1;
    const count = rings * perRing;
    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);

    const uvs = new Float32Array(count * 2);
    const colors = new Float32Array(count * 3);
    const indices: number[] = [];
    const belly = options.bellyColor ?? BELLY;
    const tendon = options.tendonColor ?? TENDON;
    const mix = new Color();

    for (let i = 0; i < rings; i++) {
      const t = i / this.tubular;
      // Tendon at both ends, muscle belly in the middle.
      const fleshiness = Math.pow(Math.sin(Math.PI * t), 0.45);
      mix.copy(tendon).lerp(belly, fleshiness);
      for (let j = 0; j < perRing; j++) {
        const k = i * perRing + j;
        uvs[k * 2] = t;
        uvs[k * 2 + 1] = j / this.radial;
        colors[k * 3] = mix.r;
        colors[k * 3 + 1] = mix.g;
        colors[k * 3 + 2] = mix.b;
      }
    }
    for (let i = 0; i < this.tubular; i++) {
      for (let j = 0; j < this.radial; j++) {
        const a = i * perRing + j;
        indices.push(a, a + perRing, a + 1, a + 1, a + perRing, a + perRing + 1);
      }
    }

    // BufferAttribute keeps the array by reference (Float32BufferAttribute copies it), which
    // is what lets `update()` rewrite vertices in place without reallocating.
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    this.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.geometry.setIndex(indices);
  }

  setRestLength(length: number): void {
    this.restLength = Math.max(length, 1e-4);
  }

  /** Radius profile along the muscle, before the shortening bulge is applied. */
  private profile(t: number): number {
    const flesh = Math.pow(Math.sin(Math.PI * t), 0.42);
    return this.girth * (this.tendonRatio + (1 - this.tendonRatio) * flesh);
  }

  /** Rebuild the tube along a new world-space path. */
  update(points: Vector3[]): void {
    if (points.length < 2) return;

    let length = 0;
    for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
    this.currentLength = length;

    // Muscle volume is roughly constant, so shortening thickens the belly.
    const ratio = this.restLength / Math.max(length, 1e-4);
    const bulge = Math.min(Math.max(Math.sqrt(ratio), 0.72), 1.45);

    const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.35);
    const rings = this.tubular + 1;
    const perRing = this.radial + 1;

    const samples: Vector3[] = [];
    const tangents: Vector3[] = [];
    for (let i = 0; i < rings; i++) {
      const t = i / this.tubular;
      samples.push(curve.getPoint(t));
      tangents.push(curve.getTangent(t).normalize());
    }

    // Parallel transport avoids the twist that Frenet frames produce on straight runs.
    let normal = new Vector3(0, 0, 1);
    if (Math.abs(tangents[0].dot(normal)) > 0.9) normal.set(1, 0, 0);
    normal.crossVectors(tangents[0], normal).normalize();

    const axis = new Vector3();
    const binormal = new Vector3();
    const dir = new Vector3();

    for (let i = 0; i < rings; i++) {
      if (i > 0) {
        axis.crossVectors(tangents[i - 1], tangents[i]);
        const len = axis.length();
        if (len > 1e-6) {
          axis.divideScalar(len);
          const dot = Math.min(1, Math.max(-1, tangents[i - 1].dot(tangents[i])));
          normal.applyAxisAngle(axis, Math.acos(dot));
        }
      }
      normal.addScaledVector(tangents[i], -normal.dot(tangents[i])).normalize();
      binormal.crossVectors(tangents[i], normal).normalize();

      const t = i / this.tubular;
      const r = this.profile(t) * bulge;
      const p = samples[i];
      for (let j = 0; j < perRing; j++) {
        const a = (j / this.radial) * Math.PI * 2;
        dir.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
        const k = (i * perRing + j) * 3;
        this.positions[k] = p.x + dir.x * r;
        this.positions[k + 1] = p.y + dir.y * r;
        this.positions[k + 2] = p.z + dir.z * r;
        this.normals[k] = dir.x;
        this.normals[k + 1] = dir.y;
        this.normals[k + 2] = dir.z;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
