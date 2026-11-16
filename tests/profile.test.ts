import { describe, expect, it } from 'vitest'

import { EXAMPLE_PROFILES } from '@/lib/profile/examples'
import { PROFILE_FIELDS, ageOn, bmiOf, completeness, profileDataSchema } from '@/lib/profile/fields'
import { SURGERY_CATALOG, surgeryProcedure } from '@/lib/surgery/catalog'
import { assessFeasibility } from '@/lib/surgery/feasibility'

const NOW = new Date('2026-11-16T12:00:00Z')
const [classTwo, classThree] = EXAMPLE_PROFILES.map(example => example.data) as [(typeof EXAMPLE_PROFILES)[0]['data'], (typeof EXAMPLE_PROFILES)[0]['data']]
const assess = (slug: string, data: typeof classTwo) => assessFeasibility(surgeryProcedure(slug)!, data, NOW)

describe('clinical profile', () => {
  it('has unique field keys and accepts the complete examples', () => {
    expect(new Set(PROFILE_FIELDS.map(field => field.key)).size).toBe(PROFILE_FIELDS.length)
    for (const example of EXAMPLE_PROFILES) {
      expect(profileDataSchema.safeParse(example.data).success).toBe(true)
      expect(completeness(example.data).overall).toBeGreaterThan(0.9)
    }
  })

  it('refuses out-of-range values, unknown options and unknown fields', () => {
    expect(profileDataSchema.safeParse({ heightCm: 16.8 }).success).toBe(false)
    expect(profileDataSchema.safeParse({ angleClass: 'Class IV' }).success).toBe(false)
    expect(profileDataSchema.safeParse({ somethingElse: 1 }).success).toBe(false)
    expect(profileDataSchema.safeParse({}).success).toBe(true)
  })

  it('derives age and body-mass index', () => {
    expect(ageOn('1996-04-18', NOW)).toBe(30)
    expect(ageOn('1996-11-17', NOW)).toBe(29)
    expect(bmiOf(classTwo)).toBe(21.1)
    expect(bmiOf({})).toBeNull()
  })
})

describe('surgery catalogue and preliminary indication', () => {
  it('lists the requested operations with a price range and conditions', () => {
    const slugs = SURGERY_CATALOG.map(item => item.slug)
    for (const slug of ['rhinoplasty', 'bsso', 'bimax', 'le-fort-1', 'le-fort-2', 'le-fort-3', 'titanium-chin']) expect(slugs).toContain(slug)
    for (const item of SURGERY_CATALOG) {
      expect(item.priceToCents).toBeGreaterThan(item.priceFromCents)
      expect(item.conditions.length).toBeGreaterThan(0)
      for (const key of item.requires) expect(PROFILE_FIELDS.some(field => field.key === key)).toBe(true)
    }
  })

  it('gives no indication without the required data, and names what is missing', () => {
    const empty = assess('bsso', {})
    expect(empty.indication).toBe('insufficient_data')
    expect(empty.score).toBeNull()
    expect(empty.missing).toContain('SNA')
    expect(empty.missing).toContain('CT or CBCT of the skull')
  })

  it('reads a jaw discrepancy from the record instead of assuming one', () => {
    // Class II with a large overjet: nothing argues against a sagittal split in the record.
    const split = assess('bsso', classTwo)
    expect(split.indication).not.toBe('insufficient_data')
    expect(split.factors.some(factor => factor.weight === 'major')).toBe(false)

    // The same person with a normal bite: jaw surgery has nothing to correct.
    const normal = assess('bsso', { ...classTwo, angleClass: 'Class I', overjetMm: 2.5, anb: 2 })
    expect(normal.indication).toBe('major_factors')
    expect(normal.factors.find(factor => factor.weight === 'major')?.text).toMatch(/no skeletal discrepancy/)
  })

  it('raises the recorded risks, per operation', () => {
    const setback = assess('bimax', classThree)
    expect(setback.factors.map(factor => factor.text).join(' ')).toMatch(/Sleep apnoea/)
    expect(assess('titanium-chin', classThree).factors.some(factor => /metal allergy/.test(factor.text))).toBe(true)
    expect(assess('titanium-chin', { ...classThree, metalAllergy: 'Titanium' }).indication).toBe('major_factors')
    expect(assess('rhinoplasty', classThree).factors.some(factor => /revision/.test(factor.text))).toBe(true)
    expect(assess('le-fort-3', classTwo).factors.some(factor => /midface deficiency/.test(factor.text))).toBe(true)

    const minor = assess('rhinoplasty', { ...classTwo, dateOfBirth: '2011-01-01' })
    expect(minor.indication).toBe('major_factors')
    expect(minor.score).toBeLessThanOrEqual(70)
    expect(assess('bsso', { ...classTwo, bisphosphonates: true }).indication).toBe('major_factors')
  })
})
