/**
 * Procedural bone geometry.
 *
 * The atlas ships no model files — every bone is built at runtime from the declarative
 * recipes in `BoneShape`. That keeps the app self-contained and means bone proportions
 * live in the same dataset as the reference text describing them.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Shape,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { BoneShape, Vec3 } from '../anatomy/types';

const v3 = (v: Vec3) => new Vector3(v[0], v[1], v[2]);

/**
 * Merge geometry parts safely. `mergeGeometries` refuses to mix indexed and non-indexed
 * inputs, and it needs identical attribute sets — extruded outlines and spheres differ on
 * both counts, so normalise to non-indexed position/normal/uv first.
 */
export function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  if (parts.length === 1) return parts[0];
  const normalised = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    if (g !== part) part.dispose();
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    return g;
  });
  return mergeGeometries(normalised, false) ?? normalised[0];
}

function translate(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geometry;
}

function scale(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  geometry.applyMatrix4(new Matrix4().makeScale(x, y, z));
  return geometry;
}

/**
 * Sweep a variable-radius tube along a curve using parallel transport, so the tube does
 * not spin where the curve is straight (which is what plain Frenet frames do).
 */
export function sweptTube(
  curve: CatmullRomCurve3,
  radiusAt: (t: number) => number,
  tubular = 24,
  radial = 10,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const tangents: Vector3[] = [];
  const points: Vector3[] = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    points.push(curve.getPoint(t));
    tangents.push(curve.getTangent(t).normalize());
  }

  // Parallel-transport an initial normal along the curve.
  let normal = new Vector3(0, 0, 1);
  if (Math.abs(tangents[0].dot(normal)) > 0.9) normal = new Vector3(1, 0, 0);
  normal.crossVectors(tangents[0], normal).normalize();

  const frames: { n: Vector3; b: Vector3 }[] = [];
  for (let i = 0; i <= tubular; i++) {
    if (i > 0) {
      const axis = new Vector3().crossVectors(tangents[i - 1], tangents[i]);
      const len = axis.length();
      if (len > 1e-6) {
        axis.divideScalar(len);
        const angle = Math.acos(Math.min(1, Math.max(-1, tangents[i - 1].dot(tangents[i]))));
        normal.applyAxisAngle(axis, angle);
      }
    }
    normal.sub(tangents[i].clone().multiplyScalar(normal.dot(tangents[i]))).normalize();
    frames.push({ n: normal.clone(), b: new Vector3().crossVectors(tangents[i], normal).normalize() });
  }

  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const r = Math.max(radiusAt(t), 1e-4);
    const { n, b } = frames[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const dir = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
      const p = points[i].clone().addScaledVector(dir, r);
      positions.push(p.x, p.y, p.z);
      normals.push(dir.x, dir.y, dir.z);
      uvs.push(t, j / radial);
    }
  }

  const ring = radial + 1;
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      indices.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Long bone: a shaft with flared ends, an optional bow and an optional rounded head. */
function longBone(s: Extract<BoneShape, { kind: 'long' }>): BufferGeometry {
  const from = v3(s.from);
  const to = v3(s.to);
  const mid = from.clone().lerp(to, 0.5);
  if (s.bow) {
    const axis = s.bowAxis ? v3(s.bowAxis).normalize() : new Vector3(0, 0, 1);
    mid.addScaledVector(axis, s.bow);
  }
  const curve = new CatmullRomCurve3([from, mid, to], false, 'catmullrom', 0.5);
  const prox = s.proximalRadius ?? s.shaftRadius * 1.5;
  const dist = s.distalRadius ?? s.shaftRadius * 1.5;
  // Epiphyses flare over the outer ~18% of the bone.
  const flare = (t: number) => Math.pow(Math.max(0, 1 - t / 0.18), 1.6);
  const geometries = [
    sweptTube(
      curve,
      (t) => s.shaftRadius + (prox - s.shaftRadius) * flare(t) + (dist - s.shaftRadius) * flare(1 - t),
      26,
      10,
    ),
  ];
  if (s.head) {
    const c = from.clone().add(v3(s.head.offset));
    geometries.push(translate(new SphereGeometry(s.head.radius, 16, 12), c.x, c.y, c.z));
  }
  return mergeParts(geometries);
}

