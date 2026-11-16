import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHero } from '@/components/page-hero'
import { getContent } from '@/lib/content'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Why Aesthetic AI exists, what a simulation can and cannot tell you, and the rules we hold ourselves to.',
  alternates: { canonical: '/about' },
}

const PRINCIPLES = [
  ['A simulation is not a promise', 'Every result is labelled as an AI simulation. We never present an image as the outcome a surgeon will deliver.'],
  ['Your photo is not our dataset', 'Uploads are used to create your simulation and for nothing else. They are never used to train models.'],
  ['The same person, or nothing', 'The model is instructed to change one area and keep the rest of the photograph. A result that changes who you are is a failed result.'],
  ['The surgeon decides', 'What is safe and achievable is a medical judgement made in person. A simulation is a way to start that conversation.'],
]

export default async function AboutPage() {
  const content = await getContent()

  return (
    <>
      <PageHero eyebrow="About us" title="A clearer picture before the consultation." lead={content['about.mission']} />
      <section aria-labelledby="principles-title" className="wrap py-16 sm:py-24">
        <h2 id="principles-title" className="h2 max-w-2xl">
          Four rules behind the product
        </h2>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
          {PRINCIPLES.map(([title, body], index) => (
            <li key={title} className="bg-ink p-8">
              <span className="font-mono text-xs text-ash">0{index + 1}</span>
              <h3 className="mt-4 text-2xl font-medium tracking-tight">{title}</h3>
              <p className="mt-3 leading-relaxed text-fog">{body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="limits-title" className="wrap grid gap-10 border-t border-line py-16 sm:py-24 lg:grid-cols-2">
        <h2 id="limits-title" className="h2">
          What the technology can and cannot do
        </h2>
        <div className="space-y-5 leading-relaxed text-fog">
          <p>
            The simulator sends your photo to an image-to-image AI model together with a written instruction describing the chosen procedure. The model returns an edited version of the same photograph.
          </p>
          <p>
            It works from pixels, not anatomy. It cannot measure bone, cartilage, skin thickness or how you heal, and it does not know which techniques a surgeon would consider for you. Results can also contain small artefacts.
          </p>
          <p>For those reasons a simulation is illustrative only. It is not a medical device, a diagnosis or a prediction of a surgical result.</p>
          <div className="flex flex-wrap gap-3 pt-3">
            <Link href="/simulator" className="btn-primary">
              Try AI Simulation
            </Link>
            <Link href="/contact" className="btn-ghost">
              Contact the team
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
