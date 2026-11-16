'use client'

import { useMemo, useState } from 'react'

import { PointGrid } from '@/lib/anatomy/grid'
import { rigid, type Mat4, type Vec3 } from '@/lib/anatomy/math'
import { bounds, type Mesh } from '@/lib/anatomy/mesh'
import { fitRigid } from '@/lib/anatomy/registration'
import type { TransformStep } from '@/lib/anatomy/schema'

import { Axes, Notice, Section, Select } from './atoms'
import type { MeshAsset } from './types'
import type { PickHit } from './viewer'

type Props = {
  meshes: MeshAsset[]
  /** Canonical geometry by asset id. */
  geometry: Record<string, Mesh>
  /** Applies a rigid correction (in the anatomical frame) to a model and records the step. */
  onAlign: (assetId: string, correction: Mat4, step: TransformStep) => Promise<void>
  requestPick: (request: { layers: Array<'skull' | 'face'>; hint: string; handle: (hit: PickHit) => void } | null) => void
  picking: boolean
}

type Pair = { moving: Vec3; reference: Vec3 }

/** Distance from sampled skin points to the nearest bone: a plausibility check of the skull-to-face alignment. */
function tissueDepth(skull: Mesh, face: Mesh): { median: number; p10: number; p90: number } {
  const grid = new PointGrid(skull.positions, 4)
  const count = face.positions.length / 3
  const stride = Math.max(1, Math.floor(count / 1500))
  const depths: number[] = []
  for (let v = 0; v < count; v += stride) {
    const hit = grid.nearest(face.positions[v * 3]!, face.positions[v * 3 + 1]!, face.positions[v * 3 + 2]!, 80)
    if (hit.index !== -1) depths.push(hit.distance)
  }
  depths.sort((a, b) => a - b)
  const at = (share: number) => depths[Math.min(depths.length - 1, Math.floor(share * depths.length))] ?? 0
  return { median: at(0.5), p10: at(0.1), p90: at(0.9) }
}

