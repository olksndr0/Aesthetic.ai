import { NextResponse } from 'next/server'
import { z } from 'zod'

import { MESH_KINDS, PROVENANCES, mat4Schema, meshMetaSchema } from '@/lib/anatomy/schema'
import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { MAX_ASSETS_PER_CASE, MAX_MESH_BYTES, assetKey, inspectMesh, ownedCase } from '@/lib/planning'
import { isResponse, parseJsonField, planningFailure, planningUser } from '@/lib/planning-http'
import { storage } from '@/lib/storage'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  const found = await ownedCase(id, user.id)
  if (!found) return jsonError(404, 'not_found', 'Case not found.')

  if (Number(request.headers.get('content-length') ?? 0) > MAX_MESH_BYTES + 64 * 1024) {
    return jsonError(413, 'too_large', 'The file is too large.')
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError(400, 'bad_request', 'The upload could not be read.')
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return jsonError(400, 'invalid', 'Attach a file.')
  if ((await db.caseAsset.count({ where: { caseId: id, kind: { not: 'render' } } })) >= MAX_ASSETS_PER_CASE) {
    return jsonError(409, 'too_many', 'This case holds the maximum number of files. Delete some first.')
  }

  try {
    const kind = z.enum(MESH_KINDS).safeParse(form.get('kind'))
    if (!kind.success) return jsonError(400, 'invalid', 'Unknown kind of file.')

    if (file.size > MAX_MESH_BYTES) return jsonError(413, 'too_large', 'The model is too large after conversion. Reduce its resolution.')
    const provenance = z.enum(PROVENANCES).safeParse(form.get('provenance'))
    if (!provenance.success) return jsonError(400, 'invalid', 'State whether the geometry is acquired or estimated.')
    const label = z.string().trim().min(1).max(80).safeParse(form.get('label'))
    if (!label.success) return jsonError(400, 'invalid', 'Give the model a name.')
    const meta = parseJsonField(meshMetaSchema, form.get('meta'), 'meta')
    const transform = parseJsonField(mat4Schema, form.get('transform'), 'transform')

    if (kind.data !== 'implant' && (await db.caseAsset.count({ where: { caseId: id, kind: kind.data } })) > 0) {
      return jsonError(409, 'exists', `This case already has a ${kind.data === 'skull' ? 'skull' : 'facial surface'}. Delete it before adding another.`)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const measured = inspectMesh(bytes, kind.data, transform)
    // A mirrored transform is accepted only when the operator declared the file mirrored at import.
    const created = await db.caseAsset.create({
      data: { caseId: id, kind: kind.data, provenance: provenance.data, label: label.data, key: '', bytes: bytes.length, transform, meta: { ...meta, measured } },
    })
    const key = assetKey(user.id, id, created.id, 'amsh')
    await storage().put(key, Buffer.from(bytes), 'application/octet-stream')
    await db.caseAsset.update({ where: { id: created.id }, data: { key } })
    return NextResponse.json({ id: created.id, measured })
  } catch (error) {
    return planningFailure(error)
  }
}
