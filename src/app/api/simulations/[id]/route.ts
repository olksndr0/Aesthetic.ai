import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth'
import { jsonError, sameOrigin } from '@/lib/http'
import { deleteSimulation } from '@/lib/simulations'

export const runtime = 'nodejs'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return jsonError(403, 'forbidden', 'Cross-site request refused.')

  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Sign in first.')

  const { id } = await params
  const removed = await deleteSimulation(id, user.id)
  if (!removed) return jsonError(404, 'not_found', 'Simulation not found.')

  return NextResponse.json({ ok: true })
}
