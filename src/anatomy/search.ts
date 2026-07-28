/**
 * Search over the whole atlas.
 *
 * Beyond structures by name, the index also understands three things people actually ask
 * for: a *motion* ("elbow flexion" — show me everything that produces it), an *exercise*
 * ("bench press" — show me what it works), and a *group* ("hamstrings", "rotator cuff").
 * Each result carries the structure references to highlight in the 3D view.
 */

import { BONES, JOINTS, MUSCLES, NERVES } from './index';
import type { MotionName, StructureRef } from './types';

export type SearchResultKind =
  | 'muscle'
  | 'bone'
  | 'joint'
  | 'nerve'
  | 'motion'
  | 'exercise'
  | 'group'
  | 'region';

export interface SearchResult {
  key: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  detail?: string;
  refs: StructureRef[];
  /** Present when the result is a single structure, so the panel can open its details. */
  primary?: StructureRef;
  score: number;
}

interface IndexEntry {
  key: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  detail?: string;
  refs: StructureRef[];
  primary?: StructureRef;
  /** Lower-cased haystacks, most specific first. */
  terms: string[];
  /** Boost applied to structure results so they outrank derived ones on equal matches. */
  weight: number;
}

/** "Hip joint" + left -> "Left hip joint". */
const sidedName = (side: string, name: string) =>
  side === 'center' ? name : `${side === 'left' ? 'Left' : 'Right'} ${name.charAt(0).toLowerCase()}${name.slice(1)}`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Common lay terms mapped onto the anatomical vocabulary. */
const SYNONYMS: Record<string, string> = {
  abs: 'rectus abdominis abdominal',
  'six pack': 'rectus abdominis',
  lats: 'latissimus dorsi',
  pecs: 'pectoralis major chest',
  traps: 'trapezius',
  delts: 'deltoid shoulder',
  glutes: 'gluteus maximus medius minimus buttock',
  quads: 'quadriceps femoris vastus rectus femoris',
  hams: 'hamstrings biceps femoris semitendinosus semimembranosus',
  calves: 'gastrocnemius soleus triceps surae calf',
  'hip flexors': 'iliopsoas psoas iliacus rectus femoris',
  'rotator cuff': 'supraspinatus infraspinatus teres minor subscapularis',
  'core': 'transversus abdominis multifidus oblique rectus abdominis diaphragm pelvic floor',
  'funny bone': 'ulnar nerve medial epicondyle',
  'shin': 'tibia tibialis anterior',
  'achilles': 'calcaneal tendon gastrocnemius soleus',
  'kneecap': 'patella',
  'collarbone': 'clavicle',
  'shoulder blade': 'scapula',
  'tailbone': 'coccyx',
  'jaw': 'mandible masseter temporalis temporomandibular',
  'hip bone': 'os coxae ilium ischium pubis',
  'thigh bone': 'femur',
  'wing bone': 'scapula',
  'groin': 'adductor longus brevis magnus pectineus gracilis',
};

function expandSynonyms(query: string): string {
  let out = query;
  for (const [term, expansion] of Object.entries(SYNONYMS)) {
    if (query.includes(term)) out += ` ${expansion}`;
  }
  return out;
}

