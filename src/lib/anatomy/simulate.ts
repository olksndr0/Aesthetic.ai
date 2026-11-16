import { PointGrid } from './grid'
import type { Landmark } from './landmarks'
import { applyPoint, dot, normalize, rigid, sub, type Vec3 } from './math'
import { computeNormals, transformPositions, type Mesh } from './mesh'
import type { ImplantOperation, Operation, OsteotomyOperation, Plan, SoftTissue } from './plan'

/**
 * Illustrative simulation engine.
 *
 * Hard tissue is handled per procedure: an osteotomy moves a bone segment
 * rigidly, an implant adds its own shape on top of the bone. The skin is NOT
 * moved with the bone. Each skin point takes the hard-tissue change of the
 * bone beneath it, that change is blended over the surrounding skin and
 * scaled by the operator's ratio. This is a geometric illustration: it is not
 * a biomechanical model and has not been clinically validated.
 */
export const ENGINE = { name: 'illustrative-offset', version: 1, validated: false } as const

/** Skin farther than this from any bone is not driven by it (hair, neck, clothing, scan artefacts). */
const MAX_TISSUE_DEPTH_MM = 60

export type SimulationContext = {
  skull: Mesh
  face: Mesh
  skullGrid: PointGrid
  skullNormals: Float32Array
  /** Nearest skull vertex under each skin vertex, or -1. */
  skinToBone: Int32Array
  faceGrid: PointGrid
}

/** Precomputes what does not depend on the plan. Both meshes must be in the canonical frame. */
export function prepareSimulation(skull: Mesh, face: Mesh): SimulationContext {
  const skullGrid = new PointGrid(skull.positions, 3)
  const skinToBone = new Int32Array(face.positions.length / 3)
  for (let v = 0; v < skinToBone.length; v += 1) {
    skinToBone[v] = skullGrid.nearest(face.positions[v * 3]!, face.positions[v * 3 + 1]!, face.positions[v * 3 + 2]!, MAX_TISSUE_DEPTH_MM).index
  }
  return { skull, face, skullGrid, skullNormals: computeNormals(skull), skinToBone, faceGrid: new PointGrid(face.positions, 4) }
}

export type OperationStats = {
  id: string
  kind: Operation['kind']
  /** Largest hard-tissue change produced by this operation, mm. */
  maxHardMm: number
  /** Largest skin displacement it produces, mm. */
  maxSkinMm: number
  boneVertices: number
  warnings: string[]
}

export type SimulationResult = {
  skullAfter: Float32Array
  faceAfter: Float32Array
  /** Skin displacement vectors (x, y, z per vertex), mm. */
  faceDisplacement: Float32Array
  /** Hard-tissue displacement of each skull vertex from osteotomies, mm. */
  skullDisplacement: Float32Array
  /** Implant meshes in their planned position, by operation id. */
  implants: Map<string, Mesh>
  maxSkinMm: number
  operations: OperationStats[]
}

function osteotomySegment(skull: Float32Array, operation: OsteotomyOperation): { mask: Uint8Array; count: number; centroid: Vec3 } {
  const normal = normalize(operation.plane.normal as Vec3)
  const mask = new Uint8Array(skull.length / 3)
  const centroid: Vec3 = [0, 0, 0]
  let count = 0
  for (let v = 0; v < mask.length; v += 1) {
    const p: Vec3 = [skull[v * 3]!, skull[v * 3 + 1]!, skull[v * 3 + 2]!]
    if (dot(sub(p, operation.plane.point as Vec3), normal) <= 0) continue
    if (operation.limit && Math.hypot(...sub(p, operation.limit.centre as Vec3)) > operation.limit.radiusMm) continue
    mask[v] = 1
    count += 1
    centroid[0] += p[0]
    centroid[1] += p[1]
    centroid[2] += p[2]
  }
  return { mask, count, centroid: count > 0 ? [centroid[0] / count, centroid[1] / count, centroid[2] / count] : [0, 0, 0] }
}

/** Positions an implant shape (centred on its own origin, mm) according to the plan. */
export function placeImplant(shape: Mesh, operation: ImplantOperation): Mesh {
  return { positions: transformPositions(shape.positions, rigid(operation.positionMm as Vec3, operation.rotationDeg as Vec3, [0, 0, 0])), indices: shape.indices }
}

