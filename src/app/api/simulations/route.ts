import { NextResponse } from 'next/server'

import { AiError, aiConfigured, generateSimulation } from '@/lib/ai'
import { getCurrentUser } from '@/lib/auth'
import { getPlan } from '@/lib/content'
import { db } from '@/lib/db'
import { jsonError, sameOrigin } from '@/lib/http'
import { UploadError, finalizeResult, prepareUpload } from '@/lib/images'
import { VIEWS, VIEW_LABELS, buildPrompt, getProcedure, type View } from '@/lib/procedures'
import { rateLimit } from '@/lib/rate-limit'
import { generationQueue, retentionDate } from '@/lib/simulations'
import { storage } from '@/lib/storage'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-rules'
import { simulationSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const maxDuration = 300

const USER_MESSAGES: Record<string, string> = {
  content_rejected:
    'The AI provider declined one of these photos under its safety rules. Try different, clearly lit and fully clothed photos.',
  timeout: 'The generation took too long and was stopped. Your credit has been returned; please try again.',
  provider_error: 'The AI provider could not complete this simulation. Your credit has been returned; please try again.',
}

// Front view keeps the original key names, so simulations stored before the
// profile view existed still resolve.
const FILES: Record<View, { original: string; result: string }> = {
  front: { original: 'original.jpg', result: 'result.jpg' },
  profile: { original: 'profile-original.jpg', result: 'profile-result.jpg' },
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
  if (declared > VIEWS.length * MAX_UPLOAD_BYTES + 64 * 1024) return jsonError(413, 'too_large', 'Each photo can be up to 12 MB.')

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

  // Both views are required: a procedure is judged from the front and in profile.
  const photos = {} as Record<View, Awaited<ReturnType<typeof prepareUpload>>>
  for (const view of VIEWS) {
    const label = VIEW_LABELS[view].toLowerCase()
    const file = form.get(view)
    if (!(file instanceof File) || file.size === 0) {
      return jsonError(400, 'missing_view', `Attach the ${label} photo. Both the front view and the side profile are required.`, { view })
    }
    if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, 'too_large', `The ${label} photo is larger than 12 MB.`, { view })
    try {
      photos[view] = await prepareUpload(Buffer.from(await file.arrayBuffer()))
    } catch (error) {
      const reason = error instanceof UploadError ? error.message : 'The photo could not be read.'
      return jsonError(400, 'invalid_image', `${VIEW_LABELS[view]}: ${reason}`, { view })
    }
  }
  if (photos.front.data.equals(photos.profile.data)) {
    return jsonError(400, 'same_photo', 'The front view and the side profile are the same file. Upload two different photos.')
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

  const highResolution = plan.highResolution || isAdmin

  try {
    await Promise.all(VIEWS.map(view => storage().put(`${base}/${FILES[view].original}`, photos[view].data, 'image/jpeg')))
    await db.simulation.update({
      where: { id: simulation.id },
      data: { originalKey: `${base}/${FILES.front.original}`, profileOriginalKey: `${base}/${FILES.profile.original}` },
    })

    // One edit per view, same procedure, focus and intensity. Nothing is kept unless both succeed.
    const outputs = await Promise.all(
      VIEWS.map(view =>
        generationQueue(plan.priority || isAdmin, () =>
          generateSimulation({ image: photos[view].data, prompt: buildPrompt(procedure, params, view), highResolution }),
        ),
      ),
    )
    await Promise.all(
      VIEWS.map(async (view, index) => {
        const result = await finalizeResult(outputs[index]!.image, highResolution ? 2048 : 1024)
        await storage().put(`${base}/${FILES[view].result}`, result, 'image/jpeg')
      }),
    )

    await db.simulation.update({
      where: { id: simulation.id },
      data: {
        status: 'COMPLETED',
        resultKey: `${base}/${FILES.front.result}`,
        profileResultKey: `${base}/${FILES.profile.result}`,
        provider: outputs[0]!.provider,
        durationMs: Date.now() - startedAt,
      },
    })

    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { credits: true } })
    return NextResponse.json({ id: simulation.id, credits: fresh?.credits ?? 0 })
  } catch (error) {
    const code = error instanceof AiError ? error.code : 'provider_error'
    const detail = error instanceof Error ? error.message : 'Unknown error'
    console.error('[simulation] failed', simulation.id, code, detail)

    // The failed attempt costs nothing and keeps no photo.
    await Promise.all(
      VIEWS.flatMap(view => [FILES[view].original, FILES[view].result]).map(name => storage().remove(`${base}/${name}`).catch(() => undefined)),
    )
    await db.$transaction([
      db.simulation.update({
        where: { id: simulation.id },
        data: { status: 'FAILED', errorCode: code, errorMessage: detail.slice(0, 1000), originalKey: null, profileOriginalKey: null, durationMs: Date.now() - startedAt },
      }),
      db.user.update({ where: { id: user.id }, data: { credits: { increment: 1 } } }),
    ])

    return jsonError(code === 'content_rejected' ? 422 : 502, code, USER_MESSAGES[code] ?? USER_MESSAGES.provider_error ?? 'Generation failed.')
  }
}
