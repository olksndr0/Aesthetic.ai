import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { z } from 'zod'

import { planSchema } from '@/lib/anatomy/plan'
import { renderViewSchema } from '@/lib/anatomy/schema'
import { ENGINE } from '@/lib/anatomy/simulate'
import { RESULT_VIEWS } from '@/lib/anatomy/views'
import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { MAX_RESULTS_PER_CASE, PlanningError, assetKey, ownedCase } from '@/lib/planning'
import { isResponse, parseJsonField, planningFailure, planningUser } from '@/lib/planning-http'
import { storage } from '@/lib/storage'

export const runtime = 'nodejs'
export const maxDuration = 120

const LAYERS = ['before', 'after', 'outline'] as const

// What the engine measured, as reported by the browser that ran it. Kept for the record; nothing here is trusted for access or billing.
const statsSchema = z.object({
  maxSkinMm: z.number().finite().min(0).max(200),
  operations: z
    .array(
      z.object({
        id: z.string().max(40),
        kind: z.enum(['implant', 'osteotomy']),
        maxHardMm: z.number().finite(),
        maxSkinMm: z.number().finite(),
        boneVertices: z.number().int(),
        warnings: z.array(z.string().max(300)).max(10),
      }),
    )
    .max(6),
  landmarks: z.array(z.object({ id: z.string().max(40), code: z.string().max(24), movedMm: z.number().finite() })).max(200),
  measures: z.array(z.object({ id: z.string().max(40), label: z.string().max(80), kind: z.enum(['distance', 'angle']), before: z.number().finite().nullable(), after: z.number().finite().nullable() })).max(100),
  /** Ids of the geometry the result was computed from. */
  skullAssetId: z.string().max(40),
  faceAssetId: z.string().max(40),
  /** Whether any input geometry was declared estimated rather than acquired. */
  usesEstimatedGeometry: z.boolean(),
})

/** Stores one simulation: the plan it used and the geometric renders of every view. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await ownedCase(id, user.id))) return jsonError(404, 'not_found', 'Case not found.')
  if ((await db.caseResult.count({ where: { caseId: id } })) >= MAX_RESULTS_PER_CASE) {
    return jsonError(409, 'too_many', `A case keeps up to ${MAX_RESULTS_PER_CASE} results. Delete an old one first.`)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError(400, 'bad_request', 'The upload could not be read.')
  }

  try {
    const plan = parseJsonField(planSchema, form.get('plan'), 'plan')
    const stats = parseJsonField(statsSchema, form.get('stats'), 'stats')
    const views = parseJsonField(z.array(renderViewSchema).min(3).max(5), form.get('views'), 'views')
    const ids = views.map(view => view.view)
    if (new Set(ids).size !== ids.length || !RESULT_VIEWS.every(view => ids.includes(view))) {
      throw new PlanningError('invalid', 'A result needs the front view and both profiles, each once.')
    }

    // Every image is decoded and re-encoded, and must have the size its view declares.
    const images: Array<{ label: string; data: Buffer }> = []
    for (const view of views) {
      for (const layer of LAYERS) {
        const file = form.get(`${layer}:${view.view}`)
        if (!(file instanceof File) || file.size === 0 || file.size > 8 * 1024 * 1024) {
          throw new PlanningError('invalid', `The ${layer} render of the ${view.view} view is missing.`)
        }
        const image = sharp(Buffer.from(await file.arrayBuffer()), { failOn: 'error' })
        const info = await image.metadata().catch(() => null)
        if (info?.format !== 'png' || info.width !== view.width || info.height !== view.height) {
          throw new PlanningError('invalid', `The ${layer} render of the ${view.view} view is not a PNG of the declared size.`)
        }
        images.push({ label: `${view.view}:${layer}`, data: await image.removeAlpha().png({ compressionLevel: 9 }).toBuffer() })
      }
    }

    const result = await db.caseResult.create({ data: { caseId: id, plan, engine: { ...ENGINE }, stats, views } })
    for (const image of images) {
      const asset = await db.caseAsset.create({
        data: { caseId: id, resultId: result.id, kind: 'render', provenance: 'derived', label: image.label, key: '', bytes: image.data.length },
      })
      const key = assetKey(user.id, id, asset.id, 'png')
      await storage().put(key, image.data, 'image/png')
      await db.caseAsset.update({ where: { id: asset.id }, data: { key } })
    }
    return NextResponse.json({ id: result.id })
  } catch (error) {
    return planningFailure(error)
  }
}
