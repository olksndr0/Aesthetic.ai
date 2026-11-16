import { NextResponse } from 'next/server'

import { AiError, aiConfigured, generateSimulation } from '@/lib/ai'
import { getCurrentUser } from '@/lib/auth'
import { getPlan } from '@/lib/content'
import { db } from '@/lib/db'
import { jsonError, sameOrigin } from '@/lib/http'
import { UploadError, finalizeResult, prepareUpload } from '@/lib/images'
import { buildPrompt, getProcedure } from '@/lib/procedures'
import { rateLimit } from '@/lib/rate-limit'
import { generationQueue, retentionDate } from '@/lib/simulations'
import { storage } from '@/lib/storage'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-rules'
import { simulationSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const maxDuration = 300

const USER_MESSAGES: Record<string, string> = {
  content_rejected:
    'The AI provider declined this photo under its safety rules. Try a different, clearly lit and fully clothed photo.',
  timeout: 'The generation took too long and was stopped. Your credit has been returned; please try again.',
  provider_error: 'The AI provider could not complete this simulation. Your credit has been returned; please try again.',
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, 'forbidden', 'Cross-site request refused.')

  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Sign in to run a simulation.')

  const limit = rateLimit(`sim:${user.id}`, 10, 10 * 60_000)
  if (!limit.ok) {
    return jsonError(429, 'rate_limited', `Too many simulations. Try again in ${limit.retryAfterSeconds} seconds.`)
  }

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return jsonError(413, 'too_large', 'The photo is larger than 12 MB.')

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError(400, 'bad_request', 'The upload could not be read.')
  }

  const parsed = simulationSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string')))
  if (!parsed.success) {
    return jsonError(400, 'invalid', 'Confirm the three consent boxes and choose a procedure before generating.')
  }

  const procedure = getProcedure(parsed.data.procedure)
  if (!procedure || !procedure.focus.some(option => option.id === parsed.data.focus)) {
    return jsonError(400, 'invalid', 'Unknown procedure or option.')
  }

  const plan = await getPlan(user.planSlug)
  const isAdmin = user.role === 'ADMIN'
  if (!procedure.starter && !plan.allProcedures && !isAdmin) {
    return jsonError(403, 'plan_required', `${procedure.name} is available on Pro and Premium.`)
  }

  const file = form.get('photo')
  if (!(file instanceof File)) return jsonError(400, 'invalid', 'Attach a photo.')
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, 'too_large', 'The photo is larger than 12 MB.')

  let photo: Awaited<ReturnType<typeof prepareUpload>>
  try {
    photo = await prepareUpload(Buffer.from(await file.arrayBuffer()))
  } catch (error) {
    return jsonError(400, 'invalid_image', error instanceof UploadError ? error.message : 'The photo could not be read.')
  }

  // Checked before any credit is taken or any photo is stored.
  if (!aiConfigured()) {
    return jsonError(
      503,
      'not_configured',
      'The AI image provider is not configured on this server yet, so no simulation was generated and no credit was used.',
      { setup: 'Set OPENAI_API_KEY or REPLICATE_API_TOKEN in the server environment (see README, "AI provider").' },
    )
  }

  const charged = await db.user.updateMany({ where: { id: user.id, credits: { gt: 0 } }, data: { credits: { decrement: 1 } } })
  if (charged.count === 0) {
    return jsonError(402, 'no_credits', 'You have no simulations left. Choose a plan to continue.')
  }

  const params = { intensity: parsed.data.intensity, focus: parsed.data.focus }
  const simulation = await db.simulation.create({
    data: { userId: user.id, procedure: procedure.slug, params, consentAt: new Date(), expiresAt: retentionDate() },
  })
  const base = `u/${user.id}/${simulation.id}`
  const startedAt = Date.now()

  try {
    await storage().put(`${base}/original.jpg`, photo.data, 'image/jpeg')
    await db.simulation.update({ where: { id: simulation.id }, data: { originalKey: `${base}/original.jpg` } })

    const output = await generationQueue(plan.priority || isAdmin, () =>
      generateSimulation({
        image: photo.data,
        prompt: buildPrompt(procedure, params),
        highResolution: plan.highResolution || isAdmin,
      }),
    )
    const result = await finalizeResult(output.image, plan.highResolution || isAdmin ? 2048 : 1024)
    await storage().put(`${base}/result.jpg`, result, 'image/jpeg')

    await db.simulation.update({
      where: { id: simulation.id },
      data: { status: 'COMPLETED', resultKey: `${base}/result.jpg`, provider: output.provider, durationMs: Date.now() - startedAt },
    })

    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { credits: true } })
    return NextResponse.json({ id: simulation.id, credits: fresh?.credits ?? 0 })
  } catch (error) {
    const code = error instanceof AiError ? error.code : 'provider_error'
    const detail = error instanceof Error ? error.message : 'Unknown error'
    console.error('[simulation] failed', simulation.id, code, detail)

    // The failed attempt costs nothing and keeps no photo.
    await storage().remove(`${base}/original.jpg`).catch(() => undefined)
    await db.$transaction([
      db.simulation.update({
        where: { id: simulation.id },
        data: { status: 'FAILED', errorCode: code, errorMessage: detail.slice(0, 1000), originalKey: null, durationMs: Date.now() - startedAt },
      }),
      db.user.update({ where: { id: user.id }, data: { credits: { increment: 1 } } }),
    ])

    return jsonError(code === 'content_rejected' ? 422 : 502, code, USER_MESSAGES[code] ?? USER_MESSAGES.provider_error ?? 'Generation failed.')
  }
}
