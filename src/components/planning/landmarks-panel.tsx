'use client'

import { useState } from 'react'

import { LANDMARKS, checkSides, landmarkDefinition, measureValue, parseLandmarkTable, type Landmark, type Layer, type Measure } from '@/lib/anatomy/landmarks'
import { LPS_TO_CANONICAL, UNITS, applyPoint, type Unit, type Vec3 } from '@/lib/anatomy/math'

import { Notice, Section, Select, StatusBadge, Text } from './atoms'
import type { MeshAsset } from './types'
import type { PickHit } from './viewer'

type Props = {
  meshes: MeshAsset[]
  landmarks: Landmark[]
  measures: Measure[]
  /** Positions after the simulation, when one has been run. */
  after: Map<string, { position: Vec3; movedMm: number }> | null
  onLandmarks: (landmarks: Landmark[]) => void
  onMeasures: (measures: Measure[]) => void
  /** Asks the viewer for one click on a layer; null cancels. */
  requestPick: (request: { layers: Layer[]; hint: string; handle: (hit: PickHit) => void } | null) => void
  picking: boolean
}

const id = () => Math.random().toString(36).slice(2, 10)
const coordinates = (position: Vec3) => position.map(value => value.toFixed(1)).join(' / ')

export function LandmarksPanel({ meshes, landmarks, measures, after, onLandmarks, onMeasures, requestPick, picking }: Props) {
  const layers = (['skull', 'face'] as Layer[]).filter(layer => meshes.some(mesh => mesh.kind === layer))
  const [layer, setLayer] = useState<Layer>('skull')
  const activeLayer = layers.includes(layer) ? layer : layers[0]
  const [code, setCode] = useState('')
  const [custom, setCustom] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [table, setTable] = useState('')
  const [unit, setUnit] = useState<Unit>('mm')
  const [frame, setFrame] = useState<'canonical' | 'lps'>('lps')
  const [importLayer, setImportLayer] = useState<Layer>('skull')
  const [importProvenance, setImportProvenance] = useState<'acquired' | 'estimated'>('acquired')
  const [importSource, setImportSource] = useState('')
  const [importErrors, setImportErrors] = useState<string[]>([])

  const [kind, setKind] = useState<'distance' | 'angle'>('distance')
  const [picks, setPicks] = useState<string[]>(['', '', ''])

  const catalogue = LANDMARKS.filter(item => item.layer === activeLayer && !landmarks.some(existing => existing.code === item.code))
  const chosen = code === 'custom' ? custom.trim() : code

  function place() {
    if (!activeLayer || !chosen) return
    if (landmarks.some(item => item.code.toLowerCase() === chosen.toLowerCase())) return setError(`"${chosen}" is already placed. Delete it first to place it again.`)
    setError(null)
    const mesh = meshes.find(item => item.kind === activeLayer)!
    const known = landmarkDefinition(chosen)
    requestPick({
      layers: [activeLayer],
      hint: `Click the ${activeLayer === 'skull' ? 'skull' : 'facial surface'} to place ${known?.name ?? chosen}.`,
      handle: hit => {
        onLandmarks([
          ...landmarks,
          {
            id: id(),
            code: known?.code ?? chosen,
            name: known?.name ?? chosen,
            layer: activeLayer,
            side: known?.side ?? null,
            position: hit.point.map(value => Math.round(value * 100) / 100) as Vec3,
            // A point picked on a surface is as reliable as that surface.
            provenance: mesh.provenance,
            source: source.trim() || `Picked on "${mesh.label}"`,
            unit: 'mm',
          },
        ])
        setCode('')
        requestPick(null)
      },
    })
  }

  function importTable() {
    const parsed = parseLandmarkTable(table, unit)
    const errors = [...parsed.errors]
    if (importSource.trim().length < 3) errors.push('State where these coordinates come from.')
    const added: Landmark[] = []
    for (const point of parsed.points) {
      if (landmarks.some(item => item.code.toLowerCase() === point.code.toLowerCase())) {
        errors.push(`"${point.code}" is already in the case and was skipped.`)
        continue
      }
      const known = landmarkDefinition(point.code)
      added.push({
        id: id(),
        code: point.code,
        name: point.name,
        layer: known?.layer ?? importLayer,
        side: known?.side ?? null,
        position: (frame === 'lps' ? applyPoint(LPS_TO_CANONICAL, point.position) : point.position).map(value => Math.round(value * 100) / 100) as Vec3,
        provenance: importProvenance,
        source: importSource.trim(),
        unit,
      })
    }
    setImportErrors(errors)
    if (importSource.trim().length >= 3 && added.length > 0) {
      onLandmarks([...landmarks, ...added])
      setTable('')
    }
  }

  const before = new Map(landmarks.map(item => [item.id, item.position]))
  const moved = after ? new Map([...after].map(([key, value]) => [key, value.position])) : null
  const sideIssues = checkSides(landmarks)
  const needed = kind === 'distance' ? 2 : 3
  const selection = picks.slice(0, needed)
  const canAddMeasure = selection.every(Boolean) && new Set(selection).size === needed

  return (
    <div className="space-y-8">
      <Section title="Place a landmark" hint="Coordinates are read from the calibrated geometry at the point you click, in millimetres in the anatomical frame.">
        {layers.length === 0 ? (
          <p className="text-sm text-ash">Add a skull or a facial surface first.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Select label="On" value={activeLayer!} onChange={setLayer} options={layers.map(value => ({ value, label: value === 'skull' ? 'Skull' : 'Facial surface' }))} />
              <Select
                label="Landmark"
                value={code}
                onChange={setCode}
                options={[{ value: '', label: 'Choose…' }, ...catalogue.map(item => ({ value: item.code, label: `${item.code} · ${item.name}` })), { value: 'custom', label: 'Other (name it)' }]}
              />
            </div>
            {code === 'custom' && <Text label="Name of the point" value={custom} onChange={setCustom} />}
            <Text label="Origin of the point (optional)" value={source} onChange={setSource} placeholder="Defaults to the model it was picked on" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={place} disabled={!chosen || picking} className="btn-primary btn-sm min-h-[44px]">
                Place on the model
              </button>
              {picking && (
                <button type="button" onClick={() => requestPick(null)} className="btn-ghost btn-sm min-h-[44px]">
                  Cancel
                </button>
              )}
            </div>
            {error && <Notice tone="warning">{error}</Notice>}
          </>
        )}
      </Section>

      <Section title="Import measured landmarks" hint="Paste a table or JSON: code, x, y, z per row. State the unit, the frame and where the numbers come from.">
        <textarea className="field min-h-[110px] font-mono text-xs" value={table} onChange={event => setTable(event.target.value)} placeholder={'code,x,y,z\nN,0.0,-92.4,31.0\nPog,1.2,-88.0,-61.5'} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Unit" value={unit} onChange={setUnit} options={UNITS.map(value => ({ value, label: value }))} />
          <Select
            label="Coordinate frame"
            value={frame}
            onChange={setFrame}
            options={[
              { value: 'lps', label: 'DICOM patient (x left, y posterior, z superior)' },
              { value: 'canonical', label: 'This workspace (left, superior, anterior)' },
            ]}
          />
          <Select label="Layer for unknown codes" value={importLayer} onChange={setImportLayer} options={[{ value: 'skull', label: 'Skull' }, { value: 'face', label: 'Facial surface' }]} />
          <Select
            label="These values are"
            value={importProvenance}
            onChange={setImportProvenance}
            options={[
              { value: 'acquired', label: 'Acquired (measured)' },
              { value: 'estimated', label: 'Estimated' },
            ]}
          />
        </div>
        <Text label="Origin of the data" value={importSource} onChange={setImportSource} placeholder="e.g. cephalometric analysis of 12 March, exported from Dolphin" />
        <button type="button" onClick={importTable} disabled={table.trim() === ''} className="btn-ghost btn-sm min-h-[44px]">
          Import
        </button>
        {importErrors.map(message => (
          <Notice key={message} tone="warning">
            {message}
          </Notice>
        ))}
      </Section>

      <Section title={`Landmarks (${landmarks.length})`} hint="Coordinates: left / superior / anterior, in mm.">
        {sideIssues.map(issue => (
          <Notice key={issue.code + issue.message} tone="warning">
            Left/right check: {issue.message}
          </Notice>
        ))}
        {landmarks.length > 0 && sideIssues.length === 0 && landmarks.some(item => item.side) && <Notice>Left/right check passed: right-side landmarks lie on the patient&rsquo;s right of their left counterparts.</Notice>}
        {landmarks.length === 0 && <p className="text-sm text-ash">No landmarks yet.</p>}
        <ul className="space-y-2">
          {landmarks.map(item => {
            const shift = after?.get(item.id)
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono">{item.code}</span> <span className="text-ash">{item.name}</span>
                  </p>
                  <p className="mt-1 font-mono text-xs text-ash">
                    {coordinates(item.position)}
                    {shift && shift.movedMm > 0.05 ? ` → ${coordinates(shift.position)} (${shift.movedMm.toFixed(1)} mm)` : ''}
                  </p>
                  <p className="mt-1 truncate text-xs text-ash">{item.source}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={shift && shift.movedMm > 0.05 ? 'modified' : item.provenance} />
                  <button
                    type="button"
                    aria-label={`Delete ${item.code}`}
                    onClick={() => {
                      onLandmarks(landmarks.filter(other => other.id !== item.id))
                      onMeasures(measures.filter(measure => !measure.landmarks.includes(item.id)))
                    }}
                    className="min-h-[44px] px-2 text-xs text-fog underline underline-offset-4"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Distances and angles" hint="Computed from the landmark coordinates above. An angle is measured at the middle landmark.">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Measure" value={kind} onChange={setKind} options={[{ value: 'distance', label: 'Distance (2 points)' }, { value: 'angle', label: 'Angle (3 points)' }]} />
          {selection.map((value, index) => (
            <Select
              key={index}
              label={kind === 'angle' && index === 1 ? 'Vertex' : `Point ${index + 1}`}
              value={value}
              onChange={next => setPicks(picks.map((old, at) => (at === index ? next : old)))}
              options={[{ value: '', label: 'Choose…' }, ...landmarks.map(item => ({ value: item.id, label: item.code }))]}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={!canAddMeasure}
          onClick={() => {
            const codes = selection.map(key => landmarks.find(item => item.id === key)!.code)
            onMeasures([...measures, { id: id(), kind, label: codes.join(kind === 'distance' ? ' – ' : ' ∠ '), landmarks: selection }])
            setPicks(['', '', ''])
          }}
          className="btn-ghost btn-sm min-h-[44px]"
        >
          Add measure
        </button>
        <ul className="space-y-2">
          {measures.map(measure => {
            const unitLabel = measure.kind === 'distance' ? ' mm' : '°'
            const valueBefore = measureValue(measure, before)
            const valueAfter = moved ? measureValue(measure, moved) : null
            return (
              <li key={measure.id} className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 text-sm">
                <span className="font-mono">{measure.label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono">
                    {valueBefore === null ? 'n/a' : `${valueBefore}${unitLabel}`}
                    {valueAfter !== null && valueAfter !== valueBefore ? ` → ${valueAfter}${unitLabel}` : ''}
                  </span>
                  <button type="button" aria-label={`Delete measure ${measure.label}`} onClick={() => onMeasures(measures.filter(other => other.id !== measure.id))} className="min-h-[44px] px-2 text-xs text-fog underline underline-offset-4">
                    Delete
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}
