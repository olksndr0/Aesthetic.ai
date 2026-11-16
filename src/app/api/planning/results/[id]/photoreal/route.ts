import type { CaseAsset } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { describeOperation, planSchema } from '@/lib/anatomy/plan'
import { renderViewSchema, type RenderView } from '@/lib/anatomy/schema'
import { viewDefinition } from '@/lib/anatomy/views'
import { AiError } from '@/lib/ai-error'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { geminiConfigured, geminiImage, type GeminiPart } from '@/lib/gemini'
import { jsonError } from '@/lib/http'
import { finalizeResult } from '@/lib/images'
import { checkOutline, type OutlineCheck } from '@/lib/outline-check'
import { assetKey, ownedResult, removeAssetFiles } from '@/lib/planning'
import { isResponse, planningUser } from '@/lib/planning-http'
import { rateLimit } from '@/lib/rate-limit'
import { generationQueue } from '@/lib/simulations'
import { storage } from '@/lib/storage'

export const runtime = 'nodejs'
export const maxDuration = 300

const MESSAGES: Record<string, string> = {
  content_rejected: 'The image provider declined these images under its safety rules. Your credit has been returned.',
  timeout: 'The generation took too long and was stopped. Your credit has been returned.',
  provider_error: 'The image provider could not complete the photographic render. Your credit has been returned.',
}

/** The instruction for one view. The geometry is fixed by the render; the photographs supply the person. */
function buildPrompt(viewLabel: string, operations: string[], photoCount: number): string {
  return [
    `Image 1 is a 3D render of a patient's head after a planned procedure, seen in the ${viewLabel.toLowerCase()} view. It defines the geometry: head pose, camera, framing, scale and the exact outline of the face and head.`,
    `Image${photoCount > 1 ? `s 2 to ${photoCount + 1} are photographs` : ' 2 is a photograph'} of the same patient before the procedure.`,
    'Produce one photorealistic photograph of this patient that matches Image 1 exactly in pose, camera, framing, scale and outline.',
    'Take everything that identifies the person from the photographs: skin tone, skin texture and pores, apparent age, eye colour and shape, eyebrows, hair and hairline, ears, moles, freckles and facial hair.',
    `Planned procedure, already applied to the shape in Image 1 (do not add to it or exaggerate it): ${operations.join(' ')}`,
    'Show the result after healing has stabilised: no swelling, bruising, redness, dressings or fresh scars.',
    'Do not beautify. No skin smoothing, no make-up, no slimming, no change of age or weight, and no change to any feature the procedure does not affect. Keep asymmetries that Image 1 shows.',
    'Plain uniform light grey background, even neutral lighting, no text, no border, no other people.',
  ].join(' ')
}