const INDEX: IndexEntry[] = (() => {
  const entries: IndexEntry[] = [];

  for (const m of MUSCLES) {
    const actions = m.actions.map((a) => `${a.motion} ${a.joint.replace(/^[lr]_/, '')}`).join(' ');
    entries.push({
      key: `muscle:${m.id}`,
      kind: 'muscle',
      title: sidedName(m.side, m.name),
      subtitle: `${m.group} · ${m.region}`,
      detail: m.latin,
      refs: [{ kind: 'muscle', id: m.id }],
      primary: { kind: 'muscle', id: m.id },
      terms: [
        norm(m.name),
        norm(m.latin),
        norm(m.group),
        norm(`${m.region} ${m.innervation} ${actions} ${m.originDesc} ${m.insertionDesc}`),
      ],
      weight: 1,
    });
  }

  for (const b of BONES) {
    entries.push({
      key: `bone:${b.id}`,
      kind: 'bone',
      title: sidedName(b.side, b.name),
      subtitle: `${b.region} · ${b.boneClass} bone`,
      detail: b.latin,
      refs: [{ kind: 'bone', id: b.id }],
      primary: { kind: 'bone', id: b.id },
      terms: [norm(b.name), norm(b.latin), norm(b.landmarks.join(' ')), norm(b.region)],
      weight: 1,
    });
  }

  for (const j of JOINTS) {
    entries.push({
      key: `joint:${j.id}`,
      kind: 'joint',
      title: sidedName(j.side, j.name),
      subtitle: `${j.jointClass} joint`,
      detail: j.latin,
      refs: [{ kind: 'joint', id: j.id }],
      primary: { kind: 'joint', id: j.id },
      terms: [norm(j.name), norm(j.latin ?? ''), norm(j.movements.join(' ')), norm(j.ligaments.join(' '))],
      weight: 1,
    });
  }

  for (const n of NERVES) {
    entries.push({
      key: `nerve:${n.id}`,
      kind: 'nerve',
      title: sidedName(n.side, n.name),
      subtitle: `${n.roots} · ${n.kind}`,
      detail: n.latin,
      refs: [{ kind: 'nerve', id: n.id }, ...n.muscles.map((id) => ({ kind: 'muscle' as const, id }))],
      primary: { kind: 'nerve', id: n.id },
      terms: [norm(n.name), norm(n.latin ?? ''), norm(n.roots), norm(n.motorSupply.join(' ')), norm(n.sensorySupply)],
      weight: 1,
    });
  }

  // --- derived: every joint motion, with the muscles that produce it
  const motions = new Map<string, { joint: string; jointName: string; motion: MotionName; ids: string[] }>();
  for (const m of MUSCLES) {
    for (const a of m.actions) {
      if (a.role === 'stabilise') continue;
      const joint = JOINTS.find((j) => j.id === a.joint);
      if (!joint) continue;
      const key = `${a.joint}|${a.motion}`;
      const existing = motions.get(key) ?? {
        joint: a.joint,
        jointName: sidedName(joint.side, joint.name),
        motion: a.motion,
        ids: [],
      };
      existing.ids.push(m.id);
      motions.set(key, existing);
    }
  }
  for (const [key, entry] of motions) {
    const shortJoint = entry.jointName.replace(/\s*\(.*\)\s*/, '').replace(/ joint$/i, '');
    entries.push({
      key: `motion:${key}`,
      kind: 'motion',
      title: `${shortJoint} — ${entry.motion}`,
      subtitle: `${entry.ids.length} muscle${entry.ids.length === 1 ? '' : 's'} produce this motion`,
      refs: entry.ids.map((id) => ({ kind: 'muscle' as const, id })),
      terms: [norm(`${shortJoint} ${entry.motion}`), norm(entry.motion), norm(shortJoint)],
      weight: 0.92,
    });
  }

  // --- derived: exercises, with everything that lists them
  const exercises = new Map<string, { name: string; kind: string; ids: string[]; cue: string }>();
  for (const m of MUSCLES) {
    for (const ex of m.exercises) {
      const key = norm(ex.name);
      const existing = exercises.get(key) ?? { name: ex.name, kind: ex.kind, ids: [], cue: ex.cue };
      existing.ids.push(m.id);
      exercises.set(key, existing);
    }
  }
  for (const [key, ex] of exercises) {
    entries.push({
      key: `exercise:${key}`,
      kind: 'exercise',
      title: ex.name,
      subtitle: `${ex.kind} · works ${ex.ids.length} muscle${ex.ids.length === 1 ? '' : 's'} in the atlas`,
      detail: ex.cue,
      refs: ex.ids.map((id) => ({ kind: 'muscle' as const, id })),
      terms: [norm(ex.name), norm(ex.cue)],
      weight: 0.9,
    });
  }

  // --- derived: functional groups and regions
  const groups = new Map<string, string[]>();
  const regions = new Map<string, string[]>();
  for (const m of MUSCLES) {
    (groups.get(m.group) ?? (groups.set(m.group, []), groups.get(m.group)!)).push(m.id);
    (regions.get(m.region) ?? (regions.set(m.region, []), regions.get(m.region)!)).push(m.id);
  }
  for (const [group, ids] of groups) {
    entries.push({
      key: `group:${norm(group)}`,
      kind: 'group',
      title: group,
      subtitle: `${ids.length} muscles`,
      refs: ids.map((id) => ({ kind: 'muscle' as const, id })),
      terms: [norm(group)],
      weight: 0.95,
    });
  }
  for (const [region, ids] of regions) {
    entries.push({
      key: `region:${region}`,
      kind: 'region',
      title: `${region.charAt(0).toUpperCase()}${region.slice(1)} muscles`,
      subtitle: `${ids.length} muscles in this region`,
      refs: ids.map((id) => ({ kind: 'muscle' as const, id })),
      terms: [norm(region)],
      weight: 0.85,
    });
  }

  return entries;
})();

function scoreEntry(entry: IndexEntry, tokens: string[], raw: string): number {
  let total = 0;
  for (let level = 0; level < entry.terms.length; level++) {
    const haystack = entry.terms[level];
    if (!haystack) continue;
    // Later term levels are less specific and score lower.
    const levelWeight = [1, 0.72, 0.6, 0.42][Math.min(level, 3)];

    if (haystack === raw) total += 120 * levelWeight;
    else if (haystack.startsWith(raw)) total += 80 * levelWeight;
    else if (haystack.includes(raw)) total += 55 * levelWeight;

    for (const token of tokens) {
      if (token.length < 2) continue;
      const wordStart = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      if (wordStart.test(haystack)) total += 16 * levelWeight;
      else if (haystack.includes(token)) total += 8 * levelWeight;
    }
  }
  return total * entry.weight;
}

export function search(query: string, limit = 40): SearchResult[] {
  const raw = norm(query);
  if (raw.length < 2) return [];
  const expanded = norm(expandSynonyms(raw));
  const tokens = [...new Set(expanded.split(' '))].filter(Boolean);

  const results: SearchResult[] = [];
  for (const entry of INDEX) {
    const score = scoreEntry(entry, tokens, raw);
    if (score <= 0) continue;
    results.push({
      key: entry.key,
      kind: entry.kind,
      title: entry.title,
      subtitle: entry.subtitle,
      detail: entry.detail,
      refs: entry.refs,
      primary: entry.primary,
      score,
    });
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.slice(0, limit);
}

/** A handful of suggestions for the empty state. */
export const SEARCH_EXAMPLES = [
  'gluteus medius',
  'rotator cuff',
  'elbow flexion',
  'sciatic nerve',
  'Romanian deadlift',
  'scaphoid',
  'hip abduction',
  'ulnar nerve',
];
