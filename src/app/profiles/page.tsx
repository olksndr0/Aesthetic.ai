import type { Metadata } from 'next'
import Link from 'next/link'

import { CreateProfile } from '@/components/profile/create-profile'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { MAX_PROFILES, ageOn, completeness } from '@/lib/profile/fields'
import { canAddProfile, profileData } from '@/lib/profiles'

export const metadata: Metadata = { title: 'Profiles', robots: { index: false } }

export default async function ProfilesPage() {
  const user = await requireUser('/profiles')
  const [profiles, canAdd] = await Promise.all([
    db.patientProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { photos: true } } } }),
    canAddProfile(user),
  ])

  return (
    <div className="wrap space-y-12 py-12 sm:py-16">
      <header>
        <p className="eyebrow">Profiles</p>
        <h1 className="h2 mt-4 max-w-3xl">The clinical record and the photographs behind every simulation.</h1>
        <p className="lead mt-4 max-w-2xl">
          A simulation is made for a person. Each profile holds that person&rsquo;s measurements, medical history, bite and cephalometric data, and the photographs of every view.{' '}
          {user.devAccess ? 'Development access: no limit on the number of profiles.' : `An account keeps up to ${MAX_PROFILES}.`}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-label="Your profiles">
          {profiles.length === 0 ? (
            <p className="text-fog">No profiles yet. Create one to start.</p>
          ) : (
            <ul className="space-y-3">
              {profiles.map(profile => {
                const data = profileData(profile.data)
                const age = ageOn(data.dateOfBirth)
                return (
                  <li key={profile.id}>
                    <Link href={`/profiles/${profile.id}`} className="card card-link flex items-center justify-between gap-4 p-5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{profile.label}</span>
                        <span className="mt-1 block text-sm text-ash">
                          {[age !== null ? `${age} years` : null, typeof data.sexAtBirth === 'string' ? data.sexAtBirth.toLowerCase() : null, `${profile._count.photos} of 14 photographs`, `record ${Math.round(completeness(data).overall * 100)}%`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {profile.example && <span className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fog">Example</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <CreateProfile disabled={!canAdd} limit={MAX_PROFILES} />
      </div>
    </div>
  )
}
