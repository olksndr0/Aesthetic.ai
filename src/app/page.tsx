import Link from 'next/link'

import { FaqAccordion } from '@/components/faq-accordion'
import { Hero } from '@/components/hero'
import { HowItWorks } from '@/components/how-it-works'
import { PricingTable } from '@/components/pricing-table'
import { ProcedureCard } from '@/components/procedure-card'
import { Reveal } from '@/components/reveal'
import { Trust } from '@/components/trust'
import { getCurrentUser } from '@/lib/auth'
import { getContent, getFaqs, getPlans } from '@/lib/content'
import { env } from '@/lib/env'
import { PROCEDURES } from '@/lib/procedures'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [content, faqs, plans, user, query] = await Promise.all([getContent(), getFaqs(), getPlans(), getCurrentUser(), searchParams])

  return (
    <>
      {query.deleted === '1' && (
        <p role="status" className="border-b border-line bg-coal py-3 text-center text-sm">
          Your account, photos and simulations have been deleted.
        </p>
      )}

      <Hero title={content['hero.title']} subtitle={content['hero.subtitle']} />

      <section aria-labelledby="simulator-title" className="section">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
          <Reveal>
            <p className="eyebrow">The simulator</p>
            <h2 id="simulator-title" className="h2 mt-4">
              {content['simulator.title']}
            </h2>
            <p className="lead mt-5 max-w-lg">{content['simulator.subtitle']}</p>
            <Link href="/simulator" className="btn-primary mt-8">
              Open the simulator
            </Link>
          </Reveal>
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {[
              ['Same person', 'The model edits your photo. Eyes, skin, hair and expression stay as photographed.'],
              ['One area at a time', 'Only the anatomy of the chosen procedure changes; the rest of the image is left alone.'],
              ['Same scene', 'Lighting, background and camera angle are kept, so the comparison is honest.'],
              ['Your settings', 'Choose the focus of the procedure and an intensity from subtle to defined.'],
            ].map(([term, detail]) => (
              <div key={term} className="bg-ink p-7">
                <dt className="text-lg font-medium tracking-tight">{term}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ash">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <HowItWorks title={content['how.title']} />

      <section aria-labelledby="procedures-title" className="section border-t border-line">
        <div className="wrap">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <Reveal>
              <p className="eyebrow">Procedures</p>
              <h2 id="procedures-title" className="h2 mt-4">
                {content['procedures.title']}
              </h2>
            </Reveal>
            <Link href="/procedures" className="btn-ghost shrink-0">
              See all 12 procedures
            </Link>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PROCEDURES.filter(procedure => ['rhinoplasty', 'lip-fillers', 'jawline-contouring', 'blepharoplasty', 'facelift', 'liposuction'].includes(procedure.slug)).map(procedure => (
              <ProcedureCard key={procedure.slug} procedure={procedure} />
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="pricing-title" className="section border-t border-line">
        <div className="wrap">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Pricing</p>
            <h2 id="pricing-title" className="h2 mt-4">
              {content['pricing.title']}
            </h2>
          </Reveal>
          <div className="mt-12">
            <PricingTable plans={plans} isSignedIn={Boolean(user)} currentPlan={user?.planSlug ?? null} />
          </div>
        </div>
      </section>

      <Trust title={content['privacy.title']} retentionDays={env.retentionDays} />

      <section aria-labelledby="faq-title" className="section border-t border-line">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_1.8fr]">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-title" className="h2 mt-4">
              Questions before you upload
            </h2>
            <Link href="/faq" className="btn-ghost mt-8">
              Read all answers
            </Link>
          </div>
          <FaqAccordion items={faqs.slice(0, 5)} />
        </div>
      </section>

      <section aria-labelledby="cta-title" className="section border-t border-line">
        <div className="wrap text-center">
          <h2 id="cta-title" className="h1 mx-auto max-w-4xl">
            See the simulation on your own photo.
          </h2>
          <p className="lead mx-auto mt-6 max-w-xl">{content['disclaimer.short']}</p>
          <Link href="/simulator" className="btn-primary mt-9">
            Try AI Simulation
          </Link>
        </div>
      </section>
    </>
  )
}
