'use client'

import { useState } from 'react'

import { describeOperation } from '@/lib/anatomy/plan'
import { viewDefinition } from '@/lib/anatomy/views'

import { BeforeAfter } from '../before-after'

import { ApiError, assetUrl, messageOf, sendJson } from './api'
import { Check, Notice, Section, mm } from './atoms'
import type { CaseProfile, OutlineReport, ResultRecord, Viewer } from './types'

type Props = {
  results: ResultRecord[]
  /** A simulation matching the current plan and geometry exists and can be saved. */
  canSave: boolean
  saving: string | null
  onSave: (includeThreeQuarter: boolean) => void
  onResults: (results: ResultRecord[]) => void
  account: Viewer
  providerConsent: boolean
  onProviderConsent: () => Promise<void>
  /** The person the case is about; the photographs for the photographic version are theirs. */
  profile: CaseProfile | null
  disclaimer: string
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function CheckLine({ check }: { check: OutlineReport }) {
  const text =
    check.status === 'pass'
      ? `Outline check passed: ${check.meanDeviationMm} mm mean deviation from the 3D model (tolerance ${check.toleranceMm} mm).`
      : check.status === 'fail'
        ? `Outline check failed: ${check.meanDeviationMm} mm mean deviation from the 3D model, above the ${check.toleranceMm} mm tolerance. Rely on the geometric render for this view.`
        : `Outline check not possible in this view: ${check.note}`
  return <p role={check.status === 'fail' ? 'alert' : undefined} className={`mt-3 text-xs leading-relaxed ${check.status === 'fail' ? 'text-white' : 'text-ash'}`}>{check.status === 'fail' ? '⚠ ' : ''}{text}</p>
}

function ResultCard({ result, account, providerConsent, onProviderConsent, profile, disclaimer, onChange, onDelete }: Omit<Props, 'results' | 'canSave' | 'saving' | 'onSave' | 'onResults'> & { result: ResultRecord; onChange: (result: ResultRecord) => void; onDelete: () => void }) {
  const [consent, setConsent] = useState(providerConsent)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ message: string; setup?: string } | null>(null)

  async function photographic() {
    setBusy(true)
    setFailure(null)
    try {
      if (!providerConsent) await onProviderConsent()
      const done = await sendJson<{ checks: Record<string, OutlineReport> }>('POST', `/api/planning/results/${result.id}/photoreal`)
      onChange({ ...result, photoStatus: 'completed', photoError: null, views: result.views.map(view => ({ ...view, photo: done.checks[view.view] })) })
    } catch (error) {
      setFailure({ message: messageOf(error), setup: error instanceof ApiError ? error.setup : undefined })
    }
    setBusy(false)
  }

  async function remove() {
    try {
      await sendJson('DELETE', `/api/planning/results/${result.id}`)
      onDelete()
    } catch (error) {
      setFailure({ message: messageOf(error) })
    }
  }

  const hasPhotos = result.views.some(view => view.photo)
  const hasFrontPhoto = Boolean(profile?.views.includes('front'))

  return (
    <article className="space-y-5 rounded-2xl border border-line p-4 sm:p-5">
      <header>
        <p className="eyebrow">{dateFormat.format(new Date(result.createdAt))}</p>
        <ul className="mt-3 space-y-1 text-sm leading-relaxed text-fog">
          {result.plan.operations.map(operation => (
            <li key={operation.id}>{describeOperation(operation)}</li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-xs text-ash">
          {result.stats.faceAssetId ? `Largest skin displacement ${mm(result.stats.maxSkinMm)}` : `Bone only (no facial surface): largest hard-tissue change ${mm(Math.max(0, ...result.stats.operations.map(operation => operation.maxHardMm)))}`}
        </p>
      </header>

      <p className="rounded-xl border border-white/30 px-4 py-3 text-sm font-medium">{disclaimer}</p>
      {result.stats.usesEstimatedGeometry && <Notice tone="warning">This result was computed on geometry declared as estimated, not scanned. It illustrates the plan on an inferred shape.</Notice>}

      {result.stats.measures.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-widest text-ash">
              <th className="py-2 font-normal">Measure</th>
              <th className="py-2 font-normal">Before</th>
              <th className="py-2 font-normal">Simulated</th>
            </tr>
          </thead>
          <tbody>
            {result.stats.measures.map(measure => {
              const unit = measure.kind === 'distance' ? ' mm' : '°'
              return (
                <tr key={measure.id} className="border-t border-line">
                  <td className="py-2 font-mono">{measure.label}</td>
                  <td className="py-2 font-mono">{measure.before === null ? 'n/a' : `${measure.before}${unit}`}</td>
                  <td className="py-2 font-mono">{measure.after === null ? 'n/a' : `${measure.after}${unit}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {result.views.map(view => {
          const label = viewDefinition(view.view)?.label ?? view.view
          const before = result.files[`${view.view}:before`]
          const after = result.files[`${view.view}:after`]
          if (!before || !after) return null
          return (
            <div key={view.view}>
              <p className="eyebrow mb-3">{label} · geometric render</p>
              <BeforeAfter beforeSrc={assetUrl(before)} afterSrc={assetUrl(after)} beforeLabel="Before" afterLabel="Simulated" downloadHref={assetUrl(after, true)} downloadLabel="Download render" />
              {view.photo && (
                <div className="mt-5">
                  <p className="eyebrow mb-3">{label} · photographic version (AI-generated)</p>
                  <BeforeAfter beforeSrc={assetUrl(after)} afterSrc={assetUrl(view.photo.photoAssetId)} beforeLabel="3D render" afterLabel="AI photo" downloadHref={assetUrl(view.photo.photoAssetId, true)} downloadLabel="Download photo" />
                  <CheckLine check={view.photo} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs leading-relaxed text-ash">
        Every view is rendered from the same simulated model with a fixed camera, scale and lighting, so views agree with each other and asymmetries are kept. {hasPhotos ? 'The photographic versions are generated by an image model from those renders and your photographs: they can depart from the geometry, which is why each is checked against the render.' : ''}
      </p>

      <div className="space-y-3 border-t border-line pt-5">
        <p className="text-sm font-medium">Photographic version</p>
        {!account.photoConfigured ? (
          <Notice>The photographic render is not configured on this server (GEMINI_API_KEY is not set). The geometric renders above are complete without it.</Notice>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-ash">
              Sends to the image provider (Google Gemini) only: the &ldquo;simulated&rdquo; renders above, the matching photograph and the front photograph from the profile, and the text of the operations. No scan, mesh, measurement table or name is sent. Costs one
              simulation credit ({account.credits} left); a failed run is refunded. A generated photo is checked against the 3D outline with a tolerance of {account.toleranceMm} mm.
            </p>
            {!providerConsent && (
              <Check checked={consent} onChange={setConsent}>
                I agree that these renders and photographs are sent to the external image provider to produce the photographic version.
              </Check>
            )}
            {!profile && <Notice>Link this case to a profile (above the tabs): the photographs of that profile are used for likeness, skin and hair.</Notice>}
            {profile && !hasFrontPhoto && (
              <Notice>
                The profile &ldquo;{profile.label}&rdquo; has no front photograph yet.{' '}
                <a href={`/profiles/${profile.id}`} className="link text-white">
                  Add it to the profile
                </a>
                .
              </Notice>
            )}
            <button type="button" onClick={photographic} disabled={busy || !hasFrontPhoto || (!providerConsent && !consent) || account.credits < 1} className="btn-primary btn-sm min-h-[44px]">
              {busy ? 'Generating, 1 to 3 minutes…' : hasPhotos ? 'Generate again' : 'Generate the photographic version'}
            </button>
          </>
        )}
        {result.photoStatus === 'failed' && !failure && <Notice tone="warning">The last photographic run failed and was refunded.</Notice>}
        {failure && (
          <Notice tone="warning">
            {failure.message}
            {failure.setup ? ` ${failure.setup}` : ''}
          </Notice>
        )}
      </div>

      <button type="button" onClick={remove} className="btn-ghost btn-sm min-h-[44px]">
        Delete this result
      </button>
    </article>
  )
}

export function ResultsPanel({ results, canSave, saving, onSave, onResults, ...rest }: Props) {
  const [threeQuarter, setThreeQuarter] = useState(false)
  return (
    <div className="space-y-8">
      <Section title="Save the current simulation" hint="Renders the front view and both profiles from the simulated model, with the same camera for before and after, and stores them with the plan.">
        <Check checked={threeQuarter} onChange={setThreeQuarter}>
          Also render the two three-quarter views.
        </Check>
        <button type="button" onClick={() => onSave(threeQuarter)} disabled={!canSave || saving !== null} className="btn-primary min-h-[46px] w-full">
          {saving ?? 'Render and save the result'}
        </button>
        {!canSave && <p className="text-sm text-ash">Run the simulation in the Plan tab first.</p>}
      </Section>

      <Section title={`Results (${results.length})`}>
        {results.length === 0 && <p className="text-sm text-ash">No saved results. Nothing is shown here until a simulation has been computed on this case&rsquo;s own data.</p>}
        {results.map(result => (
          <ResultCard
            key={result.id}
            result={result}
            {...rest}
            onChange={next => onResults(results.map(item => (item.id === next.id ? next : item)))}
            onDelete={() => onResults(results.filter(item => item.id !== result.id))}
          />
        ))}
      </Section>
    </div>
  )
}