/** A run of vertebrae: body, spinous process and transverse processes for each level. */
function spineSegment(s: Extract<BoneShape, { kind: 'spine' }>): BufferGeometry {
  const from = v3(s.from);
  const to = v3(s.to);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < s.count; i++) {
    const t = s.count === 1 ? 0.5 : i / (s.count - 1);
    const p = from.clone().lerp(to, t);
    // Sagittal curvature: maximal in the middle of the run.
    p.z += (s.curve ?? 0) * Math.sin(Math.PI * t);
    const r = s.bodyRadius * (1 - 0.12 * t);
    const height = (from.distanceTo(to) / s.count) * 0.62;
    parts.push(translate(scale(new SphereGeometry(r, 12, 10), 1, height / r, 0.85), p.x, p.y, p.z));
    // Spinous process, angled down and back.
    const sp = translate(
      new BoxGeometry(r * 0.42, height * 0.5, s.spinous),
      p.x,
      p.y - height * 0.25,
      p.z - s.spinous / 2 - r * 0.75,
    );
    parts.push(sp);
    for (const side of [-1, 1]) {
      parts.push(
        translate(
          new BoxGeometry(r * 0.95, height * 0.34, r * 0.42),
          p.x + side * r * 1.05,
          p.y,
          p.z - r * 0.5,
        ),
      );
    }
  }
  return mergeParts(parts);
}

/** Rib pairs sweeping from the vertebral column round to the sternum. */
function ribcage(s: Extract<BoneShape, { kind: 'ribcage' }>): BufferGeometry {
  const c = v3(s.center);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < s.pairs; i++) {
    const t = i / (s.pairs - 1);
    const y = c.y + s.height / 2 - t * s.height;
    // The cage is narrowest at the top, widest around the 8th rib, tapering below.
    const wide = 0.52 + 0.48 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95));
    const w = (s.width / 2) * wide;
    const d = (s.depth / 2) * wide;
    const floating = t > 0.82;
    const drop = s.height * 0.1 * t;
    for (const side of [-1, 1]) {
      const pts = [
        new Vector3(c.x + side * w * 0.18, y, c.z - d * 1.05),
        new Vector3(c.x + side * w * 0.75, y - drop * 0.3, c.z - d * 0.8),
        new Vector3(c.x + side * w, y - drop * 0.6, c.z),
        new Vector3(c.x + side * w * 0.78, y - drop * 0.9, c.z + d * 0.72),
      ];
      if (!floating) pts.push(new Vector3(c.x + side * w * 0.2, y - drop, c.z + d * 1.05));
      const curve = new CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
      parts.push(sweptTube(curve, () => 0.0055, 16, 6));
    }
  }
  return mergeParts(parts);
}

/**
 * Skull, built as a braincase plus a facial skeleton.
 *
 * The orbits and the nasal aperture are *gaps*, not carved cavities: additive geometry
 * cannot subtract, so the orbital rims (brow bar, lateral and infraorbital margins, nasal
 * bones) are modelled as ridges projecting ~2 cm forward of the braincase, and the space
 * they enclose falls back to the braincase surface behind. That recess plus self-shadowing
 * is what reads as an eye socket.
 *
 * Offsets are in metres from the braincase centre, scaled by `radius` so the whole skull
 * stays parametric.
 */
