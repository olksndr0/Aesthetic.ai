import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { jsonError } from '@/lib/http'
import { purgeExpired } from '@/lib/simulations'

export const runtime = 'nodejs'

// Call daily: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/cleanup`
export async function GET(request: Request) {
  const secret = env.cronSecret
  if (!secret) return jsonError(503, 'not_configured', 'CRON_SECRET is not set.')

  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return jsonError(401, 'unauthorized', 'Invalid secret.')
  }

  return NextResponse.json({ purged: await purgeExpired() })
}
