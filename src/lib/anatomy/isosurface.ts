import { applyPoint, det3, type Mat4 } from './math'
import type { Mesh } from './mesh'

/** Scalar volume. `indexToWorld` maps a voxel index (i, j, k) to canonical millimetres. */
export type Volume = {
  data: Int16Array
  dims: [number, number, number]
  indexToWorld: Mat4
}

// The 12 edges of a cell as corner pairs. Corner bit 0 is +i, bit 1 is +j, bit 2 is +k.
const EDGES = [0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7]

class Growable<T extends Float32Array | Uint32Array> {
  length = 0
  constructor(private array: T) {}

  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.array.length) {
      const next = new (this.array.constructor as new (size: number) => T)(this.array.length * 2)
      next.set(this.array)
      this.array = next
    }
    this.array[this.length] = a
    this.array[this.length + 1] = b
    this.array[this.length + 2] = c
    this.length += 3
  }

  done(): T {
    return this.array.slice(0, this.length) as T
  }
}

/**
 * Surface of the region where the volume is at or above `iso` (surface nets:
 * one vertex per cell the surface crosses, shared between neighbours, so the
 * result is an indexed mesh). Triangles face the lower-valued side, i.e. out
 * of the denser tissue. Positions are in canonical millimetres.
 */
export function extractSurface(volume: Volume, iso: number): Mesh {
  const { data, dims, indexToWorld } = volume
  const [nx, ny, nz] = dims
  // Samples are integers: a level between two integers never coincides with a
  // sample, which would collapse neighbouring vertices into zero-area triangles.
  const level = Number.isInteger(iso) ? iso - 0.5 : iso
  const positions = new Growable(new Float32Array(3 * 65_536))
  const indices = new Growable(new Uint32Array(3 * 131_072))
  let previous = new Int32Array(nx * ny).fill(-1)
  let current = new Int32Array(nx * ny).fill(-1)
  const values = new Float64Array(8)
  // A mirroring index-to-world transform reverses the winding.
  const flip = det3(indexToWorld) < 0

  const quad = (a: number, b: number, c: number, d: number, outward: boolean) => {
    if (outward !== flip) {
      indices.push3(a, b, c)
      indices.push3(a, c, d)
    } else {
      indices.push3(a, c, b)
      indices.push3(a, d, c)
    }
  }

  for (let z = 0; z < nz - 1; z += 1) {
    current.fill(-1)
    for (let y = 0; y < ny - 1; y += 1) {
      for (let x = 0; x < nx - 1; x += 1) {
        const base = x + nx * (y + ny * z)
        let mask = 0
        for (let corner = 0; corner < 8; corner += 1) {
          const value = data[base + (corner & 1) + (corner & 2 ? nx : 0) + (corner & 4 ? nx * ny : 0)]!
          values[corner] = value
          if (value >= level) mask |= 1 << corner
        }
        if (mask === 0 || mask === 255) continue

        // The vertex is the mean of the points where the surface crosses the cell's edges.
        let px = 0
        let py = 0
        let pz = 0
        let crossings = 0
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e]!
          const b = EDGES[e + 1]!
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue
          const t = (level - values[a]!) / (values[b]! - values[a]!)
          px += (a & 1) + t * ((b & 1) - (a & 1))
          py += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1))
          pz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1))
          crossings += 1
        }
        const world = applyPoint(indexToWorld, [x + px / crossings, y + py / crossings, z + pz / crossings])
        const vertex = positions.length / 3
        positions.push3(world[0], world[1], world[2])
        current[x + nx * y] = vertex

        // One quad per crossed edge leaving the cell's first corner, joining the four cells around it.
        const inside = (mask & 1) === 1
        if (((mask >> 1) & 1) !== (mask & 1) && y > 0 && z > 0) {
          quad(vertex, current[x + nx * (y - 1)]!, previous[x + nx * (y - 1)]!, previous[x + nx * y]!, inside)
        }
        if (((mask >> 2) & 1) !== (mask & 1) && x > 0 && z > 0) {
          quad(vertex, previous[x + nx * y]!, previous[x - 1 + nx * y]!, current[x - 1 + nx * y]!, inside)
        }
        if (((mask >> 4) & 1) !== (mask & 1) && x > 0 && y > 0) {
          quad(vertex, current[x - 1 + nx * y]!, current[x - 1 + nx * (y - 1)]!, current[x + nx * (y - 1)]!, inside)
        }
      }
    }
    const swap = previous
    previous = current
    current = swap
  }

  return { positions: positions.done(), indices: indices.done() }
}

/** Index-to-world transform of a volume averaged in `factor`-sized blocks: new index i' sits at old index f * i' + (f - 1) / 2. */
export function blockTransform(m: Mat4, factor: [number, number, number]): Mat4 {
  const [fx, fy, fz] = factor
  const offset = applyPoint(m, [(fx - 1) / 2, (fy - 1) / 2, (fz - 1) / 2])
  return [
    m[0]! * fx, m[1]! * fy, m[2]! * fz, offset[0],
    m[4]! * fx, m[5]! * fy, m[6]! * fz, offset[1],
    m[8]! * fx, m[9]! * fy, m[10]! * fz, offset[2],
    0, 0, 0, 1,
  ]
}

/** Mean of `factor`-sized blocks; the transform is adjusted so world positions do not move. */
export function downsample(volume: Volume, factor: [number, number, number]): Volume {
  const [fx, fy, fz] = factor
  if (fx === 1 && fy === 1 && fz === 1) return volume
  const [nx, ny, nz] = volume.dims
  const mx = Math.floor(nx / fx)
  const my = Math.floor(ny / fy)
  const mz = Math.floor(nz / fz)
  const out = new Int16Array(mx * my * mz)
  const blocks = fx * fy * fz
  for (let z = 0; z < mz; z += 1) {
    for (let y = 0; y < my; y += 1) {
      for (let x = 0; x < mx; x += 1) {
        let sum = 0
        for (let dz = 0; dz < fz; dz += 1) {
          for (let dy = 0; dy < fy; dy += 1) {
            const row = nx * (y * fy + dy + ny * (z * fz + dz)) + x * fx
            for (let dx = 0; dx < fx; dx += 1) sum += volume.data[row + dx]!
          }
        }
        out[x + mx * (y + my * z)] = Math.round(sum / blocks)
      }
    }
  }
  const indexToWorld = blockTransform(volume.indexToWorld, factor)
  return { data: out, dims: [mx, my, mz], indexToWorld }
}

/** Edge lengths of one voxel in millimetres. */
export function voxelSize(volume: Volume): [number, number, number] {
  const m = volume.indexToWorld
  return [Math.hypot(m[0]!, m[4]!, m[8]!), Math.hypot(m[1]!, m[5]!, m[9]!), Math.hypot(m[2]!, m[6]!, m[10]!)]
}
