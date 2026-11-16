import type { Metadata } from 'next'

import Link from 'next/link'

import { PageHero } from '@/components/page-hero'
import { PricingTable } from '@/components/pricing-table'
import { SurgeryPriceList } from '@/components/surgery-price-list'
import { getCurrentUser } from '@/lib/auth'
import { getContent, getPlans } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'The simulation plans, and the indicative price list of the operations: rhinoplasty, BSSO, Le Fort, bimaxillary surgery and titanium implants.',
  alternates: { canonical: '/pricing' },
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [content, plans, user, query] = await Promise.all([getContent(), getPlans(), getCurrentUser(), searchParams])

  return (
    <>
      <PageHero eyebrow="Pricing" title={content['pricing.title']} lead="Two separate price lists: the simulation service, which is what this site sells, and the indicative prices of the operations themselves, which belong to the clinic." />

      <section aria-labelledby="service-title" className="wrap py-16">
        {query.checkout === 'cancelled' && (
          <p role="status" className="card mx-auto mb-10 max-w-2xl p-5 text-center text-sm">
            The checkout was closed before payment. Nothing was charged.
          </p>
        )}
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow">1 · Simulation service</p>
          <h2 id="service-title" className="h2 mt-4">
            Photos and morphs only.
          </h2>
          <p className="lead mt-4">These plans pay for simulations: the photographic before and after, and the photographic version of a 3D plan. They never include surgery, a consultation or any medical service.</p>
        </div>
        <PricingTable plans={plans} isSignedIn={Boolean(user)} currentPlan={user?.planSlug ?? null} />
      </section>

      <section aria-labelledby="surgery-title" className="border-t border-line">
        <div className="wrap py-16">
          <div className="max-w-3xl">
            <p className="eyebrow">2 · Operations</p>
            <h2 id="surgery-title" className="h2 mt-4">
              Indicative prices of the procedures.
            </h2>
            <p className="lead mt-4">
              Ranges set by the clinic, not by this site, and not a quote: a price is confirmed after a consultation. Each operation has conditions, and not every operation is possible for every person.
            </p>
          </div>
          <div className="mt-12">
            <SurgeryPriceList />
          </div>
          <div className="card mt-10 grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <p className="text-sm leading-relaxed text-fog">
              <strong className="text-white">Is an operation possible for you?</strong> Your profile gives a preliminary indication for each one, computed from the data you record: what is still missing and which points a surgeon would review.
              It is an estimate from a draft set of rules, not a medical assessment, and it never replaces a consultation.
            </p>
            <Link href="/profiles" className="btn-ghost shrink-0">
              Open your profiles
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