function skull(s: Extract<BoneShape, { kind: 'skull' }>): BufferGeometry {
  const c = v3(s.center);
  const k = s.radius / 0.079;
  const at = (x: number, y: number, z: number) =>
    new Vector3(c.x + x * k, c.y + y * k, c.z + z * k);
  const blob = (x: number, y: number, z: number, rx: number, ry: number, rz: number, detail = 16) => {
    const p = at(x, y, z);
    return translate(scale(new SphereGeometry(1, detail, Math.round(detail * 0.75)), rx * k, ry * k, rz * k), p.x, p.y, p.z);
  };
  const ridge = (points: [number, number, number][], radius: number, segments = 20) =>
    sweptTube(
      new CatmullRomCurve3(points.map(([x, y, z]) => at(x, y, z)), false, 'catmullrom', 0.4),
      () => radius * k,
      segments,
      8,
    );

  const parts: BufferGeometry[] = [
    // Braincase, forehead and occiput. A skull in profile is longer front-to-back than it
    // is tall, so the vault is an elongated ellipsoid rather than a sphere. It is also set
    // back at face level: the orbital rims in front of it create the depth of the sockets.
    blob(0, 0.006, -0.026, 0.067, 0.066, 0.076, 26),
    blob(0, 0.04, 0.008, 0.056, 0.036, 0.046, 20),
    blob(0, -0.018, -0.07, 0.044, 0.038, 0.024, 16),
    // Supraorbital margins: an arch over each orbit, dipping at the glabella between them.
    ridge(
      [
        [-0.062, 0.0, 0.03],
        [-0.04, 0.016, 0.054],
        [-0.016, 0.02, 0.068],
        [0, 0.012, 0.072],
        [0.016, 0.02, 0.068],
        [0.04, 0.016, 0.054],
        [0.062, 0.0, 0.03],
      ],
      0.007,
      32,
    ),
    // Nasal bones and the bridge of the nose. The piriform aperture is the gap below them,
    // closed at the bottom by the anterior nasal spine.
    ridge(
      [
        [0, 0.014, 0.068],
        [0, -0.008, 0.076],
        [0, -0.028, 0.078],
      ],
      0.006,
      12,
    ),
    ridge(
      [
        [-0.012, -0.07, 0.062],
        [0, -0.066, 0.072],
        [0.012, -0.07, 0.062],
      ],
      0.005,
      10,
    ),
    // Upper dental arch.
    ridge(
      [
        [-0.031, -0.084, 0.028],
        [-0.023, -0.088, 0.054],
        [0, -0.09, 0.066],
        [0.023, -0.088, 0.054],
        [0.031, -0.084, 0.028],
      ],
      0.0065,
      22,
    ),
    // External occipital protuberance and nuchal line — where trapezius and the deep neck
    // extensors take hold.
    ridge(
      [
        [-0.044, -0.022, -0.078],
        [0, -0.014, -0.09],
        [0.044, -0.022, -0.078],
      ],
      0.006,
      14,
    ),
  ];

  for (const side of [-1, 1]) {
    // Lateral orbital margin sweeping down from the brow to the cheek.
    parts.push(
      ridge(
        [
          [side * 0.062, 0.0, 0.03],
          [side * 0.06, -0.018, 0.046],
          [side * 0.05, -0.032, 0.056],
        ],
        0.0055,
        12,
      ),
    );
    // Infraorbital margin closing the bottom of the orbit.
    parts.push(
      ridge(
        [
          [side * 0.05, -0.032, 0.056],
          [side * 0.03, -0.038, 0.068],
          [side * 0.013, -0.03, 0.07],
        ],
        0.0055,
        12,
      ),
    );
    // Zygomatic arch running back to the ear — the origin of masseter.
    parts.push(
      ridge(
        [
          [side * 0.048, -0.03, 0.05],
          [side * 0.063, -0.032, 0.012],
          [side * 0.058, -0.024, -0.03],
        ],
        0.006,
        14,
      ),
    );
    // Maxilla. The pair is held apart at the midline, and that gap is the nasal aperture.
    parts.push(blob(side * 0.024, -0.058, 0.046, 0.02, 0.024, 0.015, 14));
    // Mastoid process, behind and below the ear.
    parts.push(blob(side * 0.05, -0.07, -0.04, 0.013, 0.021, 0.014, 12));
  }

  return mergeParts(parts);
}

