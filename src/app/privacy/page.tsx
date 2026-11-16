import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHero } from '@/components/page-hero'
import { env } from '@/lib/env'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Aesthetic AI does with your photos and account data, who processes them, how long they are kept and how to delete them.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  const days = env.retentionDays

  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy" lead={`Last updated ${SITE.lastLegalUpdate}. Written to be read: what we collect, why, for how long, and how you stay in control.`} />
      <article className="wrap prose-legal py-16">
        <h2>1. Who is responsible</h2>
        <p>
          {SITE.legalName} is the data controller for the personal data described here. Privacy requests: {SITE.privacyEmail}.
        </p>

        <h2>2. What we process and why</h2>
        <ul>
          <li>
            <strong className="text-white">Account data</strong>: name, email and a salted hash of your password, to create and secure your account (performance of a contract).
          </li>
          <li>
            <strong className="text-white">Photos you upload and the simulations made from them</strong>, to generate and show you the simulation you asked for. We ask for your explicit consent before every upload, and processing rests on that consent.
          </li>
          <li>
            <strong className="text-white">Simulation settings</strong>: the procedure, focus and intensity you chose, and the time you gave consent.
          </li>
          <li>
            <strong className="text-white">Billing data</strong>: your plan, subscription status and Stripe customer reference. Card details are entered on Stripe and never reach our servers.
          </li>
          <li>
            <strong className="text-white">Technical data</strong>: IP address used briefly for rate limiting and abuse prevention (legitimate interest), and messages you send through the contact form.
          </li>
        </ul>

        <h2>3. Photographs of faces and bodies</h2>
        <p>
          We treat every uploaded photograph as sensitive. We do not run face recognition, do not build biometric templates and do not identify people from photos. Before storage each photo is re-encoded and its metadata, including location and device data, is removed.
        </p>
        <p>
          <strong className="text-white">Your photos and simulations are never used to train AI models.</strong> If that were ever proposed, it would require a separate, explicit and informed consent that you could refuse without losing the service.
        </p>
        <p>Upload only photos of yourself, or of an adult who has clearly authorised you. Photos of anyone under 18 are not permitted.</p>
        <p>
          <strong className="text-white">Profiles.</strong> A profile holds a clinical record (measurements, medical history, bite and cephalometric data) and the photographs of every view. This is data concerning health:
          it is processed only with your explicit consent, given when the profile is created, it is kept until you delete the profile or your account, and it is used for nothing but your simulations and the preliminary indications shown to
          you.
        </p>
        <p>
          <strong className="text-white">3D planning.</strong> Scans, 3D models of the skull and face, landmarks and measurements are data concerning health. They are processed only with your explicit consent, given when a case is created. A
          CT or CBCT volume is read in your browser and is not uploaded: only the bone and skin surfaces extracted from it are stored. Nothing from a case is sent to an external image provider unless you give a second, separate consent;
          in that case only rendered views of the model, the photographs of the linked profile and the description of the planned procedure are sent, never the scan, the 3D models, the measurements or your name.
        </p>

        <h2>4. Who receives your data</h2>
        <ul>
          <li>The AI image-generation provider that edits the photo, acting as our processor and only to produce your simulation.</li>
          <li>Our hosting, database and storage providers.</li>
          <li>Stripe, for payments, and our email provider, for account emails.</li>
        </ul>
        <p>We do not sell personal data and do not share photos with advertisers. Where a provider processes data outside the EEA, the transfer is covered by standard contractual clauses or an equivalent safeguard.</p>

        <h2>5. How long we keep it</h2>
        <ul>
          <li>
            Photos and simulations: deleted automatically {days} days after creation, or immediately when you delete them. A failed generation keeps no photo.
          </li>
          <li>Account data: until you delete your account.</li>
          <li>Billing records: for the period tax law requires.</li>
        </ul>

        <h2>6. How we protect it</h2>
        <p>
          Data travels over encrypted connections. Images are kept in private storage and are served only to the signed-in account that owns them. Passwords are stored as bcrypt hashes and sessions use HTTP-only cookies.
        </p>

        <h2>7. Your rights</h2>
        <p>
          You can access, correct, export, restrict or delete your data, object to processing, and withdraw consent at any time without affecting earlier processing. Delete any simulation, or your whole account with every image, from your{' '}
          <Link href="/dashboard">dashboard</Link>. For anything else write to {SITE.privacyEmail}. You may also complain to your data protection authority.
        </p>

        <h2>8. Cookies</h2>
        <p>
          We use one essential cookie to keep you signed in. See the <Link href="/cookies">Cookie Policy</Link>.
        </p>

        <h2>9. Changes</h2>
        <p>If this policy changes in a way that matters, we tell registered users by email before the change applies.</p>
      </article>
    </>
  )
}
