import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BeforeAfter } from '@/components/before-after'
import { DeleteSimulationButton } from '@/components/dashboard-client'
import { requireUser } from '@/lib/auth'
import { getContent } from '@/lib/content'
import { db } from '@/lib/db'
import { VIEW_LABELS, getProcedure, intensityWord, type View } from '@/lib/procedures'

export const metadata: Metadata = { title: 'Simulation', robots: { index: false } }

export default async function SimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/dashboard/simulations/${id}`)

  // Owner is part of the query: someone else's id is a 404.
  const simulation = await db.simulation.findFirst({ where: { id, userId: user.id, status: 'COMPLETED' } })
  if (!simulation?.resultKey || !simulation.originalKey) notFound()

  // Simulations stored before the profile view existed have the front view only.
  const views: View[] = simulation.profileResultKey && simulation.profileOriginalKey ? ['front', 'profile'] : ['front']

  const content = await getContent()
  const procedure = getProcedure(simulation.procedure)
  const settings = simulation.params as { intensity?: number; focus?: string }
  const focus = procedure?.focus.find(option => option.id === settings.focus)

  return (
    <div className="wrap grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
      <div className={views.length > 1 ? 'grid gap-6 sm:grid-cols-2' : ''}>
        {views.map(view => (
          <div key={view}>
            {views.length > 1 && <p className="eyebrow mb-3">{VIEW_LABELS[view]}</p>}
            <BeforeAfter
              beforeSrc={`/api/simulations/${id}/image?type=original&view=${view}`}
              afterSrc={`/api/simulations/${id}/image?type=result&view=${view}`}
              downloadHref={`/api/simulations/${id}/image?type=result&view=${view}&download=1`}
            />
          </div>
        ))}
      </div>
      <div>
        <Link href="/dashboard" className="link text-sm text-fog">
          Back to dashboard
        </Link>
        <h1 className="h2 mt-5">{procedure?.name ?? simulation.procedure}</h1>
        <dl className="mt-8 divide-y divide-white/10 border-y border-line text-sm">
          {[
            ['Created', new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' }).format(simulation.createdAt)],
            ['Focus', focus?.label ?? 'Standard'],
            ['Intensity', typeof settings.intensity === 'number' ? `${settings.intensity}% (${intensityWord(settings.intensity).split(',')[0]})` : 'Standard'],
            ['Deleted automatically', simulation.expiresAt ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(simulation.expiresAt) : 'On request'],
          ].map(([term, value]) => (
            <div key={term} className="flex justify-between gap-6 py-4">
              <dt className="text-ash">{term}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm leading-relaxed text-ash">{content['disclaimer.short']}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/simulator?procedure=${simulation.procedure}`} className="btn-ghost btn-sm min-h-[44px]">
            Simulate again
          </Link>
          <DeleteSimulationButton id={id} redirectTo="/dashboard" />
        </div>
      </div>
    </div>
  )
}