/**
 * Mandible: a U-shaped body carrying the lower dental arch, with a ramus rising on each
 * side to the condyle (the temporomandibular joint) and the coronoid process in front of it.
 */
function mandible(s: Extract<BoneShape, { kind: 'mandible' }>): BufferGeometry {
  const c = v3(s.center);
  const sx = s.width / 0.098;
  const sy = s.height / 0.062;
  const sz = s.depth / 0.078;
  const at = (x: number, y: number, z: number) =>
    new Vector3(c.x + x * sx, c.y + y * sy, c.z + z * sz);
  const ridge = (points: [number, number, number][], radius: number, segments = 20) =>
    sweptTube(
      new CatmullRomCurve3(points.map(([x, y, z]) => at(x, y, z)), false, 'catmullrom', 0.4),
      () => radius,
      segments,
      8,
    );

  const parts: BufferGeometry[] = [
    // Lower border of the body, from angle to angle around the chin.
    ridge(
      [
        [-0.049, -0.014, -0.052],
        [-0.042, -0.02, 0.006],
        [0, -0.024, 0.032],
        [0.042, -0.02, 0.006],
        [0.049, -0.014, -0.052],
      ],
      0.009,
      30,
    ),
    // Lower dental arch, meeting the upper teeth.
    ridge(
      [
        [-0.032, 0.018, -0.02],
        [-0.024, 0.014, 0.018],
        [0, 0.012, 0.03],
        [0.024, 0.014, 0.018],
        [0.032, 0.018, -0.02],
      ],
      0.006,
      26,
    ),
    // Mental protuberance — the chin. Kept low and shallow so it reads as part of the body
    // of the mandible rather than a bead stuck on the front.
    translate(
      scale(new SphereGeometry(1, 14, 10), 0.016 * sx, 0.011 * sy, 0.007 * sz),
      at(0, -0.016, 0.026).x,
      at(0, -0.016, 0.026).y,
      at(0, -0.016, 0.026).z,
    ),
  ];

  for (const side of [-1, 1]) {
    // Ramus, from the angle up to the condyle.
    parts.push(
      ridge(
        [
          [side * 0.049, -0.014, -0.052],
          [side * 0.05, 0.014, -0.05],
          [side * 0.05, 0.044, -0.042],
        ],
        0.008,
        12,
      ),
    );
    // Condyle (the joint surface) and the coronoid process in front of it.
    const condyle = at(side * 0.05, 0.046, -0.042);
    parts.push(
      translate(scale(new SphereGeometry(1, 12, 10), 0.012, 0.008, 0.009), condyle.x, condyle.y, condyle.z),
    );
    parts.push(
      ridge(
        [
          [side * 0.05, 0.02, -0.048],
          [side * 0.045, 0.036, -0.026],
          [side * 0.04, 0.042, -0.01],
        ],
        0.005,
        10,
      ),
    );
  }

  return mergeParts(parts);
}

