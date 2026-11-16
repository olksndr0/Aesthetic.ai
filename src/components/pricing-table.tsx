'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useState } from 'react'

import { formatPrice, yearlySavingPercent, type PlanConfig } from '@/lib/plans'

type Interval = 'MONTHLY' | 'YEARLY'
type Props = { plans: PlanConfig[]; isSignedIn: boolean; currentPlan: string | null }

export function PricingTable({ plans, isSignedIn, currentPlan }: Props) {
  const [interval, setInterval] = useState<Interval>('MONTHLY')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; setup?: string } | null>(null)

  const bestSaving = Math.max(0, ...plans.map(plan => yearlySavingPercent(plan.priceMonthlyCents, plan.priceYearlyCents)))

  async function buy(slug: string) {
    setError(null)
    setPending(slug)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: slug, interval }),
      })
      const json = (await response.json().catch(() => null)) as { url?: string; error?: { message: string; setup?: string } } | null
      if (response.ok && json?.url) {
        window.location.assign(json.url)
        return
      }
      setError(json?.error ?? { message: 'The checkout could not be started. Nothing was charged.' })
    } catch {
      setError({ message: 'The connection failed before the checkout opened. Nothing was charged.' })
    }
    setPending(null)
  }

  return (
    <div>
      <div className="flex justify-center">
        <div role="group" aria-label="Billing period" className="relative inline-flex rounded-full border border-white/15 p-1">
          {(['MONTHLY', 'YEARLY'] as const).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={interval === option}
              onClick={() => setInterval(option)}
              className={`relative z-10 min-h-[44px] rounded-full px-5 text-sm transition-colors ${interval === option ? 'text-ink' : 'text-fog hover:text-white'}`}
            >
              {interval === option && <motion.span layoutId="billing-pill" className="absolute inset-0 -z-10 rounded-full bg-white" transition={{ type: 'spring', duration: 0.45, bounce: 0.15 }} />}
              {option === 'MONTHLY' ? 'Monthly' : `Yearly${bestSaving > 0 ? ` · save ${bestSaving}%` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map(plan => {
          const cents = interval === 'YEARLY' ? plan.priceYearlyCents : plan.priceMonthlyCents
          const isFree = plan.priceMonthlyCents === 0
          const isCurrent = currentPlan === plan.slug
          return (
            <div
              key={plan.slug}
              className={`card relative flex flex-col p-7 transition duration-300 ease-out hover:-translate-y-0.5 hover:border-white/30 ${plan.popular ? 'border-white/35 bg-coal' : ''}`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-7 rounded-full bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-ink">Most popular</span>
              )}
              <h3 className="eyebrow !text-white">{plan.name}</h3>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-5xl font-medium tracking-[-0.04em]">{formatPrice(cents)}</span>
                {!isFree && <span className="text-sm text-ash">/ {interval === 'YEARLY' ? 'year' : 'month'}</span>}
              </p>
              <p className="mt-3 min-h-[40px] text-sm text-fog">{plan.description}</p>
              <ul className="mt-6 flex-1 space-y-3 border-t border-line pt-6 text-sm">
                {plan.features.map(feature => (
                  <li key={feature} className="flex gap-3 text-fog">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
                      <path d="m3 8.5 3.2 3L13 4.5" />
                    </svg>
                    {interval === 'YEARLY' ? feature.replace(/(\d+) AI simulations a month/, (_, count: string) => `${Number(count) * 12} AI simulations a year`) : feature}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {isCurrent ? (
                  <Link href="/dashboard" className="btn-ghost w-full">
                    Your current plan
                  </Link>
                ) : isFree ? (
                  <Link href={isSignedIn ? '/simulator' : '/register'} className="btn-ghost w-full">
                    {isSignedIn ? 'Open the simulator' : 'Start free'}
                  </Link>
                ) : isSignedIn ? (
                  <button type="button" onClick={() => buy(plan.slug)} disabled={pending !== null} className={plan.popular ? 'btn-primary w-full' : 'btn-ghost w-full'}>
                    {pending === plan.slug ? 'Opening secure checkout…' : `Buy ${plan.name}`}
                  </button>
                ) : (
                  <Link href={`/register?next=${encodeURIComponent('/pricing')}`} className={plan.popular ? 'btn-primary w-full' : 'btn-ghost w-full'}>
                    Buy {plan.name}
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div role="alert" className="card mx-auto mt-6 max-w-2xl border-white/30 p-5 text-sm">
          <p className="font-medium">{error.message}</p>
          {error.setup && <p className="mt-2 font-mono text-xs text-fog">{error.setup}</p>}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-ash">
        Prices include VAT where it applies. Payment is handled by Stripe; we never see your card. Cancel any time from your dashboard.
      </p>
    </div>
  )
}
