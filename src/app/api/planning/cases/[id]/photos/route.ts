import { NextResponse } from 'next/server'

import { jsonError } from '@/lib/http'
import { ownedCase, photoRecords } from '@/lib/planning'
import { isResponse, planningUser } from '@/lib/planning-http'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, false)
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await ownedCase(id, user.id))) return jsonError(404, 'not_found', 'Case not found.')
  return NextResponse.json({ photos: await photoRecords(id) })
}