/**
 * Photographic version of a stored result. Only the renders of the simulated
 * model, the patient's photographs and the operator's own description of the
 * procedure are sent to the provider: no volume, no mesh, no name.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  const result = await ownedResult(id, user.id)
  if (!result) return jsonError(404, 'not_found', 'Result not found.')

  if (!result.case.providerConsentAt) {
    return jsonError(400, 'consent_required', 'Confirm that the renders and photographs may be sent to the external image provider.')
  }
  if (!geminiConfigured()) {
    return jsonError(503, 'not_configured', 'The photographic render is not configured on this server, so nothing was generated and no credit was used.', {
      setup: 'Set GEMINI_API_KEY (and optionally GEMINI_IMAGE_MODEL) in the server environment.',
    })
  }
  const limit = rateLimit(`photoreal:${user.id}`, 6, 10 * 60_000)
  if (!limit.ok) return jsonError(429, 'rate_limited', `Too many renders. Try again in ${limit.retryAfterSeconds} seconds.`)

  const photos = await db.caseAsset.findMany({ where: { caseId: result.caseId, kind: 'photo' } })
  if (!photos.some(photo => photo.label === 'front')) {
    return jsonError(400, 'no_photos', 'Upload at least the front photograph: the model needs it for identity, skin and hair.')
  }
  const views = z.array(renderViewSchema).parse(result.views)
  const operations = planSchema.parse(result.plan).operations.map(describeOperation)
  const file = (label: string) => result.files.find(item => item.label === label)

  // A successful run replaces the photographs of an earlier one; a failed run leaves them as they were.
  const stale = result.files.filter(item => item.label.endsWith(':photo'))

  // One run at a time per result. A run that never finished (server restart) stops blocking after ten minutes.
  const claimed = await db.caseResult.updateMany({
    where: { id, OR: [{ photoStatus: { not: 'processing' } }, { photoStartedAt: null }, { photoStartedAt: { lt: new Date(Date.now() - 10 * 60_000) } }] },
    data: { photoStatus: 'processing', photoStartedAt: new Date(), photoError: null },
  })
  if (claimed.count === 0) return jsonError(409, 'busy', 'A photographic render of this result is already running.')
  const release = (photoStatus: string) => db.caseResult.update({ where: { id }, data: { photoStatus } })

  const charged = await db.user.updateMany({ where: { id: user.id, credits: { gt: 0 } }, data: { credits: { decrement: 1 } } })
  if (charged.count === 0) {
    await release(stale.length > 0 ? 'completed' : 'none')
    return jsonError(402, 'no_credits', 'You have no simulations left. Choose a plan to continue.')
  }


  const created: CaseAsset[] = []
  try {
    const outputs = await Promise.all(
      views.map(async (view: RenderView) => {
        const after = file(`${view.view}:after`)
        const outline = file(`${view.view}:outline`)
        if (!after || !outline) throw new Error(`The stored renders of the ${view.view} view are missing.`)

        // The photograph of this very view first, then the front one: at most three, the fewest that carry the identity.
        const references = [...photos.filter(photo => photo.label === view.view), ...photos.filter(photo => photo.label === 'front' && view.view !== 'front')].slice(0, 3)
        const parts: GeminiPart[] = [
          { text: buildPrompt(viewDefinition(view.view)?.label ?? view.view, operations, references.length) },
          { image: await storage().get(after.key), mimeType: 'image/png' },
        ]
        for (const photo of references) parts.push({ image: await storage().get(photo.key), mimeType: 'image/jpeg' })

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs)
        try {
          const raw = await generationQueue(false, () => geminiImage(parts, { aspectRatio: view.width * 5 === view.height * 4 ? '4:5' : undefined, signal: controller.signal }))
          if (raw.length < 1024) throw new AiError('provider_error', 'The provider returned an empty image.')
          const image = await finalizeResult(raw, 2048)
          const check = await checkOutline({
            generated: image,
            outline: await storage().get(outline.key),
            roi: view.roi,
            renderWidth: view.width,
            mmPerPixel: view.mmPerPixel,
            toleranceMm: env.planning.toleranceMm,
          })
          return { view: view.view, image, check, references: references.map(photo => photo.label) }
        } catch (error) {
          if (!(error instanceof AiError) && controller.signal.aborted) throw new AiError('timeout', 'The generation took too long and was stopped.')
          throw error
        } finally {
          clearTimeout(timer)
        }
      }),
    )

    const checks: Record<string, OutlineCheck & { photoAssetId: string; references: string[] }> = {}
    for (const output of outputs) {
      const asset = await db.caseAsset.create({
        data: { caseId: result.caseId, resultId: id, kind: 'render', provenance: 'derived', label: `${output.view}:photo`, key: '', bytes: output.image.length },
      })
      created.push(asset)
      const key = assetKey(user.id, result.caseId, asset.id, 'jpg')
      await storage().put(key, output.image, 'image/jpeg')
      await db.caseAsset.update({ where: { id: asset.id }, data: { key } })
      asset.key = key
      checks[output.view] = { ...output.check, photoAssetId: asset.id, references: output.references }
    }

    await removeAssetFiles(stale)
    await db.caseAsset.deleteMany({ where: { id: { in: stale.map(item => item.id) } } })
    await db.caseResult.update({
      where: { id },
      data: { photoStatus: 'completed', provider: `gemini:${env.ai.geminiModel}`, views: views.map(view => ({ ...view, photo: checks[view.view] })) },
    })
    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { credits: true } })
    return NextResponse.json({ ok: true, credits: fresh?.credits ?? 0, checks })
  } catch (error) {
    const code = error instanceof AiError ? error.code : 'provider_error'
    const detail = error instanceof Error ? error.message : 'Unknown error'
    console.error('[planning] photographic render failed', id, code, detail)

    // A failed run costs nothing and leaves no partial photographs.
    await removeAssetFiles(created.filter(asset => asset.key))
    await db.$transaction([
      db.caseAsset.deleteMany({ where: { id: { in: created.map(asset => asset.id) } } }),
      db.caseResult.update({ where: { id }, data: { photoStatus: stale.length > 0 ? 'completed' : 'failed', photoError: detail.slice(0, 500) } }),
      db.user.update({ where: { id: user.id }, data: { credits: { increment: 1 } } }),
    ])
    return jsonError(code === 'content_rejected' ? 422 : 502, code, MESSAGES[code] ?? MESSAGES.provider_error!, { detail: detail.slice(0, 300) })
  }
}
