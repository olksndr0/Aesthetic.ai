'use client'

import type { Vec3 } from '@/lib/anatomy/math'
import { PROCEDURE_SUPPORT, type ImplantOperation, type OsteotomyOperation, type Plan } from '@/lib/anatomy/plan'
import { ENGINE, type OperationStats } from '@/lib/anatomy/simulate'

import { Axes, Notice, Num, Section, Select, Text, mm } from './atoms'
import type { MeshAsset } from './types'
import type { PickHit } from './viewer'

/** An operation being edited: the soft-tissue values start empty, because the operator must enter them. */
export type DraftOperation = (Omit<ImplantOperation, 'softTissue'> | Omit<OsteotomyOperation, 'softTissue'>) & {
  softTissue: { ratio: number | null; spreadMm: number | null }
}

export function draftFromPlan(plan: Plan | null): DraftOperation[] {
  return plan ? plan.operations.map(operation => ({ ...operation })) : []
}

type Props = {
  draft: DraftOperation[]
  onDraft: (draft: DraftOperation[]) => void
  implantAssets: MeshAsset[]
  ready: boolean
  /** Why the plan cannot run yet, in words. Empty when it can. */
  issues: string[]
  running: boolean
  onRun: () => void
  stats: OperationStats[] | null
  maxSkinMm: number | null
  stale: boolean
  requestPick: (request: { layers: Array<'skull' | 'face'>; hint: string; handle: (hit: PickHit) => void } | null) => void
  picking: boolean
}

const id = () => Math.random().toString(36).slice(2, 10)
const round = (point: Vec3): Vec3 => point.map(value => Math.round(value * 10) / 10) as Vec3

const SIDES: Array<{ value: string; label: string; normal: Vec3 }> = [
  { value: 'inferior', label: 'below the plane', normal: [0, -1, 0] },
  { value: 'superior', label: 'above the plane', normal: [0, 1, 0] },
  { value: 'anterior', label: 'in front of the plane', normal: [0, 0, 1] },
  { value: 'posterior', label: 'behind the plane', normal: [0, 0, -1] },
  { value: 'left', label: "on the patient's left of the plane", normal: [1, 0, 0] },
  { value: 'right', label: "on the patient's right of the plane", normal: [-1, 0, 0] },
]
const sideOf = (normal: readonly number[]) => SIDES.find(side => side.normal.every((value, index) => value === normal[index]))?.value ?? 'custom'

