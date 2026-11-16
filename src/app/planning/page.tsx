import type { Metadata } from 'next'
import Link from 'next/link'

import { CreateCase } from '@/components/planning/create-case'
import { PROCEDURE_SUPPORT } from '@/lib/anatomy/plan'
import { requireUser } from '@/lib/auth'
import { getContent } from '@/lib/content'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export const metadata: Metadata = { title: '3D Planning', robots: { index: false } }

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const INPUTS = [
  ['CT or CBCT volume (DICOM)', 'Measured bone and skin in one acquisition. Read in your browser; only the extracted surfaces are uploaded.'],
  ['3D model (STL, OBJ, GLB)', 'A skull, a facial surface or an implant shape. You state its unit and axes; its size is checked.'],
  ['Landmarks and measurements', 'Craniometric points with coordinates, unit and origin, picked on the model or imported.'],
  ['Photographs', 'Kept in the person\u2019s profile. Likeness, skin and hair for the photographic version; never treated as 3D data.'],
] as const

export default async function PlanningPage() {
  const user = await requireUser('/planning')
  const [content, profiles, cases] = await Promise.all([
    getContent(),
    db.patientProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true } }),
    db.planningCase.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { results: true } }, assets: { where: { kind: { in: ['skull', 'face'] } }, select: { kind: true, provenance: true } } },
    }),
  ])

  return (
    <div className="wrap space-y-14 py-12 sm:py-16">
      <header>
        <p className="eyebrow">3D Planning</p>
        <h1 className="h2 mt-4 max-w-3xl">Simulate an implant or a bone movement on the patient&rsquo;s own anatomy.</h1>
        <p className="lead mt-4 max-w-2xl">
          A measured 3D model of the skull and face is the geometric base. You define the intervention; the model is changed once, and the front view and both profiles are rendered from that single state.
        </p>
        <p className="mt-6 inline-block rounded-xl border border-white/30 px-4 py-3 text-sm font-medium">{content['planning.disclaimer']}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <CreateCase retentionDays={env.retentionDays} profiles={profiles} />

        <section aria-label="Your cases">
          <p className="eyebrow">Your cases</p>
          {cases.length === 0 ? (
            <p className="mt-4 text-fog">No cases yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {cases.map(item => {
                const kinds = item.assets.map(asset => `${asset.kind === 'skull' ? 'skull' : 'face'}${asset.provenance === 'estimated' ? ' (estimated)' : ''}`)
                return (
                  <li key={item.id}>
                    <Link href={`/planning/${item.id}`} className="card card-link flex items-center justify-between gap-4 p-5">
                      <span>
                        <span className="block font-medium">{item.title}</span>
                        <span className="mt-1 block text-sm text-ash">
                          {dateFormat.format(item.createdAt)} · {kinds.length > 0 ? kinds.join(' + ') : 'no 3D data yet'} · {item._count.results} result{item._count.results === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-ash">
                        →
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="What you can load" className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {INPUTS.map(([title, body]) => (
          <div key={title} className="bg-ink p-6">
            <p className="font-medium">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ash">{body}</p>
          </div>
        ))}
      </section>

      <section aria-label="Supported procedures">
        <p className="eyebrow">What the 3D engine simulates</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROCEDURE_SUPPORT.map(item => (
            <li key={item.id} className="card p-5">
              <p className="flex items-center justify-between gap-3">
                <span className="font-medium">{item.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-ash">{item.supported ? 'Supported' : 'Not supported'}</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ash">{item.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ash">
          The skin response is a geometric illustration driven by values you enter. It is not a biomechanical or clinically validated prediction, and it does not forecast scarring, recovery time or an individual outcome. For procedures
          not supported here, the <Link href="/simulator" className="link text-white">photo simulator</Link> remains available.
        </p>
      </section>
    </div>
  )
}
