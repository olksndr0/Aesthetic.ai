'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { PROFILE_SECTIONS, ageOn, bmiOf, completeness, type FieldDefinition, type ProfileData, type ProfileValue } from '@/lib/profile/fields'
import { SURGERY_CATALOG, formatRange } from '@/lib/surgery/catalog'
import { FEASIBILITY_MODEL, INDICATION_TEXT, assessFeasibility } from '@/lib/surgery/feasibility'

import { messageOf, sendJson } from '../planning/api'
import { Notice } from '../planning/atoms'
import { PhotoCoverage } from '../planning/photo-coverage'
import type { PhotoAsset } from '../planning/types'

type Props = { id: string; label: string; example: boolean; initialData: ProfileData; initialPhotos: PhotoAsset[] }

function FieldInput({ field, value, onChange }: { field: FieldDefinition; value: ProfileValue | undefined; onChange: (value: ProfileValue | undefined) => void }) {
  const id = `field-${field.key}`
  const caption = (
    <span className="mb-1.5 block text-sm text-fog">
      {field.label}
      {field.type === 'number' && field.unit ? <span className="text-ash"> ({field.unit})</span> : null}
    </span>
  )
  const hint = field.hint ? <span className="mt-1.5 block text-xs leading-relaxed text-ash">{field.hint}</span> : null

  if (field.type === 'multi') {
    const chosen = Array.isArray(value) ? value : []
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm text-fog">{field.label}</legend>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          {field.options.map(option => (
            <label key={option} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-fog">
              <input
                type="checkbox"
                className="h-4 w-4 accent-white"
                checked={chosen.includes(option)}
                onChange={event => onChange(event.target.checked ? [...chosen, option] : chosen.filter(item => item !== option))}
              />
              {option}
            </label>
          ))}
        </div>
        {hint}
      </fieldset>
    )
  }

  if (field.type === 'boolean') {
    // Three states: an unanswered question is not a "no".
    return (
      <label htmlFor={id} className="block">
        {caption}
        <select id={id} className="field" value={value === true ? 'yes' : value === false ? 'no' : ''} onChange={event => onChange(event.target.value === '' ? undefined : event.target.value === 'yes')}>
          <option value="" className="bg-coal">Not recorded</option>
          <option value="no" className="bg-coal">No</option>
          <option value="yes" className="bg-coal">Yes</option>
        </select>
        {hint}
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <label htmlFor={id} className="block">
        {caption}
        <select id={id} className="field" value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)}>
          <option value="" className="bg-coal">Not recorded</option>
          {field.options.map(option => (
            <option key={option} value={option} className="bg-coal">
              {option}
            </option>
          ))}
        </select>
        {hint}
      </label>
    )
  }

  if (field.type === 'textarea') {
    return (
      <label htmlFor={id} className="block sm:col-span-2">
        {caption}
        <textarea id={id} className="field min-h-[88px]" maxLength={2000} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
        {hint}
      </label>
    )
  }

  if (field.type === 'number') {
    return (
      <label htmlFor={id} className="block">
        {caption}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className="field"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={typeof value === 'number' ? value : ''}
          onChange={event => onChange(event.target.value === '' || Number.isNaN(event.target.valueAsNumber) ? undefined : event.target.valueAsNumber)}
        />
        {hint}
      </label>
    )
  }

  return (
    <label htmlFor={id} className="block">
      {caption}
      <input id={id} type={field.type === 'date' ? 'date' : 'text'} className="field" maxLength={200} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
      {hint}
    </label>
  )
}

const WEIGHT_MARK = { major: '■', caution: '▲', info: '·' } as const

