// Defaults used by the seed and as a fallback while the database is empty.
// Live values are the Plan rows, edited from /admin/plans.
export type PlanConfig = {
  slug: string
  name: string
  description: string
  priceMonthlyCents: number
  priceYearlyCents: number
  credits: number
  features: string[]
  allProcedures: boolean
  highResolution: boolean
  history: boolean
  priority: boolean
  popular: boolean
  active: boolean
  sortOrder: number
}

export const DEFAULT_PLANS: PlanConfig[] = [
  {
    slug: 'starter',
    name: 'Starter',
    description: 'Try the simulator on one photo.',
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    credits: 1,
    features: ['1 AI simulation', 'Core facial procedures', 'Standard resolution', 'Before & After comparison'],
    allProcedures: false,
    highResolution: false,
    history: false,
    priority: false,
    popular: false,
    active: true,
    sortOrder: 0,
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'Compare procedures and settings.',
    priceMonthlyCents: 1990,
    priceYearlyCents: 19900,
    credits: 10,
    features: ['10 AI simulations a month', 'All 12 procedures', 'High-resolution images', 'Result downloads', 'Simulation history'],
    allProcedures: true,
    highResolution: true,
    history: true,
    priority: false,
    popular: true,
    active: true,
    sortOrder: 1,
  },
  {
    slug: 'premium',
    name: 'Premium',
    description: 'More simulations, generated first.',
    priceMonthlyCents: 3990,
    priceYearlyCents: 39900,
    credits: 30,
    features: ['30 AI simulations a month', 'All 12 procedures', 'Priority generation', 'High-resolution images', 'Simulation history', 'No advertising'],
    allProcedures: true,
    highResolution: true,
    history: true,
    priority: true,
    popular: false,
    active: true,
    sortOrder: 2,
  },
]

export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/** Credits granted when an invoice is paid: a yearly invoice covers twelve months. */
export function creditsForInterval(monthlyCredits: number, interval: 'MONTHLY' | 'YEARLY'): number {
  return interval === 'YEARLY' ? monthlyCredits * 12 : monthlyCredits
}

export function yearlySavingPercent(monthlyCents: number, yearlyCents: number): number {
  if (monthlyCents <= 0 || yearlyCents <= 0) return 0
  return Math.max(0, Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100))
}
