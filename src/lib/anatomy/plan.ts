import { z } from 'zod'

const finite = z.number().finite()
const vec3 = z.tuple([finite, finite, finite])
const limited = (max: number) => z.tuple([finite.min(-max).max(max), finite.min(-max).max(max), finite.min(-max).max(max)])

/**
 * What the 3D engine can and cannot simulate. Each supported procedure has
 * its own hard-tissue step; the unsupported ones need a model this project
 * does not contain and are refused instead of being approximated.
 */
export const PROCEDURE_SUPPORT = [
  {
    id: 'implant',
    label: 'Implant on bone',
    supported: true,
    detail: 'Chin, jaw-angle, malar or other onlay implant: a 3D shape placed on the skull with a position and an orientation.',
  },
  {
    id: 'osteotomy',
    label: 'Bone segment repositioning',
    supported: true,
    detail: 'A segment of the skull defined by a cutting plane, moved by a measured translation and rotation (for example a sliding genioplasty).',
  },
  {
    id: 'rhinoplasty',
    label: 'Rhinoplasty',
    supported: false,
    detail: 'Needs a model of nasal cartilage and skin envelope. Not available in the 3D engine.',
  },
  {
    id: 'soft-tissue',
    label: 'Soft-tissue procedures',
    supported: false,
    detail: 'Fillers, fat grafting, lifting and eyelid surgery change soft tissue directly and need dedicated models. Not available in the 3D engine.',
  },
] as const

/**
 * How the skin follows a hard-tissue change. Both values are entered by the
 * operator; the engine has no clinical default. `ratio` is the share of the
 * hard-tissue change that reaches the skin surface; `spreadMm` is the
 * distance over which that change is blended into the surrounding skin.
 */
export const softTissueSchema = z.object({
  ratio: finite.min(0).max(1.5),
  spreadMm: finite.min(1).max(40),
})

const common = {
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(80),
  softTissue: softTissueSchema,
}

export const implantSchema = z.object({
  ...common,
  kind: z.literal('implant'),
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('asset'), assetId: z.string().min(1).max(40) }),
    // A plain ellipsoid of the given full width, height and depth in mm: an envelope, not a product shape.
    z.object({ type: z.literal('ellipsoid'), sizeMm: z.tuple([finite.min(1).max(150), finite.min(1).max(150), finite.min(1).max(150)]) }),
  ]),
  /** Position of the implant's centre in the canonical frame, mm. */
  positionMm: limited(1000),
  rotationDeg: limited(360),
})

export const osteotomySchema = z.object({
  ...common,
  kind: z.literal('osteotomy'),
  /** The segment is the bone on the side the normal points to. */
  plane: z.object({ point: vec3, normal: vec3.refine(n => Math.hypot(...n) > 1e-6, 'The plane normal cannot be zero.') }),
  /** Optional sphere that bounds the segment, so a plane does not cut the whole skull. */
  limit: z.object({ centre: vec3, radiusMm: finite.min(1).max(300) }).nullable(),
  translationMm: limited(40),
  rotationDeg: limited(45),
})

export const operationSchema = z.discriminatedUnion('kind', [implantSchema, osteotomySchema])
export const planSchema = z.object({
  operations: z.array(operationSchema).min(1).max(6),
  notes: z.string().max(2000).default(''),
})

export type SoftTissue = z.infer<typeof softTissueSchema>
export type ImplantOperation = z.infer<typeof implantSchema>
export type OsteotomyOperation = z.infer<typeof osteotomySchema>
export type Operation = z.infer<typeof operationSchema>
export type Plan = z.infer<typeof planSchema>

/** One line per operation, for the record and for the image model. Only states what the operator entered. */
export function describeOperation(operation: Operation): string {
  const mm = (v: readonly number[]) => v.map(n => `${n >= 0 ? '+' : ''}${n}`).join(' / ')
  if (operation.kind === 'implant') {
    const shape = operation.geometry.type === 'ellipsoid' ? `ellipsoid envelope ${operation.geometry.sizeMm.join(' x ')} mm` : 'uploaded implant geometry'
    return `${operation.label}: implant on bone, region "${operation.region}", ${shape}, centre at ${mm(operation.positionMm)} mm (left / superior / anterior), rotated ${mm(operation.rotationDeg)}°.`
  }
  return `${operation.label}: bone segment repositioning, region "${operation.region}", moved ${mm(operation.translationMm)} mm (left / superior / anterior) and rotated ${mm(operation.rotationDeg)}°.`
}
