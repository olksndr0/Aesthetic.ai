import type { Metadata } from 'next'

import { PageHero } from '@/components/page-hero'
import { ProcedureCard } from '@/components/procedure-card'
import { getContent } from '@/lib/content'
import { PROCEDURES } from '@/lib/procedures'

export const metadata: Metadata = {
  title: 'Procedures',
  description: 'The twelve face and body procedures the simulator supports, with the area each one treats and its typical recovery time.',
  alternates: { canonical: '/procedures' },
}

export default async function ProceduresPage() {
  const content = await getContent()
  const groups = [
    { id: 'face', title: 'Face', items: PROCEDURES.filter(procedure => procedure.area === 'face') },
    { id: 'body', title: 'Body', items: PROCEDURES.filter(procedure => procedure.area === 'body') },
  ]

  return (
    <>
      <PageHero
        eyebrow="Procedures"
        title={content['procedures.title']}
        lead="Each card names the area treated and a typical recovery time. Recovery varies from person to person; your surgeon gives the figure that applies to you."
      />
      {groups.map(group => (
        <section key={group.id} aria-labelledby={`${group.id}-title`} className="wrap py-16">
          <h2 id={`${group.id}-title`} className="h2">
            {group.title} <span className="text-ash">· {group.items.length} procedures</span>
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map(procedure => (
              <ProcedureCard key={procedure.slug} procedure={procedure} />
            ))}
          </div>
        </section>
      ))}
      <p className="wrap pb-20 text-sm leading-relaxed text-ash">
        Recovery times are general indications drawn from common clinical practice and are not medical advice. Body simulations need a clothed photo in fitted clothing.
      </p>
    </>
  )
}