export function PlanPanel({ draft, onDraft, implantAssets, ready, issues, running, onRun, stats, maxSkinMm, stale, requestPick, picking }: Props) {
  const update = (index: number, patch: Partial<DraftOperation>) => onDraft(draft.map((operation, at) => (at === index ? ({ ...operation, ...patch } as DraftOperation) : operation)))

  const pickPoint = (layer: 'skull' | 'face', hint: string, apply: (point: Vec3) => void) =>
    requestPick({
      layers: [layer],
      hint,
      handle: hit => {
        apply(round(hit.point))
        requestPick(null)
      },
    })

  return (
    <div className="space-y-8">
      <Section title="What can be simulated in 3D" hint="Each procedure is handled by its own hard-tissue step. Procedures without a suitable model are refused instead of being approximated with one that does not fit them.">
        <ul className="space-y-2">
          {PROCEDURE_SUPPORT.map(item => (
            <li key={item.id} className="rounded-xl border border-line px-4 py-3">
              <p className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-ash">{item.supported ? 'Supported' : 'Not supported'}</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ash">{item.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Operations"
        hint="Every value is entered by you. Nothing here is a surgical recommendation and no value is suggested. Positions are in mm in the anatomical frame (left / superior / anterior)."
      >
        {!ready && <Notice>The 3D engine needs both a skull and a facial surface: the change is defined on bone and its effect is shown on skin.</Notice>}
        {draft.map((operation, index) => (
          <div key={operation.id} className="space-y-4 rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">{operation.kind === 'implant' ? 'Implant on bone' : 'Bone segment repositioning'}</p>
              <button type="button" onClick={() => onDraft(draft.filter((_, at) => at !== index))} className="min-h-[44px] px-2 text-xs text-fog underline underline-offset-4">
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Text label="Name of the operation" value={operation.label} onChange={label => update(index, { label })} />
              <Text label="Region" value={operation.region} onChange={region => update(index, { region })} placeholder="e.g. chin, left jaw angle" />
            </div>

            {operation.kind === 'implant' ? (
              <>
                <Select
                  label="Implant geometry"
                  value={operation.geometry.type === 'asset' ? operation.geometry.assetId : 'ellipsoid'}
                  onChange={value => update(index, { geometry: value === 'ellipsoid' ? { type: 'ellipsoid', sizeMm: [0, 0, 0] } : { type: 'asset', assetId: value } })}
                  options={[{ value: 'ellipsoid', label: 'Ellipsoid envelope (enter its size)' }, ...implantAssets.map(asset => ({ value: asset.id, label: `Uploaded: ${asset.label}` }))]}
                />
                {operation.geometry.type === 'ellipsoid' ? (
                  <Axes
                    label="Size of the envelope (a plain ellipsoid, not a product shape)"
                    unit="mm"
                    labels={['Width L–R', 'Height S–I', 'Depth A–P']}
                    value={operation.geometry.sizeMm as Vec3}
                    onChange={sizeMm => update(index, { geometry: { type: 'ellipsoid', sizeMm } })}
                  />
                ) : (
                  <p className="font-mono text-xs text-ash">
                    Uploaded shape: {implantAssets.find(asset => operation.geometry.type === 'asset' && asset.id === operation.geometry.assetId)?.meta.measured?.sizeMm.join(' × ') ?? '?'} mm
                  </p>
                )}
                <Axes label="Position of the implant's centre" unit="mm" value={operation.positionMm as Vec3} onChange={positionMm => update(index, { positionMm })} />
                <button
                  type="button"
                  disabled={picking || !ready}
                  onClick={() => pickPoint('skull', 'Click the bone where the centre of the implant sits.', positionMm => update(index, { positionMm }))}
                  className="btn-ghost btn-sm min-h-[44px]"
                >
                  Pick the position on the skull
                </button>
                <Axes label="Orientation" unit="°" labels={['About L–R', 'About S–I', 'About A–P']} step={1} value={operation.rotationDeg as Vec3} onChange={rotationDeg => update(index, { rotationDeg })} />
              </>
            ) : (
              <>
                <Axes label="A point on the cutting plane" unit="mm" value={operation.plane.point as Vec3} onChange={point => update(index, { plane: { ...operation.plane, point } })} />
                <button
                  type="button"
                  disabled={picking || !ready}
                  onClick={() => pickPoint('skull', 'Click the bone at a point the cut passes through.', point => update(index, { plane: { ...operation.plane, point } }))}
                  className="btn-ghost btn-sm min-h-[44px]"
                >
                  Pick the point on the skull
                </button>
                <Select
                  label="The segment to move is the bone"
                  value={sideOf(operation.plane.normal)}
                  onChange={value => {
                    const side = SIDES.find(item => item.value === value)
                    update(index, { plane: { ...operation.plane, normal: side ? side.normal : [0, -1, 0.001] } })
                  }}
                  options={[...SIDES.map(side => ({ value: side.value, label: side.label })), { value: 'custom', label: 'on the side of a custom direction (oblique cut)' }]}
                />
                {sideOf(operation.plane.normal) === 'custom' && (
                  <Axes label="Direction from the plane into the segment" unit="vector" step={0.1} value={operation.plane.normal as Vec3} onChange={normal => update(index, { plane: { ...operation.plane, normal } })} />
                )}
                <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                  <Num
                    label="Limit the segment to a sphere of radius"
                    unit="mm, empty for no limit"
                    value={operation.limit?.radiusMm ?? null}
                    min={1}
                    onChange={radiusMm => update(index, { limit: radiusMm === null ? null : { centre: operation.limit?.centre ?? (operation.plane.point as Vec3), radiusMm } })}
                  />
                  <button
                    type="button"
                    disabled={picking || !ready || !operation.limit}
                    onClick={() => pickPoint('skull', 'Click the centre of the region that contains the segment.', centre => update(index, { limit: { centre, radiusMm: operation.limit?.radiusMm ?? 30 } }))}
                    className="btn-ghost btn-sm min-h-[44px]"
                  >
                    Pick its centre
                  </button>
                </div>
                {operation.limit && <p className="font-mono text-xs text-ash">Sphere centre: {operation.limit.centre.join(' / ')} mm</p>}
                <Axes label="Movement of the segment" unit="mm" value={operation.translationMm as Vec3} onChange={translationMm => update(index, { translationMm })} />
                <Axes label="Rotation of the segment about its centre" unit="°" labels={['About L–R', 'About S–I', 'About A–P']} step={1} value={operation.rotationDeg as Vec3} onChange={rotationDeg => update(index, { rotationDeg })} />
              </>
            )}

            <fieldset className="rounded-lg border border-dashed border-white/20 p-3">
              <legend className="px-1 text-sm text-fog">Soft-tissue response (illustrative)</legend>
              <p className="mb-3 text-xs leading-relaxed text-ash">
                How the skin follows this change. These two values are yours: the engine has no clinical default and does not derive them from the patient.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Num
                  label="Share of the hard-tissue change reaching the skin"
                  unit="0 to 1.5"
                  step={0.05}
                  min={0}
                  max={1.5}
                  value={operation.softTissue.ratio}
                  placeholder="enter"
                  onChange={ratio => update(index, { softTissue: { ...operation.softTissue, ratio } })}
                />
                <Num
                  label="Distance over which it blends into the skin"
                  unit="mm"
                  min={1}
                  max={40}
                  value={operation.softTissue.spreadMm}
                  placeholder="enter"
                  onChange={spreadMm => update(index, { softTissue: { ...operation.softTissue, spreadMm } })}
                />
              </div>
            </fieldset>

            {stats?.find(item => item.id === operation.id) &&
              (() => {
                const result = stats.find(item => item.id === operation.id)!
                return (
                  <div className="space-y-2">
                    <p className="font-mono text-xs text-ash">
                      Hard-tissue change up to {mm(result.maxHardMm)} · skin displacement up to {mm(result.maxSkinMm)} · {result.boneVertices.toLocaleString('en-GB')} bone vertices involved
                    </p>
                    {result.warnings.map(warning => (
                      <Notice key={warning} tone="warning">
                        {warning}
                      </Notice>
                    ))}
                  </div>
                )
              })()}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={draft.length >= 6}
            onClick={() =>
              onDraft([...draft, { id: id(), kind: 'implant', label: '', region: '', geometry: { type: 'ellipsoid', sizeMm: [0, 0, 0] }, positionMm: [0, 0, 0], rotationDeg: [0, 0, 0], softTissue: { ratio: null, spreadMm: null } }])
            }
            className="btn-ghost btn-sm min-h-[44px]"
          >
            Add an implant
          </button>
          <button
            type="button"
            disabled={draft.length >= 6}
            onClick={() =>
              onDraft([
                ...draft,
                { id: id(), kind: 'osteotomy', label: '', region: '', plane: { point: [0, 0, 0], normal: [0, -1, 0] }, limit: null, translationMm: [0, 0, 0], rotationDeg: [0, 0, 0], softTissue: { ratio: null, spreadMm: null } },
              ])
            }
            className="btn-ghost btn-sm min-h-[44px]"
          >
            Add a bone segment repositioning
          </button>
        </div>
      </Section>

      <Section title="Simulation">
        <Notice>
          Engine &ldquo;{ENGINE.name}&rdquo; v{ENGINE.version}: a geometric illustration, not a biomechanical or statistically trained prediction, and not clinically validated. The bone change is exact as entered; the skin response is the
          blended, scaled offset you configured. A bone cut is not re-meshed, so the surface stretches across it.
        </Notice>
        {issues.map(issue => (
          <p key={issue} className="text-sm text-fog">
            • {issue}
          </p>
        ))}
        <button type="button" onClick={onRun} disabled={!ready || issues.length > 0 || running || draft.length === 0} className="btn-primary min-h-[46px] w-full">
          {running ? 'Computing…' : stale ? 'Run the simulation again' : 'Run the simulation'}
        </button>
        {maxSkinMm !== null && !stale && (
          <p role="status" className="text-sm text-fog">
            Simulated. Largest skin displacement: <span className="font-mono text-white">{mm(maxSkinMm)}</span>. The viewer shows the &ldquo;after&rdquo; state; changed skin is tinted.
          </p>
        )}
        {stale && maxSkinMm !== null && <p className="text-sm text-fog">The plan or the geometry changed since the last run.</p>}
      </Section>
    </div>
  )
}
