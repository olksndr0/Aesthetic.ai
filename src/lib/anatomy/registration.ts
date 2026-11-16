import { PointGrid } from './grid'
import { IDENTITY, applyPoint, distance, multiply, type Mat4, type Vec3 } from './math'

export type RigidFit = {
  /** Rigid transform (rotation and translation, no scaling) that moves the source points onto the targets. */
  matrix: Mat4
  /** Root-mean-square distance between the moved source points and their targets, in mm. */
  rms: number
  /** Per-pair residual distance in mm. */
  residuals: number[]
}

/** Largest-eigenvalue eigenvector of a symmetric 4x4 matrix (cyclic Jacobi). */
function dominantEigenvector(matrix: number[][]): number[] {
  const a = matrix.map(row => [...row])
  const v: number[][] = [0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 50; sweep += 1) {
    let off = 0
    for (let p = 0; p < 4; p += 1) for (let q = p + 1; q < 4; q += 1) off += a[p]![q]! ** 2
    if (off < 1e-22) break
    for (let p = 0; p < 4; p += 1) {
      for (let q = p + 1; q < 4; q += 1) {
        if (Math.abs(a[p]![q]!) < 1e-300) continue
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!)
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < 4; k += 1) {
          const akp = a[k]![p]!
          const akq = a[k]![q]!
          a[k]![p] = c * akp - s * akq
          a[k]![q] = s * akp + c * akq
        }
        for (let k = 0; k < 4; k += 1) {
          const apk = a[p]![k]!
          const aqk = a[q]![k]!
          a[p]![k] = c * apk - s * aqk
          a[q]![k] = s * apk + c * aqk
        }
        for (let k = 0; k < 4; k += 1) {
          const vkp = v[k]![p]!
          const vkq = v[k]![q]!
          v[k]![p] = c * vkp - s * vkq
          v[k]![q] = s * vkp + c * vkq
        }
      }
    }
  }
  let best = 0
  for (let i = 1; i < 4; i += 1) if (a[i]![i]! > a[best]![best]!) best = i
  return v.map(row => row[best]!)
}

/**
 * Least-squares rigid alignment of paired points (Horn's quaternion method).
 * At least three non-collinear pairs are needed. Scale is never changed: both
 * point sets are already in millimetres.
 */
export function fitRigid(source: Vec3[], target: Vec3[]): RigidFit {
  if (source.length !== target.length || source.length < 3) throw new Error('At least three point pairs are required.')
  const n = source.length
  const mean = (points: Vec3[]): Vec3 => points.reduce<Vec3>((sum, p) => [sum[0] + p[0] / n, sum[1] + p[1] / n, sum[2] + p[2] / n], [0, 0, 0])
  const cs = mean(source)
  const ct = mean(target)

  const m = [0, 1, 2].map(() => [0, 0, 0])
  for (let i = 0; i < n; i += 1) {
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) m[r]![c] = m[r]![c]! + (source[i]![r]! - cs[r]!) * (target[i]![c]! - ct[c]!)
  }
  const [sxx, sxy, sxz] = m[0] as [number, number, number]
  const [syx, syy, syz] = m[1] as [number, number, number]
  const [szx, szy, szz] = m[2] as [number, number, number]
  const [w, x, y, z] = dominantEigenvector([
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ]) as [number, number, number, number]

  const rotation = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ]
  const t = [0, 1, 2].map(r => ct[r]! - (rotation[r]![0]! * cs[0] + rotation[r]![1]! * cs[1] + rotation[r]![2]! * cs[2]))
  const matrix: Mat4 = [...rotation[0]!, t[0]!, ...rotation[1]!, t[1]!, ...rotation[2]!, t[2]!, 0, 0, 0, 1]

  const residuals = source.map((point, i) => distance(applyPoint(matrix, point), target[i]!))
  const rms = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n)
  return { matrix, rms, residuals }
}

export type SurfaceFit = { matrix: Mat4; rmsBefore: number; rms: number; iterations: number; pointsUsed: number }

/**
 * Refines an alignment by iterative closest point: repeatedly pairs sampled
 * points of the moving surface with their nearest reference points and fits
 * rigidly, discarding the worst-matching share so regions absent from one
 * surface (hair, clothing, cropped areas) do not pull the result. Only valid
 * between two surfaces of the same tissue, already roughly aligned.
 */
export function refineSurfaceFit(moving: Float32Array, reference: Float32Array, options: { samples?: number; iterations?: number; keepShare?: number } = {}): SurfaceFit {
  const samples = options.samples ?? 3000
  const keepShare = options.keepShare ?? 0.8
  const count = moving.length / 3
  const stride = Math.max(1, Math.floor(count / samples))
  const points: Vec3[] = []
  for (let i = 0; i < count; i += stride) points.push([moving[i * 3]!, moving[i * 3 + 1]!, moving[i * 3 + 2]!])

  const grid = new PointGrid(reference, 4)
  let matrix = IDENTITY
  let rmsBefore = 0
  let rms = 0
  let iterations = 0

  for (; iterations < (options.iterations ?? 30); iterations += 1) {
    const pairs = points
      .map(point => {
        const moved = applyPoint(matrix, point)
        const hit = grid.nearest(moved[0], moved[1], moved[2])
        return { moved, target: [reference[hit.index * 3]!, reference[hit.index * 3 + 1]!, reference[hit.index * 3 + 2]!] as Vec3, d: hit.distance }
      })
      .sort((a, b) => a.d - b.d)
    const kept = pairs.slice(0, Math.max(3, Math.floor(pairs.length * keepShare)))
    const current = Math.sqrt(kept.reduce((sum, pair) => sum + pair.d * pair.d, 0) / kept.length)
    if (iterations === 0) rmsBefore = current
    const converged = iterations > 0 && Math.abs(rms - current) < 1e-4
    rms = current
    if (converged) break
    matrix = multiply(fitRigid(kept.map(pair => pair.moved), kept.map(pair => pair.target)).matrix, matrix)
  }
  return { matrix, rmsBefore, rms, iterations, pointsUsed: points.length }
}