export function ProfileEditor({ id, label: initialLabel, example, initialData, initialPhotos }: Props) {
  const router = useRouter()
  const [label, setLabel] = useState(initialLabel)
  const [data, setData] = useState<ProfileData>(initialData)
  const [saved, setSaved] = useState(JSON.stringify({ label: initialLabel, data: initialData }))
  const [photos, setPhotos] = useState(initialPhotos)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null)

  const isDirty = JSON.stringify({ label, data }) !== saved
  const share = useMemo(() => completeness(data), [data])
  const age = ageOn(data.dateOfBirth)
  const bmi = bmiOf(data)
  const assessments = useMemo(() => SURGERY_CATALOG.map(procedure => ({ procedure, result: assessFeasibility(procedure, data) })), [data])

  function set(key: string, value: ProfileValue | undefined) {
    setData(current => {
      const next = { ...current }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      await sendJson('PATCH', `/api/profiles/${id}`, { label: label.trim(), data })
      setSaved(JSON.stringify({ label, data }))
      setMessage({ tone: 'info', text: 'Saved.' })
      router.refresh()
    } catch (problem) {
      setMessage({ tone: 'warning', text: messageOf(problem) })
    }
    setBusy(false)
  }

  async function remove() {
    if (!window.confirm('Delete this profile with all its data and photographs? This cannot be undone.')) return
    try {
      await sendJson('DELETE', `/api/profiles/${id}`)
      router.push('/profiles')
      router.refresh()
    } catch (problem) {
      setMessage({ tone: 'warning', text: messageOf(problem) })
    }
  }

  return (
    <div className="space-y-10">
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label htmlFor="profile-label" className="eyebrow">
            Profile
          </label>
          <input id="profile-label" className="field mt-3 max-w-xl text-xl" value={label} maxLength={80} onChange={event => setLabel(event.target.value)} />
          {example && <p className="mt-3 text-sm text-ash">Sample record created by development access. It describes nobody; the pictures are renders of the generic mannequin.</p>}
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line text-center">
          {[
            ['Age', age === null ? 'n/a' : `${age}`],
            ['BMI', bmi === null ? 'n/a' : `${bmi}`],
            ['Record', `${Math.round(share.overall * 100)}%`],
          ].map(([term, value]) => (
            <div key={term} className="bg-ink px-6 py-4">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ash">{term}</dt>
              <dd className="mt-1 text-2xl font-medium tracking-tight">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section aria-labelledby="photos-title" className="card p-5 sm:p-7">
        <h2 id="photos-title" className="h3">
          Photographs
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash">
          One photograph per view: front, both profiles, the three-quarter views, back, top, from below and the tilted views. They belong to this profile and are used by every simulation made for it; the front and the two profiles are the
          minimum.
        </p>
        <div className="mt-6">
          <PhotoCoverage photos={photos} uploadUrl={`/api/profiles/${id}/photos`} photoUrl={photoId => `/api/profiles/photos/${photoId}`} onPhotos={setPhotos} />
        </div>
      </section>

      <section aria-label="Clinical record" className="space-y-3">
        {PROFILE_SECTIONS.map((section, index) => (
          <details key={section.id} open={index < 2} className="card group p-5 sm:p-7">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <span>
                <span className="h3 block">{section.title}</span>
                <span className="mt-1 block text-sm text-ash">{section.lead}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-ash">{Math.round((share.sections[section.id] ?? 0) * 100)}%</span>
            </summary>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {section.fields.map(field => (
                <FieldInput key={field.key} field={field} value={data[field.key]} onChange={value => set(field.key, value)} />
              ))}
            </div>
          </details>
        ))}
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-ink/90 p-4 backdrop-blur">
        <p className="text-sm text-fog">{isDirty ? 'Unsaved changes.' : 'All changes saved.'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={remove} className="btn-ghost btn-sm min-h-[44px]">
            Delete profile
          </button>
          <button type="button" onClick={save} disabled={busy || !isDirty || label.trim() === ''} className="btn-primary btn-sm min-h-[44px]">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section aria-labelledby="indication-title" className="card p-5 sm:p-7">
        <h2 id="indication-title" className="h3">
          Preliminary indication per operation
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash">
          Computed from this record by a draft set of rules ({FEASIBILITY_MODEL.name} v{FEASIBILITY_MODEL.version}, not validated). It lists missing data and points a surgeon would review. It does not say that an operation is or is not
          possible: that is decided at a consultation. The score is a rough ordering, not a probability.
        </p>
        <ul className="mt-6 space-y-3">
          {assessments.map(({ procedure, result }) => (
            <li key={procedure.slug} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="font-medium">
                  {procedure.name}
                  {procedure.short ? <span className="text-ash"> · {procedure.short}</span> : null}
                </p>
                <p className="font-mono text-xs text-ash">
                  {INDICATION_TEXT[result.indication]}
                  {result.score !== null ? ` · ${result.score}/100` : ''}
                </p>
              </div>
              {result.missing.length > 0 && <p className="mt-2 text-sm text-fog">Missing: {result.missing.join(', ')}.</p>}
              {result.factors.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm leading-relaxed text-fog">
                  {result.factors.map(factor => (
                    <li key={factor.text} className={factor.weight === 'major' ? 'text-white' : ''}>
                      <span aria-hidden="true" className="mr-2 font-mono text-xs">
                        {WEIGHT_MARK[factor.weight]}
                      </span>
                      {factor.text}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-ash">Indicative price {formatRange(procedure)}.</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ash">■ major factor · ▲ point to review · · information</p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href={`/simulator?profile=${id}`} className="btn-primary">
          Simulate on this profile&rsquo;s photos
        </Link>
        <Link href="/planning" className="btn-ghost">
          3D planning
        </Link>
      </div>
    </div>
  )
}
