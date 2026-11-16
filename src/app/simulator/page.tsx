import type { Metadata } from 'next'

import { Simulator } from '@/components/simulator'
import { getCurrentUser } from '@/lib/auth'
import { getContent, getPlan } from '@/lib/content'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: 'AI Simulator',
  description: 'Upload a front and a side-profile photo, choose a procedure and generate an AI simulation of the result on your own face or body.',
  alternates: { canonical: '/simulator' },
}

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ procedure?: string }> }) {
  const [{ procedure }, content, user] = await Promise.all([searchParams, getContent(), getCurrentUser()])
  const plan = user ? await getPlan(user.planSlug) : null

  return (
    <section className="wrap py-12 sm:py-16">
      <p className="eyebrow">AI Simulator</p>
      <h1 className="h2 mt-4 max-w-3xl">{content['simulator.title']}</h1>
      <p className="lead mt-4 max-w-2xl">{content['simulator.subtitle']}</p>
      <div className="mt-10">
        <Simulator
          viewer={{
            isSignedIn: Boolean(user),
            credits: user?.credits ?? 0,
            hasAllProcedures: Boolean(plan?.allProcedures) || user?.role === 'ADMIN',
          }}
          initialProcedure={procedure ?? 'rhinoplasty'}
          disclaimer={content['disclaimer.short']}
          retentionDays={env.retentionDays}
        />
      </div>
    </section>
  )
}
