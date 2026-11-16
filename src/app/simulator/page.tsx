import type { Metadata } from 'next'

import { Simulator, type SimulatorProfile } from '@/components/simulator'
import { getCurrentUser } from '@/lib/auth'
import { getContent, getPlan } from '@/lib/content'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: 'AI Simulator',
  description: 'Choose a profile with a front and a side-profile photo, pick a procedure and generate an AI simulation of the result on your own face or body.',
  alternates: { canonical: '/simulator' },
}

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ procedure?: string; profile?: string }> }) {
  const [{ procedure, profile }, content, user] = await Promise.all([searchParams, getContent(), getCurrentUser()])
  const plan = user ? await getPlan(user.planSlug) : null
  const stored = user ? await db.patientProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, include: { photos: { select: { id: true, view: true } } } }) : []
  const profiles: SimulatorProfile[] = stored.map(item => ({
    id: item.id,
    label: item.label,
    photos: {
      front: item.photos.find(photo => photo.view === 'front')?.id ?? null,
      profile: (item.photos.find(photo => photo.view === 'profile-left') ?? item.photos.find(photo => photo.view === 'profile-right'))?.id ?? null,
    },
  }))

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
          profiles={profiles}
          initialProfile={profile ?? null}
          initialProcedure={procedure ?? 'rhinoplasty'}
          disclaimer={content['disclaimer.short']}
          retentionDays={env.retentionDays}
        />
      </div>
    </section>
  )
}
