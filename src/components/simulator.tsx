'use client'

import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { PROCEDURES, VIEWS, VIEW_LABELS, getProcedure, type Procedure, type View } from '@/lib/procedures'

import { BeforeAfter } from './before-after'

type Viewer = { isSignedIn: boolean; credits: number; hasAllProcedures: boolean }
/** A profile and the ids of the two photographs a simulation needs, when it has them. */
export type SimulatorProfile = { id: string; label: string; photos: Record<View, string | null> }
type Props = { viewer: Viewer; profiles: SimulatorProfile[]; initialProfile: string | null; initialProcedure: string; disclaimer: string; retentionDays: number }

type Failure = { code: string; message: string; setup?: string; view?: string }

type Phase = { kind: 'compose' } | { kind: 'generating'; startedAt: number } | { kind: 'done'; id: string }

const CONSENTS = [
  { id: 'consentSelf', label: 'These are photos of me, or I have the clear permission of the person shown.' },
  { id: 'consentAdult', label: 'The person in the photo is 18 or older and is clothed.' },
  {
    id: 'consentProcessing',
    label: 'I agree that these photos are processed to create my simulation, including by the AI image provider, as described in the Privacy Policy.',
  },
] as const

// The selected state is one shape that travels between the options.
const GLIDE = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const
const EASE = [0.22, 1, 0.36, 1] as const

function intensityLabel(value: number): string {
  if (value <= 33) return 'Subtle'
  if (value <= 66) return 'Natural'
  return 'Defined'
}

