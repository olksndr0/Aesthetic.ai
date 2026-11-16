import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_FAQS } from '@/lib/content-defaults'
import { DEFAULT_PLANS, creditsForInterval, formatPrice, yearlySavingPercent } from '@/lib/plans'
import { PROCEDURES, VIEWS, buildPrompt, getProcedure, intensityWord, isView } from '@/lib/procedures'
import { createQueue } from '@/lib/queue'
import { clientIp, rateLimit, resetRateLimits } from '@/lib/rate-limit'
import { sniffImage } from '@/lib/upload-rules'
import { loginSchema, passwordSchema, registerSchema, safeNext, simulationSchema } from '@/lib/validation'

describe('procedures', () => {
  it('offers the twelve procedures of the brief, each with focus options', () => {
    expect(PROCEDURES).toHaveLength(12)
    expect(new Set(PROCEDURES.map(procedure => procedure.slug)).size).toBe(12)
    for (const procedure of PROCEDURES) {
      expect(procedure.focus.length).toBeGreaterThan(0)
      expect(procedure.edit).toContain('{amount}')
    }
  })

  it('gives Starter four facial procedures only', () => {
    const starter = PROCEDURES.filter(procedure => procedure.starter)
    expect(starter.map(procedure => procedure.slug)).toEqual(['rhinoplasty', 'lip-fillers', 'chin-augmentation', 'jawline-contouring'])
  })

  it('builds a prompt that edits one area and protects identity and scene', () => {
    const prompt = buildPrompt(getProcedure('rhinoplasty')!, { intensity: 20, focus: 'tip' }, 'front')
    expect(prompt).toContain('subtle, conservative rhinoplasty')
    expect(prompt).toContain('nasal tip')
    expect(prompt).toMatch(/Keep the identity of the person exactly/)
    expect(prompt).toMatch(/original lighting, shadows, background, camera angle/)
    expect(prompt).not.toContain('{amount}')
  })

  it('asks for the same change in both views and tells the model which one it is editing', () => {
    const params = { intensity: 50, focus: 'bridge' }
    const front = buildPrompt(getProcedure('rhinoplasty')!, params, 'front')
    const profile = buildPrompt(getProcedure('rhinoplasty')!, params, 'profile')
    expect(front).toContain('front view of the face')
    expect(profile).toContain('side profile of the face')
    expect(profile).toContain('keep the head angle exactly as photographed')
    for (const prompt of [front, profile]) expect(prompt).toContain('moderate, natural-looking rhinoplasty')
    expect(VIEWS).toEqual(['front', 'profile'])
    expect(isView('profile')).toBe(true)
    expect(isView('three-quarter')).toBe(false)
  })

  it('keeps clothing fixed for body procedures', () => {
    const prompt = buildPrompt(getProcedure('breast-augmentation')!, { intensity: 60, focus: 'natural' }, 'profile')
    expect(prompt).toMatch(/Keep all clothing exactly as it is/)
    expect(prompt).toMatch(/do not remove clothing/)
  })

  it('falls back to the first focus when the option is unknown', () => {
    const prompt = buildPrompt(getProcedure('lip-fillers')!, { intensity: 90, focus: 'nope' }, 'front')
    expect(prompt).toContain('evenly to the upper and lower lip')
    expect(intensityWord(90)).toContain('anatomically realistic')
  })
})

describe('plans', () => {
  it('matches the brief: free, 19.90 and 39.90 with 1, 10 and 30 simulations', () => {
    expect(DEFAULT_PLANS.map(plan => [plan.slug, plan.priceMonthlyCents, plan.credits])).toEqual([
      ['starter', 0, 1],
      ['pro', 1990, 10],
      ['premium', 3990, 30],
    ])
    expect(DEFAULT_PLANS.filter(plan => plan.popular)).toHaveLength(1)
  })

  it('formats prices and yearly values', () => {
    expect(formatPrice(0)).toBe('Free')
    expect(formatPrice(1990)).toBe('€19.90')
    expect(creditsForInterval(10, 'MONTHLY')).toBe(10)
    expect(creditsForInterval(10, 'YEARLY')).toBe(120)
    expect(yearlySavingPercent(1990, 19900)).toBe(17)
    expect(yearlySavingPercent(0, 0)).toBe(0)
  })
})

