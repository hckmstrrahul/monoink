import {
  findComposition,
  findInk,
  findPalette,
  findSubstrate,
  findTension,
  findTypeRole,
  pickImperfections,
} from './catalog';

export type Representation = 'faithful reproduction' | 'abstract symbol extraction';

export type MonoManifest = {
  subject: string;
  intent: string;
  exactText: string;
  representation: Representation;
  ratio: string;
  substrateId: string;
  paletteId: string;
  layoutId: string;
  tensionId: string;
  typeRoleId: string;
  emptyPaperPercent: number;
  disruption: string;
  unresolvedEdge: string;
  imageTreatment: string;
  imperfectionCount: number;
  hasSourceImage: boolean;
};

export type CompiledRecipe = {
  prompt: string;
  mode: string;
  inkSummary: string;
  layoutName: string;
  typeSummary: string;
  process: string;
  originality: string;
  manifestResolved: Record<string, unknown>;
};

function plateRoles(mode: string): string {
  switch (mode) {
    case 'pure one-ink':
      return 'the single ink carries image, typography, and rules through density changes alone';
    case 'chromatic + black':
      return 'the chromatic plate carries the photograph or dominant graphic; the dark plate carries long text and precision labels';
    case 'overprint duotone':
      return 'the two plates overlap in selected zones; the darker mixed appearance in overlap is a physical consequence of two inks, not a third color';
    default:
      return 'the dominant plate occupies 70%-85% of the printed area and the accent plate occupies 15%-30%, assigned to one specific role such as dates, annotations, or one selected object';
  }
}