function meanEdge(mesh: Mesh): number {
  let sum = 0
  let n = 0
  const step = Math.max(3, Math.floor(mesh.indices.length / 3 / 500) * 3)
  for (let i = 0; i + 2 < mesh.indices.length; i += step) {
    const a = mesh.indices[i]! * 3
    const b = mesh.indices[i + 1]! * 3
    sum += Math.hypot(mesh.positions[a]! - mesh.positions[b]!, mesh.positions[a + 1]! - mesh.positions[b + 1]!, mesh.positions[a + 2]! - mesh.positions[b + 2]!)
    n += 1
  }
  return n > 0 ? sum / n : 1
}

/**
 * How far the implant raises the outer hard surface above each bone vertex:
 * for every implant vertex outside the bone, its offset from the nearest bone
 * vertex is recorded on the bone around that point, keeping the largest.
 */
function implantEnvelope(bone: Float32Array, boneGrid: PointGrid, boneNormals: Float32Array, implant: Mesh, warnings: string[]): Float32Array {
  const field = new Float32Array(bone.length)
  const heights = new Float32Array(bone.length / 3)
  const reach = Math.max(2, 1.5 * meanEdge(implant))
  let outside = 0
  let floating = 0
  let closest = Infinity
  const vertexCount = implant.positions.length / 3
  for (let v = 0; v < vertexCount; v += 1) {
    const x = implant.positions[v * 3]!
    const y = implant.positions[v * 3 + 1]!
    const z = implant.positions[v * 3 + 2]!
    const hit = boneGrid.nearest(x, y, z, MAX_TISSUE_DEPTH_MM)
    if (hit.index === -1) {
      floating += 1
      continue
    }
    closest = Math.min(closest, hit.distance)
    const j = hit.index * 3
    const ox = x - bone[j]!
    const oy = y - bone[j + 1]!
    const oz = z - bone[j + 2]!
    // Implant vertices behind the bone surface add nothing to the outer shape.
    if (ox * boneNormals[j]! + oy * boneNormals[j + 1]! + oz * boneNormals[j + 2]! <= 0) continue
    outside += 1
    boneGrid.within(bone[j]!, bone[j + 1]!, bone[j + 2]!, reach, k => {
      if (hit.distance > heights[k]!) {
        heights[k] = hit.distance
        field[k * 3] = ox
        field[k * 3 + 1] = oy
        field[k * 3 + 2] = oz
      }
    })
  }
  if (floating > vertexCount / 2) warnings.push('Most of the implant is more than 60 mm from any bone. Check its position.')
  else if (closest > 2) warnings.push(`The implant does not touch the bone: its closest point is ${closest.toFixed(1)} mm away. Check its position.`)
  else if (outside === 0) warnings.push('The implant lies entirely inside the bone, so it does not change the outer shape. Check its position.')
  return field
}

/**
 * Blends a per-bone-vertex change into a skin displacement, scaled by the
 * operator's ratio: each skin point takes the Gaussian-weighted mean, over the
 * surrounding skin, of the change of the bone under that skin. The mean is
 * taken over small clusters of skin vertices (a third of the spread wide),
 * which keeps the cost independent of mesh density.
 */
