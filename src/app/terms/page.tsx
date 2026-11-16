import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHero } from '@/components/page-hero'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The rules for using Aesthetic AI: who may use it, what a simulation is, acceptable photos, plans, billing and cancellation.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms & Conditions" lead={`Last updated ${SITE.lastLegalUpdate}.`} />
      <article className="wrap prose-legal py-16">
        <h2>1. The service</h2>
        <p>{SITE.name} generates AI simulations of aesthetic procedures on photographs you upload. By creating an account you accept these terms.</p>

        <h2>2. Not medical advice</h2>
        <p>
          A simulation is an illustration created by an AI model. It is not a medical device, a diagnosis, a clinical prediction or a guarantee of any surgical result, and it does not replace a consultation with a qualified surgeon. Do not make a medical decision on the basis of a simulation.
        </p>

        <h2>3. Who may use it</h2>
        <p>You must be at least 18 years old. You are responsible for keeping your password confidential and for activity in your account.</p>

        <h2>4. Photos you may upload</h2>
        <ul>
          <li>Only photos of yourself, or of an adult who has given you clear permission.</li>
          <li>No photos of anyone under 18.</li>
          <li>No nudity. Body simulations require a clothed photo in fitted clothing or sportswear.</li>
          <li>No photos you have no right to use, and no use of the service to deceive, harass or defame anyone.</li>
        </ul>
        <p>We may refuse a photo, remove content or close an account that breaks these rules.</p>

        <h2>5. Your content</h2>
        <p>
          You keep all rights in your photos. You give us only the permission needed to store and process them to produce your simulations, as described in the <Link href="/privacy">Privacy Policy</Link>. Results are yours to download and use for personal purposes.
        </p>

        <h2>6. Plans, credits and billing</h2>
        <ul>
          <li>Each simulation uses one credit. A generation that fails returns its credit.</li>
          <li>Paid plans are subscriptions billed in advance, monthly or yearly, through Stripe. Credits are renewed with each paid period and do not carry over.</li>
          <li>A plan becomes active when Stripe confirms the payment.</li>
          <li>You can cancel at any time from your dashboard. The plan stays active until the end of the paid period.</li>
          <li>Where consumer law gives you a right of withdrawal, it applies; ask us at {SITE.supportEmail}.</li>
        </ul>

        <h2>7. Availability</h2>
        <p>We work to keep the service available but do not guarantee uninterrupted operation. Generation depends on third-party AI providers and can fail or be declined by their safety systems.</p>

        <h2>8. Liability</h2>
        <p>
          To the extent the law allows, we are not liable for decisions made on the basis of a simulation or for indirect losses. Nothing in these terms limits liability that cannot be limited by law, or your statutory rights as a consumer.
        </p>

        <h2>9. Ending your account</h2>
        <p>You can delete your account at any time from the dashboard; this cancels any subscription and removes your photos and simulations.</p>

        <h2>10. Contact</h2>
        <p>
          Questions about these terms: {SITE.supportEmail} or the <Link href="/contact">contact page</Link>.
        </p>
      </article>
    </>
  )
}