/** Flat plates (scapula, hip bone, sacrum) are extruded 2D outlines. */
function extrudePlate(points: [number, number][], thickness: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: thickness * 0.5,
    bevelThickness: thickness * 0.5,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

function scapula(s: Extract<BoneShape, { kind: 'scapula' }>): BufferGeometry {
  const c = v3(s.center);
  const w = s.width;
  const h = s.height;
  const m = s.mirror ? -1 : 1;
  // Outline in the frontal plane: medial border, superior angle, lateral border, inferior angle.
  const plate = extrudePlate(
    [
      [-w * 0.42 * m, h * 0.5],
      [w * 0.5 * m, h * 0.42],
      [w * 0.52 * m, h * 0.02],
      [w * 0.1 * m, -h * 0.42],
      [-w * 0.32 * m, -h * 0.12],
      [-w * 0.44 * m, h * 0.2],
    ],
    0.007,
  );
  translate(plate, c.x, c.y, c.z);
  const parts = [plate];
  // Spine of the scapula, running up and out to the acromion.
  const spine = new BoxGeometry(w * 0.9, 0.012, 0.016);
  spine.applyMatrix4(new Matrix4().makeRotationZ(m * 0.16));
  translate(spine, c.x + w * 0.06 * m, c.y + h * 0.24, c.z - 0.008);
  parts.push(spine);
  // Acromion and coracoid process.
  parts.push(translate(scale(new SphereGeometry(0.014, 10, 8), 1.5, 0.7, 1), c.x + w * 0.72 * m, c.y + h * 0.44, c.z - 0.002));
  parts.push(translate(scale(new SphereGeometry(0.011, 10, 8), 1.2, 0.8, 1.4), c.x + w * 0.2 * m, c.y + h * 0.28, c.z + 0.1));
  // Glenoid fossa.
  parts.push(translate(scale(new SphereGeometry(0.017, 12, 10), 0.6, 1.2, 1), c.x + w * 0.84 * m, c.y + h * 0.3, c.z + 0.055));
  return mergeParts(parts);
}

function hipbone(s: Extract<BoneShape, { kind: 'hipbone' }>): BufferGeometry {
  const c = v3(s.center);
  const h = s.height;
  const d = s.depth;
  const m = s.mirror ? -1 : 1;
  // Ilium blade, in the sagittal plane then rotated to flare outward.
  const blade = extrudePlate(
    [
      [-d * 0.46, h * 0.34],
      [d * 0.3, h * 0.5],
      [d * 0.52, h * 0.18],
      [d * 0.3, -h * 0.2],
      [-d * 0.12, -h * 0.3],
      [-d * 0.44, -h * 0.02],
    ],
    0.009,
  );
  blade.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
  blade.applyMatrix4(new Matrix4().makeRotationZ(m * -0.22));
  translate(blade, c.x, c.y + h * 0.12, c.z);
  const parts = [blade];
  // Acetabulum.
  parts.push(
    translate(scale(new SphereGeometry(0.028, 14, 12), 0.7, 1, 1), c.x + m * 0.014, c.y - h * 0.22, c.z - 0.004),
  );
  // Ischiopubic ring: pubic ramus forward, ischial ramus down and back.
  const ring = new CatmullRomCurve3(
    [
      new Vector3(c.x + m * 0.006, c.y - h * 0.24, c.z + 0.008),
      new Vector3(c.x - m * 0.03, c.y - h * 0.3, c.z + 0.06),
      new Vector3(c.x - m * 0.05, c.y - h * 0.42, c.z + 0.072),
      new Vector3(c.x - m * 0.012, c.y - h * 0.56, c.z + 0.01),
      new Vector3(c.x + m * 0.012, c.y - h * 0.48, c.z - 0.05),
      new Vector3(c.x + m * 0.012, c.y - h * 0.3, c.z - 0.05),
    ],
    true,
    'catmullrom',
    0.4,
  );
  parts.push(sweptTube(ring, (t) => 0.008 + 0.004 * Math.sin(Math.PI * t), 30, 8));
  return mergeParts(parts);
}

function sacrum(s: Extract<BoneShape, { kind: 'sacrum' }>): BufferGeometry {
  const c = v3(s.center);
  const plate = extrudePlate(
    [
      [-s.width * 0.5, s.height * 0.5],
      [s.width * 0.5, s.height * 0.5],
      [s.width * 0.26, -s.height * 0.36],
      [0, -s.height * 0.5],
      [-s.width * 0.26, -s.height * 0.36],
    ],
    0.018,
  );
  return translate(plate, c.x, c.y, c.z);
}

function cluster(s: Extract<BoneShape, { kind: 'cluster' }>): BufferGeometry {
  const c = v3(s.center);
  const parts: BufferGeometry[] = [];
  // Deterministic pseudo-random placement so the shape is stable between reloads.
  let seed = s.seed ?? 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < s.count; i++) {
    const r = s.radius * (0.72 + rand() * 0.5);
    parts.push(
      translate(
        scale(new SphereGeometry(r, 8, 6), 1, 0.8, 1.1),
        c.x + (rand() - 0.5) * s.extent[0],
        c.y + (rand() - 0.5) * s.extent[1],
        c.z + (rand() - 0.5) * s.extent[2],
      ),
    );
  }
  return mergeParts(parts);
}

