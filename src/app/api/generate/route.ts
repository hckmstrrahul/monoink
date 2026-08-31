import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const RequestSchema = z
  .object({
    prompt: z.string().min(1).max(8000),
    provider: z.enum(['gemini', 'openai']),
    apiKey: z.string().min(10).max(300),
    model: z.string().min(1).max(100).optional(),
    ratio: z
      .string()
      .regex(/^\d+:\d+$/)
      .optional(),
    sourceImage: z
      .string()
      .max(12_000_000)
      .refine((v) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(v), 'Invalid image data URL.')
      .optional(),
  })
  .strict();

const OPENAI_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '3:4': '1024x1536',
  '2:3': '1024x1536',
  '4:5': '1024x1536',
  '4:3': '1536x1024',
  '3:2': '1536x1024',
};

const GEMINI_ASPECT_RATIOS = new Set([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
]);

function redact(message: string, secret: string): string {
  return secret ? message.split(secret).join('[redacted]') : message;
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid image data.');
  return { mimeType: match[1], base64: match[2] };
}

async function generateWithOpenAI(
  prompt: string,
  apiKey: string,
  ratio: string | undefined,
  model: string,
  sourceImage: string | undefined
) {
  const size = (ratio && OPENAI_SIZES[ratio]) || 'auto';

  let res: Response;
  if (sourceImage) {
    const { mimeType, base64 } = parseDataUrl(sourceImage);
    const ext = mimeType.split('/')[1] || 'png';
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('image', new Blob([Buffer.from(base64, 'base64')], { type: mimeType }), `reference.${ext}`);
    res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
    });
  }

  const data = await res.json();
  if (!res.ok) {
    const message = typeof data?.error?.message === 'string' ? data.error.message : 'OpenAI image generation failed.';
    throw new Error(redact(message, apiKey));
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image data.');
  return `data:image/png;base64,${b64}`;
}

async function generateWithGemini(
  prompt: string,
  apiKey: string,
  model: string,
  ratio: string | undefined,
  sourceImage: string | undefined
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
  const generationConfig: Record<string, unknown> = { responseModalities: ['TEXT', 'IMAGE'] };
  if (ratio && GEMINI_ASPECT_RATIOS.has(ratio)) {
    generationConfig.imageConfig = { aspectRatio: ratio, imageSize: '2K' };
  }

  const parts: unknown[] = [];
  if (sourceImage) {
    const { mimeType, base64 } = parseDataUrl(sourceImage);
    parts.push({ inlineData: { mimeType, data: base64 } });
  }
  parts.push({ text: prompt });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const message = typeof data?.error?.message === 'string' ? data.error.message : 'Gemini image generation failed.';
    throw new Error(redact(message, apiKey));
  }

  const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = responseParts.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part?.inlineData?.data
  );
  if (!imagePart?.inlineData?.data) throw new Error('Gemini returned no image data.');
  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { prompt, provider, apiKey, model, ratio, sourceImage } = parsed.data;

  try {
    const imageDataUrl =
      provider === 'openai'
        ? await generateWithOpenAI(prompt, apiKey, ratio, model || 'gpt-image-1', sourceImage)
        : await generateWithGemini(prompt, apiKey, model || 'gemini-3-pro-image-preview', ratio, sourceImage);

    return NextResponse.json({ image: imageDataUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed.';
    return NextResponse.json({ error: redact(message, apiKey) }, { status: 502 });
  }
}
