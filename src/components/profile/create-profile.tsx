'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { messageOf, sendJson } from '../planning/api'
import { Check } from '../planning/atoms'

export function CreateProfile({ disabled, limit }: { disabled: boolean; limit: number }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const created = await sendJson<{ id: string }>('POST', '/api/profiles', { label: label.trim(), consent: true })
      router.push(`/profiles/${created.id}`)
    } catch (problem) {
      setError(messageOf(problem))
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <p className="eyebrow">New profile</p>
      {disabled ? (
        <p className="text-sm leading-relaxed text-fog">This account already holds {limit} profiles, the maximum. Delete one to add another.</p>
      ) : (
        <>
          <label className="block">
            <span className="label">Name of the profile</span>
            <input className="field" value={label} maxLength={80} onChange={event => setLabel(event.target.value)} placeholder="e.g. Me, or a reference of your own" />
          </label>
          <Check checked={consent} onChange={setConsent}>
            This record and these photographs are mine, or belong to an adult who has clearly authorised me. I agree that this health data is stored privately and used to prepare simulations, until I delete it.
          </Check>
          <button type="button" onClick={create} disabled={busy || !consent || label.trim() === ''} className="btn-primary w-full">
            {busy ? 'Creating…' : 'Create the profile'}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-sm">{error}</p>}
    </div>
  )
}