function digits(s: Extract<BoneShape, { kind: 'digits' }>): BufferGeometry {
  const base = v3(s.base);
  const dir = v3(s.direction).normalize();
  const spread = v3(s.spread);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < s.rays; i++) {
    const f = s.rays === 1 ? 0 : i / (s.rays - 1) - 0.5;
    const start = base.clone().addScaledVector(spread, f);
    // The middle rays are longest.
    const len = s.length * (1 - 0.22 * Math.abs(f) * 2);
    const end = start.clone().addScaledVector(dir, len);
    const curve = new CatmullRomCurve3([start, start.clone().lerp(end, 0.5), end], false, 'catmullrom', 0.5);
    parts.push(sweptTube(curve, (t) => s.radius * (1.25 - 0.6 * t) * (1 + 0.25 * Math.cos(t * Math.PI * 4)), 14, 7));
  }
  return mergeParts(parts);
}

function footArch(s: Extract<BoneShape, { kind: 'footArch' }>): BufferGeometry {
  const c = v3(s.center);
  const parts = [
    // Calcaneus.
    translate(
      scale(new SphereGeometry(s.height * 0.5, 14, 10), 0.85, 0.78, 1.5),
      c.x,
      c.y - s.height * 0.12,
      c.z - s.length * 0.3,
    ),
    // Talus, sitting on top of the calcaneus.
    translate(
      scale(new SphereGeometry(s.height * 0.4, 14, 10), 0.95, 0.85, 1.15),
      c.x,
      c.y + s.height * 0.3,
      c.z - s.length * 0.06,
    ),
    // Navicular, cuboid and cuneiforms as a wedge.
    translate(
      scale(new SphereGeometry(s.height * 0.34, 12, 10), s.width / (s.height * 0.6), 0.7, 0.85),
      c.x,
      c.y + s.height * 0.02,
      c.z + s.length * 0.22,
    ),
  ];
  return mergeParts(parts);
}

/** Build the geometry for any bone shape recipe. */
export function buildBoneGeometry(shape: BoneShape): BufferGeometry {
  switch (shape.kind) {
    case 'long':
      return longBone(shape);
    case 'spine':
      return spineSegment(shape);
    case 'ribcage':
      return ribcage(shape);
    case 'skull':
      return skull(shape);
    case 'mandible':
      return mandible(shape);
    case 'scapula':
      return scapula(shape);
    case 'hipbone':
      return hipbone(shape);
    case 'sacrum':
      return sacrum(shape);
    case 'plate': {
      const c = v3(shape.center);
      return translate(
        new BoxGeometry(shape.size[0], shape.size[1], shape.size[2], 2, 2, 2),
        c.x,
        c.y,
        c.z,
      );
    }
    case 'blob': {
      const c = v3(shape.center);
      const g = scale(new SphereGeometry(1, 16, 12), shape.radii[0], shape.radii[1], shape.radii[2]);
      return translate(g, c.x, c.y, c.z);
    }
    case 'cluster':
      return cluster(shape);
    case 'digits':
      return digits(shape);
    case 'footArch':
      return footArch(shape);
  }
}
