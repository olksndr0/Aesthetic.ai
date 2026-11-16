import type { Metadata } from 'next'
import Link from 'next/link'

import { FaqAccordion } from '@/components/faq-accordion'
import { PageHero } from '@/components/page-hero'
import { getFaqs } from '@/lib/content'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'How the AI simulation works, how realistic it is, what happens to your photo and how billing works.',
  alternates: { canonical: '/faq' },
}

export default async function FaqPage() {
  const faqs = await getFaqs()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
  }

  return (
    <>
      <PageHero eyebrow="FAQ" title="Answers about the simulation, your photo and your plan." />
      <section className="wrap py-16">
        <FaqAccordion items={faqs} />
        <p className="mt-10 text-fog">
          Something else?{' '}
          <Link href="/contact" className="link text-white">
            Write to us
          </Link>
          .
        </p>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  )
}