export function compileManifest(m: MonoManifest): CompiledRecipe {
  const substrate = findSubstrate(m.substrateId);
  const palette = findPalette(m.paletteId);
  const layout = findComposition(m.layoutId);
  const tension = findTension(m.tensionId);
  const typeRole = findTypeRole(m.typeRoleId);
  const inks = (palette?.ink_ids ?? []).map((id) => findInk(id)).filter(Boolean) as NonNullable<
    ReturnType<typeof findInk>
  >[];
  const mode = palette?.mode ?? 'complementary duotone';

  const seed = [m.subject, m.exactText, m.paletteId, m.layoutId].join('|');
  const imperfectionEffects = pickImperfections(seed, m.imperfectionCount);

  const inkClause =
    inks.length === 1
      ? `one printing ink, ${inks[0].name} ${inks[0].hex}`
      : `two printing inks, ${inks.map((i) => `${i.name} ${i.hex}`).join(' and ')}`;

  const substrateClause = substrate
    ? `${substrate.name} substrate (${substrate.hex}), chosen for ${substrate.use_for.slice(0, 2).join(' and ')} work`
    : 'a neutral substrate';

  // 1. Canvas and ink
  const p1 =
    `A flat, front-facing ${m.ratio} printed page on ${substrateClause}, with no mockup, frame, desk, or cast shadow. ` +
    `Printed with ${inkClause} in ${mode} mode: ${plateRoles(mode)}. ` +
    `The paper stays visibly exposed rather than tinted into a full digital wash.`;

  // 2. Original composition
  const p2 =
    `Layout family: ${layout?.layout ?? 'editorial cover'}, with ${layout?.title_relation ?? 'the headline crossing the dominant image'}. ` +
    `Visual tension is ${tension?.name.toLowerCase() ?? 'balanced'} — ${tension?.energy_distribution ?? 'one clear event, structured support'} — built around exactly one focal event with one visibly quieter release zone elsewhere on the page. ` +
    `Keep ${m.emptyPaperPercent}% of the canvas as visibly empty paper, with generous 5%-9% outer margins and elements aligned to one invisible left edge or a simple 2-3 column editorial grid. ` +
    `Dominant subject scale ${layout?.dominant_subject_percent?.join('-') ?? '55-75'}%, decisively cropped at one or more edges. ` +
    `Include one deliberate disruption: ${m.disruption}.` +
    (m.unresolvedEdge !== 'none' ? ` Use one unresolved edge: ${m.unresolvedEdge}, only where it strengthens the focal event or release zone.` : '');

  // 3. Subject
  const sourceClause = m.hasSourceImage
    ? 'Use the attached reference image as the subject — preserve its identity and core factual content; do not replace it with a different subject or invent unrelated branded details. '
    : '';
  const p3 =
    m.representation === 'faithful reproduction'
      ? `${sourceClause}Subject: ${m.subject}, reproduced faithfully — preserve its identity, crop and enlarge decisively, convert to ${m.imageTreatment}, with clipped highlights where paper shows through and dense shadows where ink pools.`
      : `${sourceClause}Subject: ${m.subject}, treated as abstract symbol extraction — name 2-4 identifying anchors from the subject, convert them into one dominant mass, one structural contour, and one repeated rhythm using flat plate shapes or broken hand-drawn lines; let exposed paper replace at least 35% of the source scene and crop one anchor at a page edge.`;

  // 4. Typography and words
  const p4 =
    `Typography: ${typeRole?.name ?? 'Editorial'} voice (${typeRole?.display ?? 'strong serif or grotesk'}) as the primary display skeleton, paired with ${typeRole?.support ?? 'a small neutral grotesk or mono'} for supporting text, using a ${typeRole?.scale_ratio ?? '6:1 to 12:1'} scale jump. ` +
    `Exact display text: "${m.exactText}". ${layout?.title_relation ?? 'The headline crosses the dominant object'} — keep enough contrast for the words to stay readable. Intent/tone: ${m.intent}.`;

  // 5. Material and avoids
  const impLine =
    imperfectionEffects.length > 0
      ? `Controlled print imperfections: ${imperfectionEffects.map((e) => e.name.toLowerCase()).join(', ')}, applied only to image plates, large display type, or solid shapes — never to microcopy or factual text.`
      : 'Clean, contemporary reproduction with no added print imperfections.';
  const p5 =
    `${impLine} Visible dots at close range with a recognizable subject at thumbnail scale; medium contrast; avoid glossy photographic depth. ` +
    `Hard avoids: more than ${inks.length === 1 ? 'one printing ink' : 'two printing inks'}, gradients, rainbow accents, neon, full-color photography, clean vector-flat digital poster aesthetics, glossy mockups, 3D depth, cinematic lighting, hard shadows, centered template symmetry, card grids, UI panels, stickers, scrapbook collage, automatic vintage/sepia/yellowed-paper styling unless explicitly requested, marketing copy, CTA buttons, logos, URLs, QR codes, or exact imitation of any reference poster, artist signature, or brand.`;

  const prompt = [p1, p2, p3, p4, p5].join('\n\n');

  return {
    prompt,
    mode,
    inkSummary: inks.map((i) => `${i.name} (${i.hex})`).join(' + '),
    layoutName: layout?.layout ?? 'editorial cover',
    typeSummary: `${typeRole?.name ?? 'Editorial'} + support`,
    process: m.imageTreatment,
    originality: 'Subject, layout family, headline wording, and disruption device are set independently from any reference each time the manifest changes.',
    manifestResolved: {
      subject: m.subject,
      has_source_image: m.hasSourceImage,
      intent: m.intent,
      exact_text: m.exactText,
      text_language: 'English',
      representation: m.representation,
      ratio: m.ratio,
      substrate: substrate ? { id: substrate.id, name: substrate.name, hex: substrate.hex } : null,
      mode,
      palette: palette ? { id: palette.id, inks: inks.map((i) => ({ id: i.id, name: i.name, hex: i.hex })) } : null,
      layout: layout ? { id: layout.id, name: layout.layout } : null,
      empty_paper_percent: m.emptyPaperPercent,
      visual_tension: tension ? { id: tension.id, name: tension.name } : null,
      unresolved_edge: m.unresolvedEdge,
      image_treatment: m.imageTreatment,
      type_hierarchy: typeRole ? { id: typeRole.id, name: typeRole.name } : null,
      disruption: m.disruption,
      imperfection_seed: seed,
      imperfections: imperfectionEffects.map((e) => e.id),
    },
  };
}
