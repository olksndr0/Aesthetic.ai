import 'server-only'

import { AiError, type AiErrorCode } from './ai-error'
import { env } from './env'
import { geminiImage } from './gemini'

export { AiError, type AiErrorCode }

export type GenerateInput = { image: Buffer; prompt: string; highResolution: boolean }
export type GenerateOutput = { image: Buffer; provider: string }

export function aiConfigured(): boolean {
  return env.ai.provider !== null
}

/** Image-to-image edit of the uploaded photo. Never returns a stock or cached image. */
export async function generateSimulation(input: GenerateInput): Promise<GenerateOutput> {
  const provider = env.ai.provider
  if (provider === null) {
    throw new AiError(
      'not_configured',
      'No AI image provider is configured. Set OPENAI_API_KEY, REPLICATE_API_TOKEN or GEMINI_API_KEY on the server.',
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs)

  try {
    const image =
      provider === 'openai'
        ? await openaiEdit(input, controller.signal)
        : provider === 'replicate'
          ? await replicateEdit(input, controller.signal)
          : await geminiImage([{ text: input.prompt }, { image: input.image, mimeType: 'image/jpeg' }], { signal: controller.signal })
    if (image.length < 1024) throw new AiError('provider_error', 'The provider returned an empty image.')
    return { image, provider }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (controller.signal.aborted) throw new AiError('timeout', 'The generation took too long and was stopped.')
    throw new AiError('provider_error', error instanceof Error ? error.message : 'Unknown provider error')
  } finally {
    clearTimeout(timer)
  }
}

function looksLikeModeration(text: string): boolean {
  return /moderation|safety|content[_ ]policy|nsfw|flagged|sensitive/i.test(text)
}

async function failFrom(response: Response, provider: string): Promise<never> {
  const body = (await response.text()).slice(0, 600)
  if (looksLikeModeration(body)) {
    throw new AiError('content_rejected', 'The provider declined this photo under its safety rules.')
  }
  throw new AiError('provider_error', `${provider} answered ${response.status}: ${body}`)
}

// OpenAI Images API, edits endpoint. `input_fidelity: high` keeps the face of
// the input photo, which is what makes the result the same person.
async function openaiEdit(input: GenerateInput, signal: AbortSignal): Promise<Buffer> {
  const form = new FormData()
  form.set('model', env.ai.openaiModel)
  form.set('prompt', input.prompt)
  form.set('image', new Blob([new Uint8Array(input.image)], { type: 'image/jpeg' }), 'photo.jpg')
  form.set('size', 'auto')
  form.set('quality', input.highResolution ? 'high' : 'medium')
  form.set('input_fidelity', 'high')
  form.set('n', '1')

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ai.openaiKey}` },
    body: form,
    signal,
  })
  if (!response.ok) await failFrom(response, 'OpenAI')

  const json = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const first = json.data?.[0]
  if (first?.b64_json) return Buffer.from(first.b64_json, 'base64')
  if (first?.url) return download(first.url, signal)
  throw new AiError('provider_error', 'OpenAI returned no image.')
}

type ReplicatePrediction = {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string | string[] | null
  error?: string | null
  urls?: { get?: string }
}

// Replicate, FLUX Kontext: an instruction-driven edit model that keeps the
// subject and scene of the input image.
async function replicateEdit(input: GenerateInput, signal: AbortSignal): Promise<Buffer> {
  const headers = { Authorization: `Bearer ${env.ai.replicateToken}`, 'Content-Type': 'application/json' }
  const response = await fetch(`https://api.replicate.com/v1/models/${env.ai.replicateModel}/predictions`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'wait=60' },
    body: JSON.stringify({
      input: {
        prompt: input.prompt,
        input_image: `data:image/jpeg;base64,${input.image.toString('base64')}`,
        aspect_ratio: 'match_input_image',
        output_format: 'jpg',
        safety_tolerance: 2,
      },
    }),
    signal,
  })
  if (!response.ok) await failFrom(response, 'Replicate')

  let prediction = (await response.json()) as ReplicatePrediction

  while (prediction.status === 'starting' || prediction.status === 'processing') {
    const next = prediction.urls?.get
    if (!next) throw new AiError('provider_error', 'Replicate returned no status URL.')
    await new Promise(resolve => setTimeout(resolve, 1500))
    const poll = await fetch(next, { headers, signal })
    if (!poll.ok) await failFrom(poll, 'Replicate')
    prediction = (await poll.json()) as ReplicatePrediction
  }

  if (prediction.status !== 'succeeded') {
    const reason = prediction.error ?? prediction.status
    if (looksLikeModeration(reason)) {
      throw new AiError('content_rejected', 'The provider declined this photo under its safety rules.')
    }
    throw new AiError('provider_error', `Replicate prediction ${reason}`)
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
  if (!url) throw new AiError('provider_error', 'Replicate returned no image.')
  return download(url, signal)
}

async function download(url: string, signal: AbortSignal): Promise<Buffer> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new AiError('provider_error', `Could not download the result (${response.status}).`)
  return Buffer.from(await response.arrayBuffer())
}
