import type { Metadata } from 'next'

import { CookieSettingsButton } from '@/components/cookie-consent'
import { PageHero } from '@/components/page-hero'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'The one essential cookie Aesthetic AI sets, what is stored in your browser and how to change your choice.',
  alternates: { canonical: '/cookies' },
}

export default function CookiesPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Cookie Policy" lead={`Last updated ${SITE.lastLegalUpdate}.`} />
      <article className="wrap prose-legal py-16">
        <h2>What we set</h2>
        <div className="overflow-x-auto">
          <table className="table-admin">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono text-white">aai_session</td>
                <td>Essential cookie</td>
                <td>Keeps you signed in. HTTP-only, so scripts cannot read it.</td>
                <td>30 days, or until you log out</td>
              </tr>
              <tr>
                <td className="font-mono text-white">aai_cookie_choice</td>
                <td>Browser storage</td>
                <td>Remembers the choice you made in the cookie banner.</td>
                <td>Until you clear it</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>What we do not set</h2>
        <p>There are no advertising cookies and no third-party trackers on this site. If optional cookies are ever introduced, they stay off unless you choose “Accept all”, and this page is updated first.</p>

        <h2>Payments</h2>
        <p>When you buy a plan you are taken to Stripe’s checkout page, which sets its own cookies under Stripe’s policy to prevent fraud and complete the payment.</p>

        <h2>Change your choice</h2>
        <CookieSettingsButton />
      </article>
    </>
  )
}
