import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import type { PhotoAsset } from '@/components/planning/types'
import { ProfileEditor } from '@/components/profile/profile-editor'
import { requireUser } from '@/lib/auth'
import { ownedProfile, photoRecords, profileData } from '@/lib/profiles'

export const metadata: Metadata = { title: 'Profile', robots: { index: false } }

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/profiles/${id}`)
  // Owner is part of the query: someone else's id is a 404.
  const profile = await ownedProfile(id, user.id)
  if (!profile) notFound()

  return (
    <div className="wrap py-10 sm:py-12">
      <Link href="/profiles" className="link text-sm text-fog">
        All profiles
      </Link>
      <div className="mt-6">
        <ProfileEditor id={profile.id} label={profile.label} example={profile.example} initialData={profileData(profile.data)} initialPhotos={photoRecords(profile.photos) as PhotoAsset[]} />
      </div>
    </div>
  )
}
