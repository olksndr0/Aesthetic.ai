import 'server-only'

import { NextResponse } from 'next/server'

export function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status })
}

/**
 * Rejects cross-site writes. Session cookies are SameSite=Lax already; this
 * also refuses a request whose Origin is not this site.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
