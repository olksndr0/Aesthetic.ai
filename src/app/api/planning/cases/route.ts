import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { MAX_CASES_PER_USER } from '@/lib/planning'
import { isResponse, planningUser } from '@/lib/planning-http'
import { retentionDate } from '@/lib/simulations'

export const runtime = 'nodejs'

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  // Storing and processing anatomical data needs explicit consent, recorded with its time.
  consent: z.literal(true),
})

export async function POST(request: Request) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'invalid', 'Give the case a title and confirm the consent.')
  if ((await db.planningCase.count({ where: { userId: user.id } })) >= MAX_CASES_PER_USER) {
    return jsonError(409, 'too_many', `You can keep up to ${MAX_CASES_PER_USER} cases. Delete one first.`)
  }

  const created = await db.planningCase.create({
    data: { userId: user.id, title: parsed.data.title, consentAt: new Date(), expiresAt: retentionDate() },
  })
  return NextResponse.json({ id: created.id })
}
