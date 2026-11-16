import 'server-only'

import { createHash } from 'node:crypto'

import type { CaseAsset } from '@prisma/client'
import sharp from 'sharp'

import { det3, scaleOf, type Mat4 } from './anatomy/math'
import { MeshError, bounds, decodeMesh, transformPositions } from './anatomy/mesh'
import type { MeshKind } from './anatomy/schema'
import { db } from './db'
import { storage } from './storage'

export const MAX_MESH_BYTES = 96 * 1024 * 1024
export const MAX_CASES_PER_USER = 40
export const MAX_ASSETS_PER_CASE = 60
export const MAX_RESULTS_PER_CASE = 20

export class PlanningError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function assetKey(userId: string, caseId: string, assetId: string, extension: string): string {
  return `u/${userId}/cases/${caseId}/${assetId}.${extension}`
}

// Ownership is part of every query: another account's id answers "not found".
export function ownedCase(id: string, userId: string) {
  return db.planningCase.findFirst({ where: { id, userId } })
}

export function ownedAsset(id: string, userId: string) {
  return db.caseAsset.findFirst({ where: { id, case: { userId } }, include: { case: true } })
}

export function ownedResult(id: string, userId: string) {
  return db.caseResult.findFirst({ where: { id, case: { userId } }, include: { case: true, files: true } })
}

export async function removeAssetFiles(assets: Array<Pick<CaseAsset, 'key'>>): Promise<void> {
  await Promise.all(assets.map(asset => storage().remove(asset.key).catch(() => undefined)))
}

/** Deletes a case with every file it owns. */
export async function deleteCase(id: string, userId: string): Promise<boolean> {
  const found = await db.planningCase.findFirst({ where: { id, userId }, include: { assets: true } })
  if (!found) return false
  await removeAssetFiles(found.assets)
  await db.planningCase.delete({ where: { id } })
  return true
}

export async function deleteAllUserCases(userId: string): Promise<void> {
  await removeAssetFiles(await db.caseAsset.findMany({ where: { case: { userId } }, select: { key: true } }))
  await db.planningCase.deleteMany({ where: { userId } })
}

/** Removes cases past the retention date, files first. */
export async function purgeExpiredCases(now = new Date()): Promise<number> {
  const expired = await db.planningCase.findMany({ where: { expiresAt: { lte: now } }, include: { assets: { select: { key: true } } }, take: 200 })
  for (const item of expired) {
    await removeAssetFiles(item.assets)
    await db.planningCase.delete({ where: { id: item.id } })
  }
  return expired.length
}

// Plausible extent of the longest side, in mm, once the transform is applied.
// A head measured in the wrong unit lands far outside these ranges.
const SIZE_RANGE: Record<MeshKind, [number, number]> = { skull: [80, 450], face: [60, 450], implant: [1, 250] }

/**
 * Full check of an uploaded mesh: structure, coordinates, and scale. Returns
 * the facts the server measured itself, in canonical millimetres.
 */
export function inspectMesh(bytes: Uint8Array, kind: MeshKind, transform: Mat4) {
  let mesh
  try {
    mesh = decodeMesh(bytes)
  } catch (error) {
    throw new PlanningError('invalid_mesh', error instanceof MeshError ? error.message : 'The mesh could not be read.')
  }
  const determinant = det3(transform)
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) throw new PlanningError('invalid_transform', 'The alignment transform is not valid.')

  const box = bounds(transformPositions(mesh.positions, transform))
  const longest = Math.max(...box.size)
  const [min, max] = SIZE_RANGE[kind]
  if (longest < min || longest > max) {
    const size = box.size.map(value => (value >= 10 ? value.toFixed(0) : value.toPrecision(2))).join(' x ')
    throw new PlanningError(
      'implausible_scale',
      `This ${kind === 'implant' ? 'implant' : 'model'} measures ${size} mm with the chosen unit, outside the expected ${min} to ${max} mm. Check the unit of the file.`,
    )
  }
  return {
    vertices: mesh.positions.length / 3,
    triangles: mesh.indices.length / 3,
    sizeMm: box.size.map(value => Math.round(value * 10) / 10),
    centreMm: box.centre.map(value => Math.round(value * 10) / 10),
    scale: Math.round(scaleOf(transform) * 1e6) / 1e6,
    /** A mirroring transform swaps anatomical left and right; it is only stored when the operator declared the file mirrored. */
    mirrored: determinant < 0,
  }
}

/**
 * Objective facts about a photograph, used to flag images that are likely
 * unusable. Sharpness is the variance of the Laplacian at a fixed width: a
 * heuristic, not a measurement of focus.
 */
export async function photoQuality(jpeg: Buffer) {
  const { data, info } = await sharp(jpeg).greyscale().resize({ width: 512 }).raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  let sum = 0
  let sumSq = 0
  let brightness = 0
  let n = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = x + width * y
      const laplacian = data[i - 1]! + data[i + 1]! + data[i - width]! + data[i + width]! - 4 * data[i]!
      sum += laplacian
      sumSq += laplacian * laplacian
      brightness += data[i]!
      n += 1
    }
  }
  const sharpness = Math.round((sumSq / n - (sum / n) ** 2) * 10) / 10
  const mean = Math.round(brightness / n)
  const flags: string[] = []
  if (sharpness < 15) flags.push('blurry')
  if (mean < 45) flags.push('dark')
  if (mean > 220) flags.push('overexposed')
  return { sharpness, brightness: mean, flags, hash: createHash('sha256').update(jpeg).digest('hex').slice(0, 32) }
}
