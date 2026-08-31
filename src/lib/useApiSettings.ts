'use client';

import { useEffect, useState } from 'react';

export type Provider = 'gemini' | 'openai';

export type ApiSettings = {
  provider: Provider;
  geminiKey: string;
  geminiModel: string;
  openaiKey: string;
  openaiModel: string;
};

const STORAGE_KEY = 'monoink:api-settings';

const DEFAULTS: ApiSettings = {
  provider: 'gemini',
  geminiKey: '',
  geminiModel: 'gemini-3-pro-image-preview',
  openaiKey: '',
  openaiModel: 'gpt-image-1',
};

// Model defaults that shipped in earlier builds. If a stored value still exactly matches one of
// these, it was never deliberately overridden by the user, so it's safe to fast-forward it to the
// current default rather than leaving it stuck on a retired model name.
const SUPERSEDED_GEMINI_MODELS = ['gemini-2.5-flash-image'];

function migrate(stored: Partial<ApiSettings>): ApiSettings {
  const merged = { ...DEFAULTS, ...stored };
  if (SUPERSEDED_GEMINI_MODELS.includes(merged.geminiModel)) {
    merged.geminiModel = DEFAULTS.geminiModel;
  }
  return merged;
}

/** Keys never leave the browser except in a direct call to our own /api/generate route. */
export function useApiSettings() {
  const [settings, setSettings] = useState<ApiSettings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Reading localStorage must happen post-mount to avoid SSR/client hydration mismatches,
    // so the settings can only be known after this first client-only effect runs.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSettings(migrate(JSON.parse(raw)));
    } catch {
      // ignore malformed local storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  return { settings, setSettings, hydrated };
}
