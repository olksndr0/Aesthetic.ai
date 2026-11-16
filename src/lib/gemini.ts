import 'server-only'

import { AiError } from './ai-error'
import { env } from './env'

export type GeminiPart = { text: string } | { image: Buffer; mimeType: 'image/jpeg' | 'image/png' }

type GeminiResponse = {
  promptFeedback?: { blockReason?: string }
  candidates?: Array<{
    finishReason?: string
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> }
  }>
  error?: { message?: string; status?: string }
}

// Finish reasons that mean the model declined, as opposed to failed.
const REFUSALS = /SAFETY|PROHIBITED|BLOCK|RECITATION|SPII/i

export function geminiConfigured(): boolean {
  return env.ai.geminiKey !== ''
}

/**
 * One image from text and reference images, through the Gemini API
 * (`generateContent`). Only images and text can be sent: the API has no input
 * for meshes or DICOM, so anatomy reaches it as rendered views. The key
 * travels in a header, never in the URL, and is never logged.
 */
export async function geminiImage(parts: GeminiPart[], options: { aspectRatio?: string; signal?: AbortSignal } = {}): Promise<Buffer> {
  if (!geminiConfigured()) {
    throw new AiError('not_configured', 'The Gemini image model is not configured. Set GEMINI_API_KEY on the server.')
  }
  const imageConfig: Record<string, string> = {}
  if (options.aspectRatio) imageConfig.aspectRatio = options.aspectRatio
  if (env.ai.geminiImageSize) imageConfig.imageSize = env.ai.geminiImageSize

  const model = env.ai.geminiModel
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.ai.geminiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: parts.map(part => ('text' in part ? { text: part.text } : { inlineData: { mimeType: part.mimeType, data: part.image.toString('base64') } })),
        },
      ],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}) },
    }),
    signal: options.signal,
  })

  const json = (await response.json().catch(() => null)) as GeminiResponse | null
  if (!response.ok) {
    const detail = json?.error?.message?.slice(0, 400) ?? `HTTP ${response.status}`
    if (response.status === 404) {
      throw new AiError('provider_error', `Gemini does not know the model "${model}". Set GEMINI_IMAGE_MODEL to a current image model. (${detail})`)
    }
    throw new AiError('provider_error', `Gemini answered ${response.status}: ${detail}`)
  }

  if (json?.promptFeedback?.blockReason) {
    throw new AiError('content_rejected', `The provider declined this request (${json.promptFeedback.blockReason}).`)
  }
  const candidate = json?.candidates?.[0]
  const image = candidate?.content?.parts?.find(part => part.inlineData?.data)?.inlineData
  if (image?.data) return Buffer.from(image.data, 'base64')

  if (candidate?.finishReason && REFUSALS.test(candidate.finishReason)) {
    throw new AiError('content_rejected', `The provider declined to generate this image (${candidate.finishReason}).`)
  }
  const said = candidate?.content?.parts?.find(part => part.text)?.text?.slice(0, 200)
  throw new AiError('provider_error', `Gemini returned no image${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}${said ? `: ${said}` : '.'}`)
}
