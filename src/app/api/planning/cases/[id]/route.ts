import { NextResponse } from 'next/server'
import { z } from 'zod'

import { planSchema } from '@/lib/anatomy/plan'
import { landmarksSchema, measuresSchema } from '@/lib/anatomy/schema'
import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { deleteCase, ownedCase } from '@/lib/planning'
import { isResponse, planningUser } from '@/lib/planning-http'

export const runtime = 'nodejs'

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    landmarks: landmarksSchema,
    measures: measuresSchema,
    plan: planSchema.nullable(),
    providerConsent: z.literal(true),
    profileId: z.string().min(1).max(40),
  })
  .partial()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await ownedCase(id, user.id))) return jsonError(404, 'not_found', 'Case not found.')

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return jsonError(400, 'invalid', `${issue?.path.join('.') ?? 'Request'}: ${issue?.message ?? 'invalid'}`)
  }
  const { providerConsent, plan, ...rest } = parsed.data
  if (rest.profileId && !(await db.patientProfile.findFirst({ where: { id: rest.profileId, userId: user.id } }))) return jsonError(400, 'invalid', 'Unknown profile.')
  await db.planningCase.update({
    where: { id },
    data: {
      ...rest,
      ...(plan === undefined ? {} : { plan: plan ?? undefined }),
      ...(providerConsent ? { providerConsentAt: new Date() } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await deleteCase(id, user.id))) return jsonError(404, 'not_found', 'Case not found.')
  return NextResponse.json({ ok: true })
}