function softTissueResponse(context: SimulationContext, hard: Float32Array, softTissue: SoftTissue): Float32Array {
  const { face, skinToBone } = context
  const count = face.positions.length / 3
  const out = new Float32Array(count * 3)
  if (softTissue.ratio === 0) return out
  const sigma = softTissue.spreadMm
  const radius = 2.5 * sigma
  const cell = sigma / 3

  // Cluster the skin; each cluster carries its vertex count and the mean driven change.
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  for (let v = 0; v < count; v += 1) {
    minX = Math.min(minX, face.positions[v * 3]!)
    minY = Math.min(minY, face.positions[v * 3 + 1]!)
    minZ = Math.min(minZ, face.positions[v * 3 + 2]!)
  }
  const clusterOf = new Uint32Array(count)
  const keys = new Map<number, number>()
  const centres: number[] = []
  const changes: number[] = []
  const sizes: number[] = []
  let driven = false
  for (let v = 0; v < count; v += 1) {
    const x = face.positions[v * 3]!
    const y = face.positions[v * 3 + 1]!
    const z = face.positions[v * 3 + 2]!
    const key = Math.floor((x - minX) / cell) + 4096 * (Math.floor((y - minY) / cell) + 4096 * Math.floor((z - minZ) / cell))
    let cluster = keys.get(key)
    if (cluster === undefined) {
      cluster = sizes.length
      keys.set(key, cluster)
      sizes.push(0)
      centres.push(0, 0, 0)
      changes.push(0, 0, 0)
    }
    clusterOf[v] = cluster
    sizes[cluster] = sizes[cluster]! + 1
    centres[cluster * 3] = centres[cluster * 3]! + x
    centres[cluster * 3 + 1] = centres[cluster * 3 + 1]! + y
    centres[cluster * 3 + 2] = centres[cluster * 3 + 2]! + z
    const bone = skinToBone[v]!
    if (bone === -1) continue
    const hx = hard[bone * 3]!
    const hy = hard[bone * 3 + 1]!
    const hz = hard[bone * 3 + 2]!
    if (hx === 0 && hy === 0 && hz === 0) continue
    driven = true
    changes[cluster * 3] = changes[cluster * 3]! + hx
    changes[cluster * 3 + 1] = changes[cluster * 3 + 1]! + hy
    changes[cluster * 3 + 2] = changes[cluster * 3 + 2]! + hz
  }
  if (!driven) return out

  const clusterCentres = new Float32Array(centres.length)
  for (let c = 0; c < sizes.length; c += 1) {
    for (let a = 0; a < 3; a += 1) clusterCentres[c * 3 + a] = centres[c * 3 + a]! / sizes[c]!
  }
  const grid = new PointGrid(clusterCentres, radius / 2)

  // Only skin near a driven cluster can move.
  const near = new Uint8Array(sizes.length)
  for (let c = 0; c < sizes.length; c += 1) {
    if (changes[c * 3] === 0 && changes[c * 3 + 1] === 0 && changes[c * 3 + 2] === 0) continue
    grid.within(clusterCentres[c * 3]!, clusterCentres[c * 3 + 1]!, clusterCentres[c * 3 + 2]!, radius + cell, other => {
      near[other] = 1
    })
  }

  const falloff = -1 / (2 * sigma * sigma)
  for (let v = 0; v < count; v += 1) {
    if (!near[clusterOf[v]!]) continue
    let weight = 0
    let sx = 0
    let sy = 0
    let sz = 0
    grid.within(face.positions[v * 3]!, face.positions[v * 3 + 1]!, face.positions[v * 3 + 2]!, radius, (c, distanceSq) => {
      const w = Math.exp(distanceSq * falloff)
      // `changes` holds sums over the cluster, so the vertex count is already in the numerator.
      weight += w * sizes[c]!
      sx += w * changes[c * 3]!
      sy += w * changes[c * 3 + 1]!
      sz += w * changes[c * 3 + 2]!
    })
    if (weight === 0) continue
    out[v * 3] = (softTissue.ratio * sx) / weight
    out[v * 3 + 1] = (softTissue.ratio * sy) / weight
    out[v * 3 + 2] = (softTissue.ratio * sz) / weight
  }
  return out
}

function maxLength(field: Float32Array): number {
  let max = 0
  for (let i = 0; i < field.length; i += 3) max = Math.max(max, Math.hypot(field[i]!, field[i + 1]!, field[i + 2]!))
  return max
}

/**
 * Applies a plan. `implantShapes` holds, for each implant operation, the
 * shape centred on its own origin in mm (uploaded geometry or an ellipsoid).
 * Osteotomies are applied first, each to the original bone; implants are then
 * placed on the repositioned bone. Every view of the result must be rendered
 * from this one returned state.
 */
