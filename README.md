# Monoink

A [DialKit](https://github.com/joshpuckett/dialkit)-powered property-control studio for the
[mono-color-skill](https://github.com/yanliudesign/mono-color-skill) one-ink/two-ink editorial print
style. Every dial maps to a field in the skill's manifest (subject, ink palette, layout, typography,
print imperfections, …); the compiled prompt and resolved JSON manifest update live as you move a
control. Optionally attach a reference image to use as the subject, then press **Generate image** to
send the compiled prompt to Gemini or OpenAI image generation with your own API key.

## Attribution

- **[mono-color-skill](https://github.com/yanliudesign/mono-color-skill)** by [yanliudesign](https://github.com/yanliudesign) — the design system and prompt-compilation rules this tool dials in. All palette/composition/typography/rhythm/imperfection catalogs are copied verbatim from this repo.
- **[DialKit](https://github.com/joshpuckett/dialkit)** by [Josh Puckett](https://github.com/joshpuckett) — the real-time property-control panel library that drives the studio UI.

## Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it's wired

- `src/data/mono/*.json` — the mono-color-skill's own design-system catalogs (colors, compositions,
  rhythm, typography, imperfections, carriers), copied verbatim from the skill repo. This is the
  single source of truth for every dropdown's options and for the compiled prompt — nothing about
  the palette/layout/typography systems is hardcoded outside these files.
- `src/lib/mono/catalog.ts` — typed lookups over those JSON catalogs, plus a deterministic
  (non-random) picker for print imperfections, seeded from subject + text + palette + layout, per
  the skill's "stable hash" rule.
- `src/lib/mono/promptCompiler.ts` — turns the current dial values into the five-paragraph prompt
  structure the skill specifies (canvas & ink → composition → subject → typography → material/avoids),
  plus a resolved JSON manifest.
- `src/components/MonoStudio.tsx` — the `useDialKit` panel (right sidebar, inline + scrollable) wired
  to the compiler via `useMemo`, so the Prompt/JSON preview (collapsible, top tabs) and the centered
  generated-image frame update on every dial change with zero extra plumbing.
- `src/app/api/generate/route.ts` — a small Next.js route that takes
  `{ prompt, provider, apiKey, model, ratio, sourceImage? }`, validates it with `zod`, and calls
  Gemini `generateContent` (with `imageConfig.aspectRatio`, and the source image as an `inlineData`
  part when attached) or OpenAI's `images/generations` — or `images/edits` when a source image is
  attached — directly. Those two provider hosts are the only allowlisted outbound destinations.

## API keys

Enter your own Gemini and/or OpenAI API key under **API keys** in the app. Keys are stored only in
your browser's `localStorage` and are sent straight to this app's own `/api/generate` route at
generation time — they are never logged and never persisted server-side. Model names are editable
(defaults: `gemini-3-pro-image-preview`, `gpt-image-1`) in case a provider renames or retires a model
after this was written.

## Global Claude Code skills installed alongside this project

- `~/.claude/skills/mono-color-skill/` — the full upstream skill (SKILL.md + design-system catalogs),
  cloned from https://github.com/yanliudesign/mono-color-skill.
- `~/.claude/skills/dialkit/` — an authored SKILL.md covering the `dialkit` npm package's React API
  (https://github.com/joshpuckett/dialkit), for building future dial-driven control panels.
