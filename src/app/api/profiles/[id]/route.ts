import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { isResponse, planningUser } from '@/lib/planning-http'
import { profileDataSchema } from '@/lib/profile/fields'
import { deleteProfile, ownedProfile } from '@/lib/profiles'

export const runtime = 'nodejs'

const patchSchema = z.object({ label: z.string().trim().min(1).max(80), data: profileDataSchema }).partial()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await ownedProfile(id, user.id))) return jsonError(404, 'not_found', 'Profile not found.')

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Some values are not valid.')
  await db.patientProfile.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await deleteProfile(id, user.id))) return jsonError(404, 'not_found', 'Profile not found.')
  return NextResponse.json({ ok: true })
}