export function simulate(context: SimulationContext, plan: Plan, implantShapes: Map<string, Mesh>): SimulationResult {
  const { skull, face } = context
  const skullAfter = new Float32Array(skull.positions)
  const skullDisplacement = new Float32Array(skull.positions.length)
  const faceDisplacement = new Float32Array(face.positions.length)
  const implants = new Map<string, Mesh>()
  const operations: OperationStats[] = []
  const add = (field: Float32Array) => {
    for (let i = 0; i < field.length; i += 1) faceDisplacement[i] = faceDisplacement[i]! + field[i]!
  }

  const claimed = new Uint8Array(skull.positions.length / 3)
  for (const operation of plan.operations) {
    if (operation.kind !== 'osteotomy') continue
    const warnings: string[] = []
    const segment = osteotomySegment(skull.positions, operation)
    const hard = new Float32Array(skull.positions.length)
    if (segment.count === 0) warnings.push('The cutting plane and limit select no bone.')
    if (segment.count > 0.6 * segment.mask.length) warnings.push('The segment is more than 60% of the skull. Check the side of the plane and the limit.')
    const motion = rigid(operation.translationMm as Vec3, operation.rotationDeg as Vec3, segment.centroid)
    let overlap = false
    for (let v = 0; v < segment.mask.length; v += 1) {
      if (!segment.mask[v]) continue
      if (claimed[v]) {
        overlap = true
        continue
      }
      claimed[v] = 1
      const from: Vec3 = [skull.positions[v * 3]!, skull.positions[v * 3 + 1]!, skull.positions[v * 3 + 2]!]
      const to = applyPoint(motion, from)
      for (let a = 0; a < 3; a += 1) {
        hard[v * 3 + a] = to[a]! - from[a]!
        skullAfter[v * 3 + a] = to[a]!
        skullDisplacement[v * 3 + a] = to[a]! - from[a]!
      }
    }
    if (overlap) warnings.push('This segment overlaps an earlier one; the shared bone follows the earlier operation only.')
    const skin = softTissueResponse(context, hard, operation.softTissue)
    add(skin)
    operations.push({ id: operation.id, kind: 'osteotomy', maxHardMm: maxLength(hard), maxSkinMm: maxLength(skin), boneVertices: segment.count, warnings })
  }

  const moved = operations.length > 0
  const boneGrid = moved ? new PointGrid(skullAfter, 3) : context.skullGrid
  const boneNormals = moved ? computeNormals({ positions: skullAfter, indices: skull.indices }) : context.skullNormals
  for (const operation of plan.operations) {
    if (operation.kind !== 'implant') continue
    const warnings: string[] = []
    const shape = implantShapes.get(operation.id)
    if (!shape) {
      operations.push({ id: operation.id, kind: 'implant', maxHardMm: 0, maxSkinMm: 0, boneVertices: 0, warnings: ['The implant geometry is missing.'] })
      continue
    }
    const placed = placeImplant(shape, operation)
    implants.set(operation.id, placed)
    const hard = implantEnvelope(skullAfter, boneGrid, boneNormals, placed, warnings)
    const skin = softTissueResponse(context, hard, operation.softTissue)
    add(skin)
    let covered = 0
    for (let i = 0; i < hard.length; i += 3) if (hard[i] !== 0 || hard[i + 1] !== 0 || hard[i + 2] !== 0) covered += 1
    if (covered > 0 && maxLength(skin) === 0 && operation.softTissue.ratio > 0 && warnings.length === 0) {
      warnings.push('No skin lies over this implant, so the face does not change. Check its position and the alignment of skull and face.')
    }
    operations.push({ id: operation.id, kind: 'implant', maxHardMm: maxLength(hard), maxSkinMm: maxLength(skin), boneVertices: covered, warnings })
  }

  const faceAfter = new Float32Array(face.positions.length)
  for (let i = 0; i < faceAfter.length; i += 1) faceAfter[i] = face.positions[i]! + faceDisplacement[i]!
  return { skullAfter, faceAfter, faceDisplacement, skullDisplacement, implants, maxSkinMm: maxLength(faceDisplacement), operations }
}

/** Where each landmark ends up: skin points follow the skin displacement, bone points follow their segment. */
export function displacedLandmarks(context: SimulationContext, result: SimulationResult, landmarks: Landmark[]): Map<string, { position: Vec3; movedMm: number }> {
  const out = new Map<string, { position: Vec3; movedMm: number }>()
  for (const landmark of landmarks) {
    const [x, y, z] = landmark.position
    const grid = landmark.layer === 'face' ? context.faceGrid : context.skullGrid
    const field = landmark.layer === 'face' ? result.faceDisplacement : result.skullDisplacement
    const hit = grid.nearest(x, y, z, 10)
    const d: Vec3 = hit.index === -1 ? [0, 0, 0] : [field[hit.index * 3]!, field[hit.index * 3 + 1]!, field[hit.index * 3 + 2]!]
    out.set(landmark.id, { position: [x + d[0], y + d[1], z + d[2]], movedMm: Math.hypot(d[0], d[1], d[2]) })
  }
  return out
}
