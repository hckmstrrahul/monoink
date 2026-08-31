'use client';

import { useMemo, useState } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import {
  carriers,
  colors,
  compositions,
  paletteLabel,
  rhythm,
  typography,
} from '@/lib/mono/catalog';
import { compileManifest, type MonoManifest } from '@/lib/mono/promptCompiler';
import { useApiSettings } from '@/lib/useApiSettings';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const RATIO_OPTIONS = ['3:4', '2:3', '1:1', '4:5', '4:3', '3:2'].map((r) => ({
  value: r,
  label: r,
}));

const INTENT_OPTIONS = [
  'poetic observation',
  'announcement',
  'field note',
  'personal statement',
  'cultural poster',
  'specimen page',
].map((v) => ({ value: v, label: v }));

const REPRESENTATION_OPTIONS = [
  { value: 'faithful reproduction', label: 'Faithful reproduction' },
  { value: 'abstract symbol extraction', label: 'Abstract symbol extraction' },
];

const IMAGE_TREATMENT_OPTIONS = [
  'clean plate separation',
  'medium screening',
  'coarse halftone',
  'risograph grain',
  'cyanotype-like exposure',
  'photocopy breakup',
  'newspaper screening',
].map((v) => ({ value: v, label: v }));

const substrateOptions = colors.substrates.map((s) => ({ value: s.id, label: `${s.name} (${s.hex})` }));
const paletteOptions = colors.palettes.map((p) => ({ value: p.id, label: paletteLabel(p) }));
const layoutOptions = compositions.compositions.map((c) => ({ value: c.id, label: c.layout }));
const tensionOptions = rhythm.profiles.map((t) => ({ value: t.id, label: t.name }));
const typeRoleOptions = typography.roles.map((r) => ({ value: r.id, label: r.name }));
const unresolvedEdgeOptions = [
  { value: 'none', label: 'None' },
  ...rhythm.optional_unresolved_edges.map((e) => ({ value: e, label: e })),
];
const carrierOptions = [
  { value: 'none', label: 'None' },
  ...carriers.carriers.map((c) => ({ value: c.id, label: c.name })),
];

