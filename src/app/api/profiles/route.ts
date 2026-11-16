import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { isResponse, planningUser } from '@/lib/planning-http'
import { MAX_PROFILES } from '@/lib/profile/fields'
import { canAddProfile } from '@/lib/profiles'

export const runtime = 'nodejs'

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  // Health data and photographs need explicit consent, recorded with its time.
  consent: z.literal(true),
})

export async function POST(request: Request) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'invalid', 'Name the profile and confirm the consent.')
  if (!(await canAddProfile(user))) return jsonError(409, 'too_many', `An account keeps up to ${MAX_PROFILES} profiles. Delete one first.`)

  const created = await db.patientProfile.create({ data: { userId: user.id, label: parsed.data.label, consentAt: new Date() } })
  return NextResponse.json({ id: created.id })
}