export function RegistrationPanel({ meshes, geometry, onAlign, requestPick, picking }: Props) {
  const skull = meshes.find(mesh => mesh.kind === 'skull')
  const face = meshes.find(mesh => mesh.kind === 'face')
  const [moving, setMoving] = useState<'skull' | 'face'>('face')
  const [pairs, setPairs] = useState<Pair[]>([])
  const [shift, setShift] = useState<Vec3>([0, 0, 0])
  const [turn, setTurn] = useState<Vec3>([0, 0, 0])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const skullMesh = skull ? geometry[skull.id] : undefined
  const faceMesh = face ? geometry[face.id] : undefined
  const depth = useMemo(() => (skullMesh && faceMesh ? tissueDepth(skullMesh, faceMesh) : null), [skullMesh, faceMesh])

  if (!skull || !face) {
    return <p className="text-sm text-ash">Registration aligns a facial surface with a skull. Add both to the case first.</p>
  }
  const sameAcquisition = skull.meta.format === 'dicom' && face.meta.format === 'dicom' && skull.meta.sourceHash === face.meta.sourceHash
  const movingAsset = moving === 'skull' ? skull : face
  const reference = moving === 'skull' ? 'face' : 'skull'

  function pickPair() {
    requestPick({
      layers: [moving],
      hint: `Click a point on the ${moving === 'skull' ? 'skull' : 'facial surface'} (the model that will move).`,
      handle: first => {
        requestPick({
          layers: [reference],
          hint: `Now click where that point belongs on the ${reference === 'skull' ? 'skull' : 'facial surface'}.`,
          handle: second => {
            setPairs(current => [...current, { moving: first.point, reference: second.point }])
            requestPick(null)
          },
        })
      },
    })
  }

  async function apply(correction: Mat4, step: TransformStep) {
    setBusy(true)
    setMessage(null)
    try {
      await onAlign(movingAsset.id, correction, step)
      setMessage(step.rmsMm === null ? 'Correction applied.' : `Alignment applied. Residual ${step.rmsMm.toFixed(2)} mm.`)
      setPairs([])
      setShift([0, 0, 0])
      setTurn([0, 0, 0])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The alignment could not be saved.')
    }
    setBusy(false)
  }

  function fit() {
    const result = fitRigid(pairs.map(pair => pair.moving), pairs.map(pair => pair.reference))
    void apply(result.matrix, {
      kind: 'pairs',
      note: `Rigid fit of "${movingAsset.label}" to the ${reference} from ${pairs.length} point pairs (largest residual ${Math.max(...result.residuals).toFixed(2)} mm).`,
      rmsMm: Math.round(result.rms * 100) / 100,
      at: new Date().toISOString(),
    })
  }

  function nudge() {
    const mesh = geometry[movingAsset.id]
    if (!mesh) return
    void apply(rigid(shift, turn, bounds(mesh.positions).centre), {
      kind: 'manual',
      note: `Manual correction of "${movingAsset.label}": moved ${shift.join(' / ')} mm (left / superior / anterior), rotated ${turn.join(' / ')}° about its centre.`,
      rmsMm: null,
      at: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-8">
      <Section title="Current alignment">
        {sameAcquisition ? (
          <Notice>Skull and skin come from the same CT volume, so they are registered by construction. No alignment is needed.</Notice>
        ) : (
          <Notice tone="warning">
            The skull and the facial surface come from different sources. Their relative position is only as good as the alignment below; check it before trusting any measurement that spans both.
          </Notice>
        )}
        {depth && (
          <p className="text-sm leading-relaxed text-fog">
            Check: distance from the skin to the nearest bone, over sampled skin points: median <span className="font-mono text-white">{depth.median.toFixed(1)} mm</span>, 10th to 90th percentile{' '}
            <span className="font-mono text-white">
              {depth.p10.toFixed(1)} to {depth.p90.toFixed(1)} mm
            </span>
            . Values near zero over large areas, or tens of millimetres over the face, indicate a misalignment. In the viewer, lower the skin opacity to inspect the fit.
          </p>
        )}
      </Section>

      <Section title="Align by point pairs" hint="Pick at least three pairs of corresponding points, spread apart and not in a line. The fit is rigid: it rotates and moves, never rescales.">
        <Select label="Model to move" value={moving} onChange={value => { setMoving(value); setPairs([]) }} options={[{ value: 'face', label: `Facial surface: ${face.label}` }, { value: 'skull', label: `Skull: ${skull.label}` }]} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={pickPair} disabled={picking || busy} className="btn-ghost btn-sm min-h-[44px]">
            Pick a pair ({pairs.length})
          </button>
          {picking && (
            <button type="button" onClick={() => requestPick(null)} className="btn-ghost btn-sm min-h-[44px]">
              Cancel
            </button>
          )}
          <button type="button" onClick={fit} disabled={pairs.length < 3 || busy} className="btn-primary btn-sm min-h-[44px]">
            Fit and apply
          </button>
          {pairs.length > 0 && (
            <button type="button" onClick={() => setPairs([])} className="btn-ghost btn-sm min-h-[44px]">
              Clear pairs
            </button>
          )}
        </div>
      </Section>

      <Section title="Manual correction" hint="Applied to the model chosen above, in the anatomical frame, and recorded in its history.">
        <Axes label="Move" unit="mm" value={shift} onChange={setShift} />
        <Axes label="Rotate about" unit="°" value={turn} onChange={setTurn} labels={['L–R axis', 'S–I axis', 'A–P axis']} step={1} />
        <button type="button" onClick={nudge} disabled={busy || [...shift, ...turn].every(value => value === 0)} className="btn-ghost btn-sm min-h-[44px]">
          Apply correction
        </button>
      </Section>

      {message && <Notice>{message}</Notice>}

      <Section title="Alignment history">
        {[skull, face].map(mesh => (
          <div key={mesh.id}>
            <p className="text-sm font-medium">{mesh.label}</p>
            <ol className="mt-2 space-y-1 text-xs text-ash">
              {mesh.meta.steps.map((step, index) => (
                <li key={index}>
                  {index + 1}. {step.note}
                  {step.rmsMm !== null ? ` Residual ${step.rmsMm.toFixed(2)} mm.` : ''}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </Section>
    </div>
  )
}
