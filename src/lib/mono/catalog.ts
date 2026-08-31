import colorsData from '@/data/mono/colors.json';
import compositionsData from '@/data/mono/compositions.json';
import rhythmData from '@/data/mono/rhythm.json';
import typographyData from '@/data/mono/typography.json';
import imperfectionsData from '@/data/mono/imperfections.json';
import carriersData from '@/data/mono/carriers.json';

export type Substrate = {
  id: string;
  name: string;
  hex: string;
  role: string;
  counts_as_ink: boolean;
  use_for: string[];
};

export type Ink = { id: string; name: string; hex: string; moods: string[] };

export type Palette = { id: string; mode: string; ink_ids: string[] };

export type Composition = {
  id: string;
  layout: string;
  dominant_subject_percent: [number, number];
  empty_paper_percent: [number, number];
  anchors: string[];
  title_relation: string;
  manual_gesture_limit: number;
};

export type RhythmProfile = {
  id: string;
  name: string;
  empty_paper_percent: [number, number];
  focal_event_count: number;
  release_zone_count: number;
  unresolved_edge: string;
  default_for: string[];
  energy_distribution: string;
  subject_behavior: string[];
};

export type TypographyRole = {
  id: string;
  name: string;
  display: string;
  support: string;
  scale_ratio: string;
  behavior: string[];
  use_for: string[];
};

export type Imperfection = {
  id: string;
  name: string;
  applies_to: string[];
  [key: string]: unknown;
};

export type Carrier = {
  id: string;
  name: string;
  ratios: string[];
  required_signals: string[];
  forbidden_signals: string[];
};

export const colors = colorsData as {
  substrates: Substrate[];
  defaults: Record<string, unknown>;
  inks: Ink[];
  palettes: Palette[];
};

export const compositions = compositionsData as unknown as { compositions: Composition[] };
export const rhythm = rhythmData as unknown as {
  default_profile: string;
  focal_events: string[];
  release_devices: string[];
  optional_unresolved_edges: string[];
  profiles: RhythmProfile[];
  failure_signals: string[];
  guardrails: string[];
};
export const typography = typographyData as { roles: TypographyRole[] };
export const imperfections = imperfectionsData as {
  selection: Record<string, unknown>;
  effects: Imperfection[];
  guardrails: string[];
};
export const carriers = carriersData as { carriers: Carrier[] };

export function findInk(id: string): Ink | undefined {
  return colors.inks.find((i) => i.id === id);
}

export function findPalette(id: string): Palette | undefined {
  return colors.palettes.find((p) => p.id === id);
}

export function findSubstrate(id: string): Substrate | undefined {
  return colors.substrates.find((s) => s.id === id);
}

export function findComposition(id: string): Composition | undefined {
  return compositions.compositions.find((c) => c.id === id);
}

export function findTension(id: string): RhythmProfile | undefined {
  return rhythm.profiles.find((p) => p.id === id);
}

export function findTypeRole(id: string): TypographyRole | undefined {
  return typography.roles.find((r) => r.id === id);
}

export function findCarrier(id: string): Carrier | undefined {
  return carriers.carriers.find((c) => c.id === id);
}

export function paletteLabel(palette: Palette): string {
  const inkNames = palette.ink_ids.map((id) => findInk(id)?.name ?? id).join(' + ');
  return `${inkNames} — ${palette.mode}`;
}

/** Deterministic string hash (djb2), used to seed reproducible imperfection choices. */
export function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Deterministically select `count` imperfection effects from a stable seed string. */
export function pickImperfections(seed: string, count: number): Imperfection[] {
  const pool = imperfections.effects;
  if (count <= 0) return [];
  const clamped = Math.min(count, pool.length);
  const seedNum = stableHash(seed);
  const indices = new Set<number>();
  let step = seedNum % pool.length || 1;
  let cursor = seedNum % pool.length;
  while (indices.size < clamped) {
    indices.add(cursor);
    cursor = (cursor + step) % pool.length;
    step = (step + 1) % pool.length || 1;
  }
  return Array.from(indices).map((i) => pool[i]);
}