describe('validation', () => {
  it('requires a strong password', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false)
    expect(passwordSchema.safeParse('onlyletterslong').success).toBe(false)
    expect(passwordSchema.safeParse('correct-horse-9').success).toBe(true)
  })

  it('requires the age and terms boxes at registration', () => {
    const base = { name: 'Ada', email: 'ADA@Example.com ', password: 'correct-horse-9' }
    expect(registerSchema.safeParse(base).success).toBe(false)
    const ok = registerSchema.safeParse({ ...base, terms: 'on', adult: 'on' })
    expect(ok.success && ok.data.email).toBe('ada@example.com')
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false)
  })

  it('refuses a simulation without all three consents', () => {
    const base = { procedure: 'rhinoplasty', focus: 'tip', intensity: '50', consentSelf: 'true', consentAdult: 'true' }
    expect(simulationSchema.safeParse(base).success).toBe(false)
    expect(simulationSchema.safeParse({ ...base, consentProcessing: 'true' }).success).toBe(true)
    expect(simulationSchema.safeParse({ ...base, consentProcessing: 'true', intensity: '500' }).success).toBe(false)
  })

  it('only follows same-site redirects after login', () => {
    expect(safeNext('/simulator?procedure=facelift')).toBe('/simulator?procedure=facelift')
    expect(safeNext('https://evil.example')).toBe('/dashboard')
    expect(safeNext('//evil.example')).toBe('/dashboard')
    expect(safeNext(undefined, '/simulator')).toBe('/simulator')
  })
})

describe('uploads', () => {
  it('recognises images by signature, not by name', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    const html = new TextEncoder().encode('<html><script>alert(1)</script>')
    expect(sniffImage(jpeg)).toBe('image/jpeg')
    expect(sniffImage(png)).toBe('image/png')
    expect(sniffImage(webp)).toBe('image/webp')
    expect(sniffImage(html)).toBeNull()
    expect(sniffImage(new Uint8Array(4))).toBeNull()
  })
})

describe('rate limit', () => {
  beforeEach(() => resetRateLimits())

  it('blocks after the limit and frees the window later', () => {
    expect(rateLimit('k', 2, 1000, 0).ok).toBe(true)
    expect(rateLimit('k', 2, 1000, 100).ok).toBe(true)
    const blocked = rateLimit('k', 2, 1000, 200)
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 1 })
    expect(rateLimit('k', 2, 1000, 1200).ok).toBe(true)
    expect(rateLimit('other', 2, 1000, 200).ok).toBe(true)
  })

  it('reads the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientIp(new Headers())).toBe('local')
  })
})

describe('generation queue', () => {
  it('never exceeds the concurrency limit and serves priority jobs first', async () => {
    const run = createQueue(() => 1)
    const order: string[] = []
    let active = 0
    let peak = 0

    const job = (name: string) => async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      order.push(name)
      active -= 1
    }

    await Promise.all([run(false, job('first')), run(false, job('standard')), run(true, job('premium'))])
    expect(peak).toBe(1)
    expect(order).toEqual(['first', 'premium', 'standard'])
  })
})

describe('faq', () => {
  it('answers the ten questions and states the limits of a simulation', () => {
    expect(DEFAULT_FAQS).toHaveLength(10)
    const predict = DEFAULT_FAQS.find(faq => faq.question.startsWith('Can AI predict'))
    expect(predict?.answer).toMatch(/^No\./)
    const replace = DEFAULT_FAQS.find(faq => faq.question.includes('replacement'))
    expect(replace?.answer).toMatch(/^No\./)
  })
})
