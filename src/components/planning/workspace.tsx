'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { measureValue, type Landmark, type Layer, type Measure } from '@/lib/anatomy/landmarks'
import { applyPoint, multiply, type Mat4, type Vec3 } from '@/lib/anatomy/math'
import { bounds, ellipsoidMesh, transformMesh, type Mesh } from '@/lib/anatomy/mesh'
import { planSchema, type Plan } from '@/lib/anatomy/plan'
import type { RenderView, TransformStep } from '@/lib/anatomy/schema'
import { displacedLandmarks, prepareSimulation, simulate, type SimulationContext, type SimulationResult } from '@/lib/anatomy/simulate'
import { OPTIONAL_RESULT_VIEWS, RESULT_VIEWS, VIEW_DEFINITIONS, viewDefinition } from '@/lib/anatomy/views'

import { fetchMesh, messageOf, sendForm, sendJson } from './api'
import { Notice, StatusBadge } from './atoms'
import { DataPanel } from './data-panel'
import { LandmarksPanel } from './landmarks-panel'
import { PlanPanel, draftFromPlan, type DraftOperation } from './plan-panel'
import { RegistrationPanel } from './registration-panel'
import { ResultsPanel } from './results-panel'
import type { CaseRecord, MeshAsset, PhotoAsset, ResultRecord, ResultStats, Viewer } from './types'
import { AnatomyViewer, type Marker, type MeasureLine, type ModelState, type PickHit } from './viewer'

type Props = {
  record: CaseRecord
  initialMeshes: MeshAsset[]
  initialPhotos: PhotoAsset[]
  initialResults: ResultRecord[]
  account: Viewer
  disclaimer: string
}

type PickRequest = { layers: Layer[]; hint: string; handle: (hit: PickHit) => void }
type Simulation = { result: SimulationResult; context: SimulationContext; plan: Plan; planKey: string }

const TABS = ['Data', 'Landmarks', 'Registration', 'Plan', 'Results'] as const
type Tab = (typeof TABS)[number]

const RENDER_WIDTH = 1024
const RENDER_HEIGHT = 1280

/** Why a draft plan cannot run, in the operator's terms. */
function planIssues(draft: DraftOperation[]): string[] {
  const issues: string[] = []
  draft.forEach((operation, index) => {
    const name = `Operation ${index + 1}${operation.label ? ` (${operation.label})` : ''}`
    if (operation.label.trim() === '') issues.push(`${name}: give it a name.`)
    if (operation.region.trim() === '') issues.push(`${name}: state the region.`)
    if (operation.softTissue.ratio === null) issues.push(`${name}: enter the share of the change that reaches the skin.`)
    if (operation.softTissue.spreadMm === null) issues.push(`${name}: enter the distance over which it blends into the skin.`)
    if (operation.kind === 'implant' && operation.geometry.type === 'ellipsoid' && operation.geometry.sizeMm.some(value => value < 1)) issues.push(`${name}: enter the size of the implant envelope.`)
    if (operation.kind === 'osteotomy' && operation.translationMm.every(value => value === 0) && operation.rotationDeg.every(value => value === 0)) issues.push(`${name}: enter the movement of the segment.`)
  })
  if (issues.length === 0 && draft.length > 0) {
    const parsed = planSchema.safeParse({ operations: draft, notes: '' })
    if (!parsed.success) for (const issue of parsed.error.issues.slice(0, 4)) issues.push(`Operation ${Number(issue.path[1] ?? 0) + 1}: ${issue.path.slice(2).join('.')} ${issue.message.toLowerCase()}`)
  }
  return issues
}

