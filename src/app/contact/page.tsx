import type { Metadata } from 'next'

import { contactAction } from '@/app/actions/contact'
import { ActionForm, Field } from '@/components/action-form'
import { PageHero } from '@/components/page-hero'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Write to the Aesthetic AI team about your account, billing, privacy or a partnership.',
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Write to the team." lead="Account, billing, privacy or partnership questions. We reply within two working days." />
      <section className="wrap grid gap-12 py-16 lg:grid-cols-[1fr_1.2fr]">
        <dl className="space-y-8">
          <div>
            <dt className="eyebrow">Support</dt>
            <dd className="mt-2 text-xl">{SITE.supportEmail}</dd>
          </div>
          <div>
            <dt className="eyebrow">Privacy requests</dt>
            <dd className="mt-2 text-xl">{SITE.privacyEmail}</dd>
          </div>
          <div>
            <dt className="eyebrow">Medical questions</dt>
            <dd className="mt-2 max-w-sm leading-relaxed text-fog">We cannot give medical advice. Please speak to a qualified surgeon about your own case.</dd>
          </div>
        </dl>
        <div className="card p-6 sm:p-8">
          <ActionForm action={contactAction} submit="Send message">
            <Field name="name" label="Name" autoComplete="name" />
            <Field name="email" label="Email" type="email" autoComplete="email" />
            <Field name="subject" label="Subject" />
            <Field name="message" label="Message" rows={6} />
            <div aria-hidden="true" className="hidden">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
          </ActionForm>
        </div>
      </section>
    </>
  )
}