export function Simulator({ viewer, profiles, initialProfile, initialProcedure, disclaimer, retentionDays }: Props) {
  const router = useRouter()
  const [procedure, setProcedure] = useState<Procedure>(() => getProcedure(initialProcedure) ?? PROCEDURES[0]!)
  const [focus, setFocus] = useState(procedure.focus[0]?.id ?? '')
  const [intensity, setIntensity] = useState(50)
  const [profileId, setProfileId] = useState(() => (profiles.some(item => item.id === initialProfile) ? initialProfile! : (profiles[0]?.id ?? '')))
  const profile = profiles.find(item => item.id === profileId) ?? null
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [phase, setPhase] = useState<Phase>({ kind: 'compose' })
  const [failure, setFailure] = useState<Failure | null>(null)
  const [credits, setCredits] = useState(viewer.credits)
  const [elapsed, setElapsed] = useState(0)

  const isLocked = !procedure.starter && !viewer.hasAllProcedures
  const hasConsent = CONSENTS.every(consent => consents[consent.id])
  const missing = VIEWS.filter(view => !profile?.photos[view])
  const hasBothPhotos = missing.length === 0
  const groups = useMemo(
    () => [
      { title: 'Face', items: PROCEDURES.filter(item => item.area === 'face') },
      { title: 'Body', items: PROCEDURES.filter(item => item.area === 'body') },
    ],
    [],
  )

  useEffect(() => {
    if (phase.kind !== 'generating') return
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - phase.startedAt) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [phase])

  function chooseProcedure(next: Procedure) {
    setProcedure(next)
    setFocus(next.focus[0]?.id ?? '')
    setFailure(null)
    window.history.replaceState(null, '', `/simulator?procedure=${next.slug}`)
  }

  function reset() {
    setFailure(null)
    setConsents({})
    setPhase({ kind: 'compose' })
  }

  async function generate() {
    if (!profile || !hasBothPhotos || !hasConsent || isLocked) return
    setFailure(null)
    setElapsed(0)
    setPhase({ kind: 'generating', startedAt: Date.now() })

    const body = new FormData()
    body.set('profileId', profile.id)
    body.set('procedure', procedure.slug)
    body.set('focus', focus)
    body.set('intensity', String(intensity))
    for (const consent of CONSENTS) body.set(consent.id, 'true')

    try {
      const response = await fetch('/api/simulations', { method: 'POST', body })
      const json = (await response.json().catch(() => null)) as { id?: string; credits?: number; error?: Failure } | null

      if (response.ok && json?.id) {
        setCredits(json.credits ?? Math.max(0, credits - 1))
        setPhase({ kind: 'done', id: json.id })
        router.refresh()
        return
      }
      setFailure(json?.error ?? { code: 'unknown', message: 'The simulation could not be generated. Please try again.' })
    } catch {
      setFailure({ code: 'network', message: 'The connection was lost before the simulation finished. Check your network and try again.' })
    }
    setPhase({ kind: 'compose' })
  }

  async function deleteNow(id: string) {
    const response = await fetch(`/api/simulations/${id}`, { method: 'DELETE' })
    if (response.ok) {
      reset()
      router.refresh()
    } else {
      setFailure({ code: 'delete_failed', message: 'The simulation could not be deleted. Try again from your dashboard.' })
    }
  }

  const isGenerating = phase.kind === 'generating'

  return (
    <MotionConfig reducedMotion="user">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
      {/* Controls */}
      <div className="order-2 space-y-6 lg:order-1">
        <fieldset disabled={isGenerating || phase.kind === 'done'} className="card space-y-7 p-5 disabled:opacity-60 sm:p-7">
          <legend className="sr-only">Simulation settings</legend>

          <div>
            <p className="eyebrow">1. Procedure</p>
            {groups.map(group => (
              <div key={group.title} className="mt-4">
                <p className="mb-2 text-sm text-ash">{group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map(item => {
                    const isActive = item.slug === procedure.slug
                    const locked = !item.starter && !viewer.hasAllProcedures
                    return (
                      <motion.button
                        key={item.slug}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => chooseProcedure(item)}
                        whileTap={{ scale: 0.96 }}
                        className={`pill ${isActive ? 'border-transparent text-ink' : 'border-white/15 text-fog hover:border-white/40 hover:text-white'}`}
                      >
                        {isActive && <motion.span layoutId="procedure-pill" transition={GLIDE} style={{ borderRadius: 999 }} className="absolute -inset-px bg-white shadow-[0_8px_30px_-10px_rgba(255,255,255,0.55)]" />}
                        <span className="relative">{item.name}</span>
                        {locked && <span className={`relative ml-2 font-mono text-[10px] uppercase tracking-widest transition-colors duration-300 ${isActive ? 'text-ink/60' : 'text-ash'}`}>Pro</span>}
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="eyebrow">2. Focus</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={procedure.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="mt-4 flex flex-wrap gap-2"
              >
                {procedure.focus.map(option => {
                  const isActive = focus === option.id
                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setFocus(option.id)}
                      whileTap={{ scale: 0.96 }}
                      className={`pill ${isActive ? 'border-transparent text-white' : 'border-white/15 text-fog hover:border-white/40 hover:text-white'}`}
                    >
                      {isActive && <motion.span layoutId={`focus-pill-${procedure.slug}`} transition={GLIDE} style={{ borderRadius: 999 }} className="absolute -inset-px border border-white bg-white/10" />}
                      <span className="relative">{option.label}</span>
                    </motion.button>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="intensity" className="eyebrow">
                3. Intensity
              </label>
              <motion.span
                key={intensityLabel(intensity)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="text-sm"
              >
                {intensityLabel(intensity)}
              </motion.span>
            </div>
            <input
              id="intensity"
              type="range"
              min={10}
              max={100}
              step={5}
              value={intensity}
              onChange={event => setIntensity(Number(event.target.value))}
              style={{ '--fill': `${((intensity - 10) / 90) * 100}%` } as React.CSSProperties}
              className="slider mt-2"
            />
            <div className="flex justify-between text-xs text-ash">
              <span>Subtle</span>
              <span>Natural</span>
              <span>Defined</span>
            </div>
          </div>

          <div className="space-y-3 border-t border-line pt-6">
            <p className="eyebrow">4. Consent</p>
            {CONSENTS.map(consent => (
              <label key={consent.id} className="group flex min-h-[44px] cursor-pointer items-start gap-3 text-sm leading-relaxed text-fog transition-colors duration-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={Boolean(consents[consent.id])}
                  onChange={event => setConsents(current => ({ ...current, [consent.id]: event.target.checked }))}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition duration-300 ease-out peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white ${consents[consent.id] ? 'border-white bg-white' : 'border-white/30 bg-white/[0.03] group-hover:border-white/60'}`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#080808" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <motion.path
                      d="M2.5 6.4 5 8.8l4.6-5.4"
                      initial={false}
                      animate={{ pathLength: consents[consent.id] ? 1 : 0, opacity: consents[consent.id] ? 1 : 0 }}
                      transition={{ duration: 0.28, ease: EASE }}
                    />
                  </svg>
                </span>
                <span>
                  {consent.label}
                  {consent.id === 'consentProcessing' && (
                    <>
                      {' '}
                      <Link href="/privacy" className="link text-white">
                        Read it
                      </Link>
                    </>
                  )}
                </span>
              </label>
            ))}
            <p className="text-xs leading-relaxed text-ash">
              Photos and results are deleted automatically after {retentionDays} days, or at once when you delete them. They are never used to train AI models.
            </p>
          </div>
        </fieldset>

        {phase.kind !== 'done' && (
          <div className="space-y-3">
            {!viewer.isSignedIn ? (
              <Link href={`/register?next=${encodeURIComponent(`/simulator?procedure=${procedure.slug}`)}`} className="btn-primary w-full">
                Create a free account to generate
              </Link>
            ) : isLocked ? (
              <Link href="/pricing" className="btn-primary w-full">
                Unlock {procedure.name} with Pro
              </Link>
            ) : credits < 1 ? (
              <Link href="/pricing" className="btn-primary w-full">
                Get more simulations
              </Link>
            ) : (
              <button type="button" onClick={generate} disabled={!profile || !hasBothPhotos || !hasConsent || isGenerating} className="btn-primary w-full">
                {isGenerating ? 'Generating…' : 'Generate My Result'}
              </button>
            )}
            <p className="text-center text-sm text-ash">
              {viewer.isSignedIn
                ? `${credits} simulation${credits === 1 ? '' : 's'} left${!profile ? ' · create a profile to start' : missing.length > 0 ? ` · the profile needs its ${missing.map(view => VIEW_LABELS[view].toLowerCase()).join(' and ')} photo` : !hasConsent ? ' · confirm the three boxes' : ''}`
                : 'One free simulation with every new account.'}
            </p>
          </div>
        )}

        <AnimatePresence>
          {failure && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="card border-white/30 p-5 text-sm leading-relaxed"
            >
              <p className="font-medium">{failure.message}</p>
              {failure.setup && <p className="mt-2 font-mono text-xs text-fog">{failure.setup}</p>}
              {failure.code === 'unauthenticated' && (
                <Link href="/login?next=/simulator" className="link mt-2 inline-block">
                  Log in
                </Link>
              )}
              {(failure.code === 'no_credits' || failure.code === 'plan_required') && (
                <Link href="/pricing" className="link mt-2 inline-block">
                  See the plans
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Photo and result */}
      <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-24">
          {phase.kind === 'done' ? (
            <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: EASE }}>
              <div className="grid gap-5 sm:grid-cols-2">
                {VIEWS.map(view => (
                  <div key={view}>
                    <p className="eyebrow mb-3">{VIEW_LABELS[view]}</p>
                    <BeforeAfter
                      beforeSrc={`/api/simulations/${phase.id}/image?type=original&view=${view}`}
                      afterSrc={`/api/simulations/${phase.id}/image?type=result&view=${view}`}
                      downloadHref={`/api/simulations/${phase.id}/image?type=result&view=${view}&download=1`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ash">{disclaimer}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={reset} className="btn-ghost btn-sm min-h-[44px]">
                  New simulation
                </button>
                <button type="button" onClick={() => deleteNow(phase.id)} className="btn-ghost btn-sm min-h-[44px]">
                  Delete this simulation now
                </button>
                <Link href="/dashboard" className="btn-ghost btn-sm min-h-[44px]">
                  Open my history
                </Link>
              </div>
            </motion.div>
          ) : (
            <div>
              {profiles.length > 0 && (
                <label className="mb-4 block">
                  <span className="mb-1.5 block text-sm text-fog">Profile whose photographs are used</span>
                  <select className="field" value={profileId} disabled={isGenerating} onChange={event => setProfileId(event.target.value)}>
                    {profiles.map(item => (
                      <option key={item.id} value={item.id} className="bg-coal">
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {profile ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-5">
                  {VIEWS.map(view => {
                    const photoId = profile.photos[view]
                    return (
                      <div key={view} className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-coal">
                        {photoId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/profiles/photos/${photoId}`} alt={`${VIEW_LABELS[view]} photograph of the profile`} className={`h-full w-full object-cover transition duration-700 ${isGenerating ? 'scale-[1.01] opacity-60' : ''}`} />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                            <p className="font-medium">{VIEW_LABELS[view]}</p>
                            <p className="mt-2 text-sm leading-relaxed text-ash">Not in this profile yet.</p>
                            <Link href={`/profiles/${profile.id}`} className="link mt-3 text-sm text-white">
                              Add it to the profile
                            </Link>
                          </div>
                        )}
                        <span className="glass pointer-events-none absolute left-3 top-3 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]">{VIEW_LABELS[view]}</span>
                        {isGenerating && (
                          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                            <div className="scanline absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-white/25 to-transparent" />
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-coal/50 p-8 text-center">
                  <p className="text-lg font-medium">A simulation is made for a profile</p>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-ash">
                    The profile holds the person&rsquo;s photographs (front and both profiles at least) and clinical record. The simulator uses those photographs.
                  </p>
                  <Link href={viewer.isSignedIn ? '/profiles' : `/register?next=${encodeURIComponent('/profiles')}`} className="btn-primary btn-sm mt-5 min-h-[44px]">
                    {viewer.isSignedIn ? 'Create a profile' : 'Create a free account'}
                  </Link>
                </div>
              )}
              {isGenerating ? (
                <div role="status" aria-live="polite" className="mt-4 flex items-center justify-between gap-4 text-sm">
                  <span>
                    Generating your {procedure.name.toLowerCase()} simulation, front and profile. This usually takes 1 to 3 minutes; keep this page open.
                  </span>
                  <span className="shrink-0 font-mono text-ash">{elapsed}s</span>
                </div>
              ) : (
                profile && (
                  <p className="mt-4 text-sm leading-relaxed text-ash">
                    The same change is simulated from the front and in profile, on the photographs stored in the profile. {procedure.photoGuide}{' '}
                    <Link href={`/profiles/${profile.id}`} className="link text-white">
                      Manage the photographs
                    </Link>
                    .
                  </p>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </MotionConfig>
  )
}
