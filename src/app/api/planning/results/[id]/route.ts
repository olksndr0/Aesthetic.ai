import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { ownedResult, removeAssetFiles } from '@/lib/planning'
import { isResponse, planningUser } from '@/lib/planning-http'

export const runtime = 'nodejs'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  const result = await ownedResult(id, user.id)
  if (!result) return jsonError(404, 'not_found', 'Result not found.')
  await removeAssetFiles(result.files)
  await db.caseResult.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
