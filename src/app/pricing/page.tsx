import type { Metadata } from 'next'

import { PageHero } from '@/components/page-hero'
import { PricingTable } from '@/components/pricing-table'
import { getCurrentUser } from '@/lib/auth'
import { getContent, getPlans } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Starter is free with one simulation. Pro and Premium add all twelve procedures, high resolution and history.',
  alternates: { canonical: '/pricing' },
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [content, plans, user, query] = await Promise.all([getContent(), getPlans(), getCurrentUser(), searchParams])

  return (
    <>
      <PageHero eyebrow="Pricing" title={content['pricing.title']} lead="Start free with one simulation. Upgrade when you want every procedure, high resolution and your history." />
      <section className="wrap py-16">
        {query.checkout === 'cancelled' && (
          <p role="status" className="card mx-auto mb-10 max-w-2xl p-5 text-center text-sm">
            The checkout was closed before payment. Nothing was charged.
          </p>
        )}
        <PricingTable plans={plans} isSignedIn={Boolean(user)} currentPlan={user?.planSlug ?? null} />
      </section>
    </>
  )
}
