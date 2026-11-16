import 'server-only'

import type { User } from '@prisma/client'
import type { NextResponse } from 'next/server'
import type { z } from 'zod'

import { getCurrentUser } from './auth'
import { jsonError, sameOrigin } from './http'
import { PlanningError } from './planning'

/** Signed-in user for a planning API call, or the response to send instead. Writes must be same-origin. */
export async function planningUser(request: Request, write: boolean): Promise<User | NextResponse> {
  if (write && !sameOrigin(request)) return jsonError(403, 'forbidden', 'Cross-site request refused.')
  const user = await getCurrentUser()
  return user ?? jsonError(401, 'unauthenticated', 'Sign in to use 3D planning.')
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof Response
}

export function parseJsonField<T extends z.ZodTypeAny>(schema: T, raw: FormDataEntryValue | null, name: string): z.infer<T> {
  if (typeof raw !== 'string') throw new PlanningError('invalid', `Missing "${name}".`)
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new PlanningError('invalid', `"${name}" is not valid JSON.`)
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new PlanningError('invalid', `"${name}": ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'is invalid'}`.trim())
  }
  return parsed.data
}

export function planningFailure(error: unknown): NextResponse {
  if (error instanceof PlanningError) return jsonError(400, error.code, error.message)
  console.error('[planning]', error instanceof Error ? error.message : error)
  return jsonError(500, 'server_error', 'The request could not be completed.')
}
