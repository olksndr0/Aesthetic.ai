import { NextResponse } from 'next/server'
import { z } from 'zod'

import { det3, scaleOf } from '@/lib/anatomy/math'
import { PROVENANCES, mat4Schema, transformStepSchema, type MeshMeta } from '@/lib/anatomy/schema'
import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { ownedAsset, removeAssetFiles } from '@/lib/planning'
import { isResponse, planningUser } from '@/lib/planning-http'
import { storage } from '@/lib/storage'

export const runtime = 'nodejs'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', amsh: 'application/octet-stream' }

// The only door to a stored case file; the owner is part of the query.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, false)
  if (isResponse(user)) return user
  const { id } = await params
  const asset = await ownedAsset(id, user.id)
  if (!asset?.key) return jsonError(404, 'not_found', 'File not found.')

  let data: Buffer
  try {
    data = await storage().get(asset.key)
  } catch {
    return jsonError(404, 'not_found', 'File not found.')
  }
  const extension = asset.key.split('.').pop() ?? ''
  const headers = new Headers({
    'Content-Type': TYPES[extension] ?? 'application/octet-stream',
    'Content-Length': String(data.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  if (new URL(request.url).searchParams.get('download') === '1') {
    headers.set('Content-Disposition', `attachment; filename="planning-${asset.label.replace(/[^a-z0-9-]+/gi, '-')}.${extension}"`)
  }
  return new Response(new Uint8Array(data), { headers })
}

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    provenance: z.enum(PROVENANCES),
    /** A new alignment, with the step that produced it. */
    transform: mat4Schema,
    step: transformStepSchema,
  })
  .partial()
  .refine(value => (value.transform === undefined) === (value.step === undefined), 'A new alignment needs the step that produced it.')

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  const asset = await ownedAsset(id, user.id)
  if (!asset || asset.kind === 'photo' || asset.kind === 'render') return jsonError(404, 'not_found', 'Model not found.')

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request.')
  const { transform, step, ...rest } = parsed.data

  let meta = asset.meta as MeshMeta
  if (transform && step) {
    // Registration is rigid: it may rotate and move the model, never rescale or mirror it.
    const before = mat4Schema.parse(asset.transform)
    const sameScale = Math.abs(scaleOf(transform) / scaleOf(before) - 1) < 1e-3
    if (!sameScale || Math.sign(det3(transform)) !== Math.sign(det3(before))) {
      return jsonError(400, 'invalid_transform', 'An alignment cannot change the scale of a model or mirror it.')
    }
    meta = { ...meta, steps: [...(meta.steps ?? []), step].slice(-40) }
  }
  await db.caseAsset.update({ where: { id }, data: { ...rest, ...(transform ? { transform, meta } : {}) } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  const asset = await ownedAsset(id, user.id)
  if (!asset || asset.kind === 'render') return jsonError(404, 'not_found', 'File not found.')
  await removeAssetFiles([asset])
  await db.caseAsset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
