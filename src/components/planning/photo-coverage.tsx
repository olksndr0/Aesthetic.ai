'use client'

import { useState } from 'react'

import { VIEW_DEFINITIONS } from '@/lib/anatomy/views'
import { ACCEPTED_TYPES } from '@/lib/upload-rules'

import { messageOf, sendForm, sendJson } from './api'
import { Notice } from './atoms'
import type { PhotoAsset } from './types'

type Props = {
  photos: PhotoAsset[]
  /** POST target for one photograph (fields: view, file); answers with the whole set. */
  uploadUrl: string
  photoUrl: (id: string) => string
  onPhotos: (photos: PhotoAsset[]) => void
}

const FLAG_TEXT: Record<string, string> = { blurry: 'Looks out of focus', dark: 'Too dark', overexposed: 'Overexposed' }
export const ESSENTIAL_VIEWS = ['front', 'profile-left', 'profile-right']

/** One slot per view: what is there, what is missing, and which pictures look unusable. */
export function PhotoCoverage({ photos, uploadUrl, photoUrl, onPhotos }: Props) {
  const [busyView, setBusyView] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(view: string, file: File | undefined) {
    if (!file) return
    setBusyView(view)
    setError(null)
    try {
      const form = new FormData()
      form.set('view', view)
      form.set('file', file)
      // The stored facts (size, sharpness) come back from the server, not from the browser.
      onPhotos((await sendForm<{ photos: PhotoAsset[] }>(uploadUrl, form)).photos)
    } catch (problem) {
      setError(messageOf(problem))
    }
    setBusyView(null)
  }

  async function remove(photo: PhotoAsset) {
    try {
      await sendJson('DELETE', photoUrl(photo.id))
      onPhotos(photos.filter(item => item.id !== photo.id))
    } catch (problem) {
      setError(messageOf(problem))
    }
  }

  // Inconsistencies across the set: the same picture twice, or one far brighter or darker than the rest.
  const sorted = photos.map(photo => photo.meta.brightness).sort((a, b) => a - b)
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 0
  const issues = (photo: PhotoAsset): string[] => {
    const list = photo.meta.flags.map(flag => FLAG_TEXT[flag] ?? flag)
    const twin = photos.find(other => other.id !== photo.id && other.meta.hash === photo.meta.hash)
    if (twin) list.push(`Same picture as "${VIEW_DEFINITIONS.find(view => view.id === twin.view)?.label ?? twin.view}"`)
    if (photos.length >= 3 && Math.abs(photo.meta.brightness - median) > 60) list.push('Lighting differs from the other photos')
    return list
  }
  const missing = ESSENTIAL_VIEWS.filter(view => !photos.some(photo => photo.view === view))

  return (
    <div className="space-y-4">
      {missing.length > 0 && <Notice>Needed for a simulation and still missing: {missing.map(view => VIEW_DEFINITIONS.find(item => item.id === view)!.label.toLowerCase()).join(', ')}.</Notice>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {VIEW_DEFINITIONS.map(view => {
          const photo = photos.find(item => item.view === view.id)
          const problems = photo ? issues(photo) : []
          return (
            <li key={view.id} className="rounded-xl border border-line p-3">
              <p className="text-sm font-medium">{view.label}</p>
              {photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(photo.id)} alt={`${view.label} photograph`} loading="lazy" className="mt-2 aspect-[4/5] w-full rounded-lg object-cover" />
                  {problems.map(problem => (
                    <p key={problem} role="alert" className="mt-2 text-xs text-white">
                      ⚠ {problem}
                    </p>
                  ))}
                  <button type="button" onClick={() => void remove(photo)} className="mt-2 min-h-[44px] text-xs text-fog underline underline-offset-4">
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-ash">{view.photoGuide}</p>
                  <label className="mt-2 inline-flex min-h-[44px] cursor-pointer items-center text-xs text-white underline underline-offset-4">
                    {busyView === view.id ? 'Uploading…' : ESSENTIAL_VIEWS.includes(view.id) ? 'Add photo' : 'Add photo (optional)'}
                    <input type="file" accept={ACCEPTED_TYPES.join(',')} className="sr-only" disabled={busyView !== null} onChange={event => void upload(view.id, event.target.files?.[0])} />
                  </label>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error && <Notice tone="warning">{error}</Notice>}
    </div>
  )
}
