'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { messageOf, sendJson } from './api'
import { Check } from './atoms'

export function CreateCase({ retentionDays, profiles }: { retentionDays: number; profiles: Array<{ id: string; label: string }> }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const created = await sendJson<{ id: string }>('POST', '/api/planning/cases', { title: title.trim(), consent: true, ...(profileId ? { profileId } : {}) })
      router.push(`/planning/${created.id}`)
    } catch (problem) {
      setError(messageOf(problem))
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <p className="eyebrow">New case</p>
      <label className="block">
        <span className="label">Title</span>
        <input className="field" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder="A reference of your own; avoid full names" />
      </label>
      <label className="block">
        <span className="label">Profile this case is about</span>
        <select className="field" value={profileId} onChange={event => setProfileId(event.target.value)}>
          <option value="" className="bg-coal">No profile yet</option>
          {profiles.map(profile => (
            <option key={profile.id} value={profile.id} className="bg-coal">
              {profile.label}
            </option>
          ))}
        </select>
      </label>
      <Check checked={consent} onChange={setConsent}>
        These scans, models, measurements and photographs are mine, or I have the clear permission of the adult they belong to. I agree that they are stored privately and processed to build this simulation, and deleted after{' '}
        {retentionDays} days or when I delete them. Sending anything to an external image provider is asked separately, later.
      </Check>
      <button type="button" onClick={create} disabled={busy || !consent || title.trim() === ''} className="btn-primary w-full">
        {busy ? 'Creating…' : 'Create the case'}
      </button>
      {error && <p role="alert" className="text-sm">{error}</p>}
    </div>
  )
}