export function PlanningWorkspace({ record, initialMeshes, initialPhotos, initialResults, account, disclaimer }: Props) {
  const router = useRouter()
  const container = useRef<HTMLDivElement>(null)
  const viewer = useRef<AnatomyViewer | null>(null)
  const pickRef = useRef<PickRequest | null>(null)
  const contextCache = useRef<{ skull: Mesh; face: Mesh; context: SimulationContext } | null>(null)
  const canonicalCache = useRef(new Map<string, { raw: Mesh; transform: Mat4; canonical: Mesh }>())
  const framed = useRef(false)

  const [tab, setTab] = useState<Tab>(initialMeshes.length === 0 ? 'Data' : 'Plan')
  const [meshes, setMeshes] = useState(initialMeshes)
  const [raw, setRaw] = useState<Record<string, Mesh>>({})
  const [photos, setPhotos] = useState(initialPhotos)
  const [results, setResults] = useState(initialResults)
  const [landmarks, setLandmarks] = useState<Landmark[]>(record.landmarks)
  const [measures, setMeasures] = useState<Measure[]>(record.measures)
  const [draft, setDraft] = useState<DraftOperation[]>(() => draftFromPlan(record.plan))
  const [providerConsent, setProviderConsent] = useState(record.providerConsent)

  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [modelState, setModelState] = useState<ModelState>('before')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [pick, setPick] = useState<PickRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState({ skull: true, face: true, implant: true, landmarks: true })
  const [opacity, setOpacity] = useState(0.55)
  const [highlight, setHighlight] = useState(true)
  const [view, setView] = useState('front')

  // ── Geometry ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    for (const asset of meshes) {
      if (raw[asset.id]) continue
      fetchMesh(asset.id)
        .then(mesh => !cancelled && setRaw(current => (current[asset.id] ? current : { ...current, [asset.id]: mesh })))
        .catch(problem => !cancelled && setError(messageOf(problem)))
    }
    return () => {
      cancelled = true
    }
  }, [meshes, raw])

  /** Each model in the anatomical frame: the stored file coordinates with the stored transform applied. */
  const geometry = useMemo(() => {
    const out: Record<string, Mesh> = {}
    for (const asset of meshes) {
      const source = raw[asset.id]
      if (!source) continue
      let entry = canonicalCache.current.get(asset.id)
      if (!entry || entry.raw !== source || entry.transform !== asset.transform) {
        entry = { raw: source, transform: asset.transform, canonical: transformMesh(source, asset.transform) }
        canonicalCache.current.set(asset.id, entry)
      }
      out[asset.id] = entry.canonical
    }
    return out
  }, [meshes, raw])

  const skullAsset = meshes.find(mesh => mesh.kind === 'skull')
  const faceAsset = meshes.find(mesh => mesh.kind === 'face')
  const skullMesh = skullAsset ? geometry[skullAsset.id] : undefined
  const faceMesh = faceAsset ? geometry[faceAsset.id] : undefined
  const loading = meshes.some(mesh => !raw[mesh.id])

  // ── Viewer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current) return
    const instance = new AnatomyViewer(container.current)
    instance.onPick = hit => pickRef.current?.handle(hit)
    viewer.current = instance
    return () => {
      instance.dispose()
      viewer.current = null
      framed.current = false
    }
  }, [])

  useEffect(() => {
    const instance = viewer.current
    if (!instance) return
    instance.setLayer('skull', skullMesh ?? null)
    instance.setLayer('face', faceMesh ?? null)
    instance.setImplants([])
    instance.setState('before')
    // A simulation belongs to the geometry it was computed on.
    setSimulation(null)
    setModelState('before')
    if ((skullMesh || faceMesh) && !framed.current) {
      framed.current = true
      instance.setView(viewDefinition('front')!)
    }
  }, [skullMesh, faceMesh])

  useEffect(() => {
    viewer.current?.setVisibility(visible)
    viewer.current?.setFaceOpacity(opacity)
    viewer.current?.setHighlight(highlight)
  }, [visible, opacity, highlight, skullMesh, faceMesh])

  useEffect(() => {
    viewer.current?.setState(modelState)
  }, [modelState])

  useEffect(() => {
    pickRef.current = pick
    if (viewer.current) viewer.current.pickLayers = pick?.layers ?? []
  }, [pick])

  const afterLandmarks = useMemo(() => (simulation ? displacedLandmarks(simulation.context, simulation.result, landmarks) : null), [simulation, landmarks])

  useEffect(() => {
    const showAfter = modelState === 'after' && afterLandmarks !== null
    const positions = new Map<string, Vec3>()
    const markers: Marker[] = landmarks.map(item => {
      const moved = showAfter ? afterLandmarks.get(item.id) : undefined
      const changed = moved !== undefined && moved.movedMm > 0.05
      positions.set(item.id, changed ? moved.position : item.position)
      return { id: item.id, label: item.code, position: positions.get(item.id)!, status: changed ? 'modified' : item.provenance }
    })
    const lines: MeasureLine[] = []
    for (const measure of measures) {
      const points = measure.landmarks.map(id => positions.get(id))
      const value = measureValue(measure, positions)
      if (value !== null && points.every(Boolean)) lines.push({ points: points as Vec3[], label: `${value}${measure.kind === 'distance' ? ' mm' : '°'}` })
    }
    viewer.current?.setAnnotations(markers, lines)
  }, [landmarks, measures, afterLandmarks, modelState])

  // ── Persistence of landmarks and measures ───────────────────────────────
  useEffect(() => {
    // Nothing to save until something differs from what the server sent.
    if (landmarks === record.landmarks && measures === record.measures) return
    const timer = window.setTimeout(() => {
      sendJson('PATCH', `/api/planning/cases/${record.id}`, { landmarks, measures }).catch(problem => setError(messageOf(problem)))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [landmarks, measures, record.id, record.landmarks, record.measures])

  // ── Plan and simulation ─────────────────────────────────────────────────
  const issues = useMemo(() => planIssues(draft), [draft])
  const planKey = useMemo(() => JSON.stringify(draft), [draft])
  const stale = simulation !== null && simulation.planKey !== planKey

  const runSimulation = useCallback(() => {
    if (!skullMesh || !faceMesh) return
    const parsed = planSchema.safeParse({ operations: draft, notes: '' })
    if (!parsed.success) return
    setRunning(true)
    setError(null)
    // Let the "Computing…" state paint before the main thread is busy.
    window.setTimeout(() => {
      try {
        const cached = contextCache.current
        const context = cached && cached.skull === skullMesh && cached.face === faceMesh ? cached.context : prepareSimulation(skullMesh, faceMesh)
        contextCache.current = { skull: skullMesh, face: faceMesh, context }

        const shapes = new Map<string, Mesh>()
        for (const operation of parsed.data.operations) {
          if (operation.kind !== 'implant') continue
          if (operation.geometry.type === 'ellipsoid') {
            shapes.set(operation.id, ellipsoidMesh(operation.geometry.sizeMm as Vec3, 40))
          } else {
            const shape = geometry[operation.geometry.assetId]
            if (!shape) continue
            // The plan positions the implant's centre: bring the uploaded shape to its own centre first.
            const centre = bounds(shape.positions).centre
            const centred = new Float32Array(shape.positions.length)
            for (let i = 0; i < centred.length; i += 1) centred[i] = shape.positions[i]! - centre[i % 3]!
            shapes.set(operation.id, { positions: centred, indices: shape.indices })
          }
        }

        const result = simulate(context, parsed.data, shapes)
        viewer.current?.setAfter('skull', result.skullAfter)
        viewer.current?.setAfter('face', result.faceAfter, result.faceDisplacement)
        viewer.current?.setImplants([...result.implants.values()])
        setSimulation({ result, context, plan: parsed.data, planKey })
        setModelState('after')
        sendJson('PATCH', `/api/planning/cases/${record.id}`, { plan: parsed.data }).catch(problem => setError(messageOf(problem)))
      } catch (problem) {
        setError(`The simulation could not be computed: ${messageOf(problem)}`)
      }
      setRunning(false)
    }, 30)
  }, [skullMesh, faceMesh, draft, geometry, planKey, record.id])

  const saveResult = useCallback(
    async (includeThreeQuarter: boolean) => {
      const instance = viewer.current
      if (!instance || !simulation || !skullAsset || !faceAsset || !afterLandmarks) return
      setError(null)
      try {
        const form = new FormData()
        const views: RenderView[] = []
        const ids = [...RESULT_VIEWS, ...(includeThreeQuarter ? OPTIONAL_RESULT_VIEWS : [])]
        for (const [index, id] of ids.entries()) {
          const definition = viewDefinition(id)!
          setSaving(`Rendering ${definition.label.toLowerCase()} (${index + 1} of ${ids.length})…`)
          const size = { width: RENDER_WIDTH, height: RENDER_HEIGHT }
          const before = await instance.capture(definition, { ...size, state: 'before', mode: 'lit' })
          const after = await instance.capture(definition, { ...size, state: 'after', mode: 'lit' })
          const outline = await instance.capture(definition, { ...size, state: 'after', mode: 'outline' })
          if (!before || !after || !outline) throw new Error('The 3D view could not be rendered in this browser.')
          form.set(`before:${id}`, before.blob, `${id}-before.png`)
          form.set(`after:${id}`, after.blob, `${id}-after.png`)
          form.set(`outline:${id}`, outline.blob, `${id}-outline.png`)
          views.push({ view: id, ...size, mmPerPixel: after.mmPerPixel, roi: instance.changedRegion(definition, RENDER_WIDTH, RENDER_HEIGHT) })
        }

        const before = new Map(landmarks.map(item => [item.id, item.position]))
        const after = new Map([...afterLandmarks].map(([key, value]) => [key, value.position]))
        const stats: ResultStats = {
          maxSkinMm: simulation.result.maxSkinMm,
          operations: simulation.result.operations,
          landmarks: landmarks.map(item => ({ id: item.id, code: item.code, movedMm: Math.round((afterLandmarks.get(item.id)?.movedMm ?? 0) * 100) / 100 })),
          measures: measures.map(measure => ({ id: measure.id, label: measure.label, kind: measure.kind, before: measureValue(measure, before), after: measureValue(measure, after) })),
          skullAssetId: skullAsset.id,
          faceAssetId: faceAsset.id,
          usesEstimatedGeometry: skullAsset.provenance === 'estimated' || faceAsset.provenance === 'estimated',
        }
        form.set('plan', JSON.stringify(simulation.plan))
        form.set('stats', JSON.stringify(stats))
        form.set('views', JSON.stringify(views))

        setSaving('Saving…')
        const saved = await sendForm<{ id: string; createdAt: string; files: Record<string, string> }>(`/api/planning/cases/${record.id}/results`, form)
        setResults(current => [{ id: saved.id, createdAt: saved.createdAt, plan: simulation.plan, stats, views, photoStatus: 'none', photoError: null, provider: null, files: saved.files }, ...current])
      } catch (problem) {
        setError(messageOf(problem))
      }
      setSaving(null)
    },
    [simulation, skullAsset, faceAsset, afterLandmarks, landmarks, measures, record.id],
  )

  // ── Registration ────────────────────────────────────────────────────────
  const align = useCallback(
    async (assetId: string, correction: Mat4, step: TransformStep) => {
      const asset = meshes.find(mesh => mesh.id === assetId)
      if (!asset) return
      const transform = multiply(correction, asset.transform)
      await sendJson('PATCH', `/api/planning/assets/${assetId}`, { transform, step })
      setMeshes(current => current.map(mesh => (mesh.id === assetId ? { ...mesh, transform, meta: { ...mesh.meta, steps: [...mesh.meta.steps, step] } } : mesh)))
      // Landmarks of the moved model move with it.
      if (asset.kind !== 'implant') {
        setLandmarks(current => current.map(item => (item.layer === asset.kind ? { ...item, position: applyPoint(correction, item.position).map(value => Math.round(value * 100) / 100) as Vec3 } : item)))
      }
    },
    [meshes],
  )

  async function deleteCase() {
    if (!window.confirm('Delete this case with all its models, photographs and results? This cannot be undone.')) return
    try {
      await sendJson('DELETE', `/api/planning/cases/${record.id}`)
      router.push('/planning')
      router.refresh()
    } catch (problem) {
      setError(messageOf(problem))
    }
  }

  const empty = meshes.length === 0
  const hasSimulation = simulation !== null

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-2xl border border-line bg-[#0c0c0c]">
          <div ref={container} className="absolute inset-0 touch-none" aria-label="Interactive 3D model. Drag to rotate, scroll to zoom, right-drag to move." />
          {empty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-ash">No 3D geometry yet. Import a CT/CBCT volume or a 3D model in the Data tab.</p>}
          {loading && !empty && <p role="status" className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs">Loading geometry…</p>}
          {pick && (
            <div role="status" className="absolute inset-x-3 top-3 flex items-center justify-between gap-3 rounded-xl border border-white/30 bg-black/75 px-4 py-2 text-sm">
              <span>{pick.hint}</span>
              <button type="button" onClick={() => setPick(null)} className="min-h-[44px] shrink-0 underline underline-offset-4">
                Cancel
              </button>
            </div>
          )}
          {hasSimulation && (
            <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-full border border-white/20 bg-black/70 text-sm">
              {(['before', 'after'] as ModelState[]).map(state => (
                <button key={state} type="button" aria-pressed={modelState === state} onClick={() => setModelState(state)} className={`min-h-[44px] px-4 ${modelState === state ? 'bg-white text-ink' : 'text-fog'}`}>
                  {state === 'before' ? 'Before' : 'Simulated'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs text-ash">View (drawn from the 3D model)</span>
            <select
              className="field min-h-[44px] px-3 py-2 text-sm"
              value={view}
              onChange={event => {
                setView(event.target.value)
                viewer.current?.setView(viewDefinition(event.target.value)!)
              }}
            >
              {VIEW_DEFINITIONS.map(item => (
                <option key={item.id} value={item.id} className="bg-coal">
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['skull', 'Skull'],
                ['face', 'Skin'],
                ['implant', 'Implant'],
                ['landmarks', 'Landmarks'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={visible[key]} onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))} className={`pill min-h-[44px] ${visible[key] ? 'border-white/60 text-white' : 'border-white/15 text-ash'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-center">
          <label className="flex items-center gap-3 text-xs text-ash">
            <span className="shrink-0">Skin opacity</span>
            <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={event => setOpacity(Number(event.target.value))} className="slider" style={{ '--fill': `${((opacity - 0.1) / 0.9) * 100}%` } as React.CSSProperties} />
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-ash">
            <input type="checkbox" checked={highlight} onChange={event => setHighlight(event.target.checked)} className="h-4 w-4 accent-white" />
            Tint the skin the simulation moved
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status="acquired" />
          <StatusBadge status="estimated" />
          <StatusBadge status="modified" />
          <span className="text-xs text-ash">R / L mark the patient&rsquo;s right and left.</span>
        </div>
        {(skullAsset?.provenance === 'estimated' || faceAsset?.provenance === 'estimated') && (
          <div className="mt-3">
            <Notice tone="warning">
              {[skullAsset, faceAsset].filter(asset => asset?.provenance === 'estimated').map(asset => `"${asset!.label}"`).join(' and ')} {skullAsset?.provenance === 'estimated' && faceAsset?.provenance === 'estimated' ? 'are' : 'is'} estimated
              geometry, not a scan of this patient.
            </Notice>
          </div>
        )}
        {error && (
          <div className="mt-3">
            <Notice tone="warning">{error}</Notice>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div role="tablist" aria-label="Planning steps" className="flex flex-wrap gap-2">
          {TABS.map((name, index) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`pill min-h-[44px] ${tab === name ? 'border-transparent bg-white text-ink' : 'border-white/15 text-fog hover:border-white/40'}`}>
              {index + 1}. {name}
            </button>
          ))}
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <div hidden={tab !== 'Data'}>
            <DataPanel
              caseId={record.id}
              meshes={meshes}
              photos={photos}
              onMeshAdded={(asset, mesh) => {
                setRaw(current => ({ ...current, [asset.id]: mesh }))
                setMeshes(current => [...current, asset])
              }}
              onMeshDeleted={id => {
                const removed = meshes.find(mesh => mesh.id === id)
                setMeshes(current => current.filter(mesh => mesh.id !== id))
                // Points picked on a model that no longer exists would float in space.
                if (removed && removed.kind !== 'implant') setLandmarks(current => current.filter(item => item.layer !== removed.kind))
              }}
              onPhotosChanged={setPhotos}
            />
          </div>
          <div hidden={tab !== 'Landmarks'}>
            <LandmarksPanel meshes={meshes} landmarks={landmarks} measures={measures} after={afterLandmarks} onLandmarks={setLandmarks} onMeasures={setMeasures} requestPick={setPick} picking={pick !== null} />
          </div>
          <div hidden={tab !== 'Registration'}>
            <RegistrationPanel meshes={meshes} geometry={geometry} onAlign={align} requestPick={setPick} picking={pick !== null} />
          </div>
          <div hidden={tab !== 'Plan'}>
            <PlanPanel
              draft={draft}
              onDraft={setDraft}
              implantAssets={meshes.filter(mesh => mesh.kind === 'implant')}
              ready={Boolean(skullMesh && faceMesh)}
              issues={issues}
              running={running}
              onRun={runSimulation}
              stats={simulation && !stale ? simulation.result.operations : null}
              maxSkinMm={simulation ? simulation.result.maxSkinMm : null}
              stale={stale}
              requestPick={setPick}
              picking={pick !== null}
            />
          </div>
          <div hidden={tab !== 'Results'}>
            <ResultsPanel
              results={results}
              canSave={hasSimulation && !stale}
              saving={saving}
              onSave={includeThreeQuarter => void saveResult(includeThreeQuarter)}
              onResults={next => {
                setResults(next)
                // A photographic run spends a credit; read the balance back from the server.
                router.refresh()
              }}
              account={account}
              providerConsent={providerConsent}
              onProviderConsent={async () => {
                await sendJson('PATCH', `/api/planning/cases/${record.id}`, { providerConsent: true })
                setProviderConsent(true)
              }}
              hasFrontPhoto={photos.some(photo => photo.view === 'front')}
              disclaimer={disclaimer}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-ash">
          <p>Models, photographs and results are private to your account and deleted automatically after {account.retentionDays} days, or at once when you delete them.</p>
          <button type="button" onClick={deleteCase} className="btn-ghost btn-sm min-h-[44px]">
            Delete this case
          </button>
        </div>
      </div>
    </div>
  )
}
