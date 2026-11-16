// Sliding-window limiter kept in process memory. One instance is enough for a
// single server; behind several instances, back `hits` with Redis instead.
const hits = new Map<string, number[]>()

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number }

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const since = now - windowMs
  const recent = (hits.get(key) ?? []).filter(time => time > since)

  if (recent.length >= limit) {
    const oldest = recent[0] ?? now
    hits.set(key, recent)
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
  }

  recent.push(now)
  hits.set(key, recent)

  if (hits.size > 10_000) {
    for (const [entry, times] of hits) {
      if (times.every(time => time <= since)) hits.delete(entry)
    }
  }

  return { ok: true }
}

export function resetRateLimits(): void {
  hits.clear()
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local'
}