export function MonoStudio() {
  const dial = useDialKit(
    'Mono Manifest',
    {
      subject: { type: 'text', default: 'a quiet morning by the water', placeholder: 'one recognizable subject' },
      words: {
        intent: { type: 'select', options: INTENT_OPTIONS, default: 'poetic observation' },
        exactText: { type: 'text', default: 'still, before the tide turns', placeholder: '2-8 word display phrase' },
        representation: { type: 'select', options: REPRESENTATION_OPTIONS, default: 'faithful reproduction' },
      },
      canvas: {
        ratio: { type: 'select', options: RATIO_OPTIONS, default: '3:4' },
        carrier: { type: 'select', options: carrierOptions, default: 'none' },
        substrate: { type: 'select', options: substrateOptions, default: 'substrate_neutral_white' },
        palette: { type: 'select', options: paletteOptions, default: 'palette_cobalt_terracotta' },
      },
      composition: {
        layout: { type: 'select', options: layoutOptions, default: 'composition_editorial_cover' },
        visualTension: { type: 'select', options: tensionOptions, default: rhythm.default_profile },
        emptyPaper: [35, 20, 55, 1],
        disruption: { type: 'text', default: 'one off-center image crop' },
        unresolvedEdge: { type: 'select', options: unresolvedEdgeOptions, default: 'none' },
      },
      typography: {
        typeHierarchy: { type: 'select', options: typeRoleOptions, default: 'type_literary' },
      },
      reproduction: {
        imageTreatment: { type: 'select', options: IMAGE_TREATMENT_OPTIONS, default: 'clean plate separation' },
        imperfectionCount: [1, 0, 3, 1],
      },
    },
    { id: 'mono-manifest', persist: true }
  );

  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceImageError, setSourceImageError] = useState<string | null>(null);

  const manifest: MonoManifest = useMemo(
    () => ({
      subject: dial.subject,
      intent: dial.words.intent,
      exactText: dial.words.exactText,
      representation: dial.words.representation as MonoManifest['representation'],
      ratio: dial.canvas.ratio,
      substrateId: dial.canvas.substrate,
      paletteId: dial.canvas.palette,
      layoutId: dial.composition.layout,
      tensionId: dial.composition.visualTension,
      typeRoleId: dial.typography.typeHierarchy,
      emptyPaperPercent: dial.composition.emptyPaper,
      disruption: dial.composition.disruption,
      unresolvedEdge: dial.composition.unresolvedEdge,
      imageTreatment: dial.reproduction.imageTreatment,
      imperfectionCount: dial.reproduction.imperfectionCount,
      hasSourceImage: sourceImage !== null,
    }),
    [dial, sourceImage]
  );

  const recipe = useMemo(() => compileManifest(manifest), [manifest]);

  const { settings, setSettings, hydrated } = useApiSettings();
  const [view, setView] = useState<'prompt' | 'json'>('prompt');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ratioW, ratioH] = manifest.ratio.split(':').map(Number);

  const activeKey = settings.provider === 'gemini' ? settings.geminiKey : settings.openaiKey;
  const canGenerate = hydrated && activeKey.trim().length > 0 && !isGenerating;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSourceImageError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setSourceImageError('Image is too large — please choose one under 8MB.');
      return;
    }
    setSourceImageError(null);
    const reader = new FileReader();
    reader.onload = () => setSourceImage(reader.result as string);
    reader.onerror = () => setSourceImageError('Could not read that image.');
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: recipe.prompt,
          provider: settings.provider,
          apiKey: activeKey,
          model: settings.provider === 'gemini' ? settings.geminiModel : settings.openaiModel,
          ratio: manifest.ratio,
          ...(sourceImage ? { sourceImage } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation failed.');
      setImage(data.image);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="flex min-h-screen bg-[#FAFAF7] text-[#242321]">
      <main className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-baseline justify-between border-b border-black/10 px-6 py-6 md:px-12">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Monoink</h1>
            <p className="mt-1 text-sm text-black/60">
              Dial in a mono-color editorial manifest on the right. Every change updates the prompt in real time.
            </p>
            <p className="mt-2 text-xs text-black/40">
              Built on{' '}
              <a
                href="https://github.com/yanliudesign/mono-color-skill"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-black/70"
              >
                mono-color-skill
              </a>{' '}
              and{' '}
              <a
                href="https://github.com/joshpuckett/dialkit"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-black/70"
              >
                DialKit
              </a>
              . Built by{' '}
              <a
                href="https://github.com/hckmstrrahul/monoink"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-black/70"
              >
                hckmstrrahul
              </a>{' '}
              on Aug 2026.
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            API keys
          </button>
        </header>

        {settingsOpen && (
          <div className="border-b border-black/10 bg-white p-5 shadow-sm md:px-12">
            <div className="mb-4 flex gap-2">
              {(['gemini', 'openai'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSettings((s) => ({ ...s, provider: p }))}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                    settings.provider === p ? 'bg-[#2148B8] text-white' : 'bg-black/5 text-black/70'
                  }`}
                >
                  {p === 'gemini' ? 'Gemini' : 'ChatGPT (OpenAI)'}
                </button>
              ))}
            </div>

            {settings.provider === 'gemini' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-black/60">Gemini API key</span>
                  <input
                    type="password"
                    value={settings.geminiKey}
                    onChange={(e) => setSettings((s) => ({ ...s, geminiKey: e.target.value }))}
                    placeholder="AIza…"
                    className="w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-black/60">Model</span>
                  <input
                    type="text"
                    value={settings.geminiModel}
                    onChange={(e) => setSettings((s) => ({ ...s, geminiModel: e.target.value }))}
                    className="w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-black/60">OpenAI API key</span>
                  <input
                    type="password"
                    value={settings.openaiKey}
                    onChange={(e) => setSettings((s) => ({ ...s, openaiKey: e.target.value }))}
                    placeholder="sk-…"
                    className="w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-black/60">Model</span>
                  <input
                    type="text"
                    value={settings.openaiModel}
                    onChange={(e) => setSettings((s) => ({ ...s, openaiModel: e.target.value }))}
                    className="w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs"
                  />
                </label>
              </div>
            )}
            <p className="mt-3 text-xs text-black/50">
              Keys are stored only in this browser (localStorage) and sent directly to this app&apos;s own
              /api/generate route at generation time — never logged, never persisted server-side.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-black/10 px-6 py-3 md:px-12">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setView('prompt');
                setDetailsOpen(true);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                detailsOpen && view === 'prompt' ? 'bg-black text-white' : 'bg-black/5 text-black/70'
              }`}
            >
              Prompt
            </button>
            <button
              onClick={() => {
                setView('json');
                setDetailsOpen(true);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                detailsOpen && view === 'json' ? 'bg-black text-white' : 'bg-black/5 text-black/70'
              }`}
            >
              Manifest JSON
            </button>
          </div>
          <button
            onClick={() => setDetailsOpen((v) => !v)}
            className="rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/5"
          >
            {detailsOpen ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={() => copy(view === 'prompt' ? recipe.prompt : JSON.stringify(recipe.manifestResolved, null, 2))}
            className="ml-auto rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/5"
          >
            Copy
          </button>
        </div>

        {detailsOpen && (
          <section className="border-b border-black/10 px-6 py-5 md:px-12">
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-black/10 bg-white p-5 font-mono text-xs leading-relaxed">
              {view === 'prompt' ? recipe.prompt : JSON.stringify(recipe.manifestResolved, null, 2)}
            </pre>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-black/60 sm:grid-cols-4">
              <div><dt className="text-black/40">Mode</dt><dd>{recipe.mode}</dd></div>
              <div><dt className="text-black/40">Ink</dt><dd>{recipe.inkSummary}</dd></div>
              <div><dt className="text-black/40">Layout</dt><dd>{recipe.layoutName}</dd></div>
              <div><dt className="text-black/40">Type</dt><dd>{recipe.typeSummary}</dd></div>
            </dl>
          </section>
        )}

        <section className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
          <div
            style={{ aspectRatio: `${ratioW || 3} / ${ratioH || 4}` }}
            className="flex w-full max-w-md items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Generated mono-color editorial print" className="h-full w-full object-contain" />
            ) : (
              <p className="px-6 text-center text-sm text-black/30">
                {isGenerating ? 'Generating…' : 'No image yet'}
              </p>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="rounded-full bg-[#2148B8] px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
          >
            {isGenerating ? 'Generating…' : 'Generate image'}
          </button>
          {!activeKey && hydrated && (
            <p className="text-xs text-black/50">Add an API key above to enable generation.</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>
      </main>

      <aside className="hidden w-[320px] shrink-0 border-l border-black/10 bg-white/60 md:flex md:flex-col">
        <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
          <div className="shrink-0 border-b border-black/10 p-4">
            <div className="flex items-center gap-3">
              {sourceImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceImage}
                  alt="Uploaded reference"
                  className="h-12 w-12 shrink-0 rounded-md border border-black/10 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-black/20 text-[10px] text-black/30">
                  none
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer self-start rounded-full border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5">
                  {sourceImage ? 'Replace image' : 'Upload reference image'}
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
                {sourceImage && (
                  <button
                    onClick={() => setSourceImage(null)}
                    className="self-start rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/5"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-black/50">
              {sourceImage
                ? 'Used as the subject reference (up to 8MB).'
                : 'Optional — used as the subject, or leave empty to generate from the text subject alone.'}
            </p>
            {sourceImageError && <p className="mt-1 text-xs text-red-600">{sourceImageError}</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <DialRoot mode="inline" theme="light" productionEnabled />
          </div>
        </div>
      </aside>
    </div>
  );
}
