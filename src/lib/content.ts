import 'server-only'

import { cache } from 'react'

import { CONTENT_DEFAULTS, DEFAULT_FAQS, type ContentKey } from './content-defaults'
import { db } from './db'
import { DEFAULT_PLANS, type PlanConfig } from './plans'

export type Content = Record<ContentKey, string>

// Public pages must render even before the database is seeded or while it is
// down, so each reader falls back to the defaults.
export const getContent = cache(async (): Promise<Content> => {
  const content: Content = { ...CONTENT_DEFAULTS }
  try {
    for (const row of await db.siteContent.findMany()) {
      if (row.key in content && row.value.trim() !== '') {
        content[row.key as ContentKey] = row.value
      }
    }
  } catch {
    // defaults
  }
  return content
})

export const getFaqs = cache(async (): Promise<Array<{ id: string; question: string; answer: string }>> => {
  try {
    const rows = await db.faq.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } })
    if (rows.length > 0) return rows
  } catch {
    // defaults
  }
  return DEFAULT_FAQS.map((faq, index) => ({ id: `default-${index}`, ...faq }))
})

export const getPlans = cache(async (): Promise<PlanConfig[]> => {
  try {
    const rows = await db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    if (rows.length > 0) return rows
  } catch {
    // defaults
  }
  return DEFAULT_PLANS
})

export async function getPlan(slug: string): Promise<PlanConfig> {
  const plans = await getPlans()
  const fallback = plans[0] ?? DEFAULT_PLANS[0]
  if (!fallback) throw new Error('No plans configured')
  return plans.find(plan => plan.slug === slug) ?? fallback
}
