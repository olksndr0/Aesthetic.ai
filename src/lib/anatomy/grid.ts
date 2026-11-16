/** Uniform grid over a point set, for nearest-point and radius queries. */
export class PointGrid {
  readonly positions: Float32Array
  private readonly cell: number
  private readonly min: [number, number, number]
  private readonly dims: [number, number, number]
  private readonly starts: Uint32Array
  private readonly items: Uint32Array

  constructor(positions: Float32Array, cell: number) {
    this.positions = positions
    const count = positions.length / 3
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < positions.length; i += 3) {
      for (let a = 0; a < 3; a += 1) {
        const value = positions[i + a]!
        if (value < min[a]!) min[a] = value
        if (value > max[a]!) max[a] = value
      }
    }
    if (count === 0) {
      min.fill(0)
      max.fill(0)
    }

    // Keep the cell table bounded whatever the extent of the points.
    let size = Math.max(cell, 1e-6)
    const cells = (s: number) => [0, 1, 2].map(a => Math.floor((max[a]! - min[a]!) / s) + 1) as [number, number, number]
    let dims = cells(size)
    while (dims[0] * dims[1] * dims[2] > 4_000_000) {
      size *= 1.5
      dims = cells(size)
    }
    this.cell = size
    this.min = min
    this.dims = dims

    const total = dims[0] * dims[1] * dims[2]
    const starts = new Uint32Array(total + 1)
    const keys = new Uint32Array(count)
    for (let i = 0; i < count; i += 1) {
      const key = this.key(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!)
      keys[i] = key
      starts[key + 1] = starts[key + 1]! + 1
    }
    for (let i = 0; i < total; i += 1) starts[i + 1] = starts[i + 1]! + starts[i]!
    const cursor = starts.slice(0, total)
    const items = new Uint32Array(count)
    for (let i = 0; i < count; i += 1) {
      const key = keys[i]!
      items[cursor[key]!] = i
      cursor[key] = cursor[key]! + 1
    }
    this.starts = starts
    this.items = items
  }

  private coordinate(value: number, axis: 0 | 1 | 2): number {
    const index = Math.floor((value - this.min[axis]) / this.cell)
    return index < 0 ? 0 : index >= this.dims[axis] ? this.dims[axis] - 1 : index
  }

  private key(x: number, y: number, z: number): number {
    return this.coordinate(x, 0) + this.dims[0] * (this.coordinate(y, 1) + this.dims[1] * this.coordinate(z, 2))
  }

  /** Index of the closest point and its distance, or -1 when none lies within `maxDistance`. */
  nearest(x: number, y: number, z: number, maxDistance = Infinity): { index: number; distance: number } {
    const { positions, dims, starts, items, cell } = this
    const cx = this.coordinate(x, 0)
    const cy = this.coordinate(y, 1)
    const cz = this.coordinate(z, 2)
    let best = -1
    let bestSq = maxDistance * maxDistance
    const maxRing = Math.max(dims[0], dims[1], dims[2])

    for (let ring = 0; ring <= maxRing; ring += 1) {
      // Everything outside the cube already searched is at least (ring - 1) cells away.
      if (ring > 0 && (ring - 1) * cell > Math.sqrt(bestSq)) break
      const z0 = Math.max(0, cz - ring)
      const z1 = Math.min(dims[2] - 1, cz + ring)
      const y0 = Math.max(0, cy - ring)
      const y1 = Math.min(dims[1] - 1, cy + ring)
      const x0 = Math.max(0, cx - ring)
      const x1 = Math.min(dims[0] - 1, cx + ring)
      for (let gz = z0; gz <= z1; gz += 1) {
        const zEdge = Math.abs(gz - cz) === ring
        for (let gy = y0; gy <= y1; gy += 1) {
          const yEdge = zEdge || Math.abs(gy - cy) === ring
          // Only the shell of the cube is new at this ring.
          const step = yEdge ? 1 : Math.max(1, x1 - x0)
          for (let gx = x0; gx <= x1; gx += step) {
            if (!yEdge && Math.abs(gx - cx) !== ring) continue
            const key = gx + dims[0] * (gy + dims[1] * gz)
            for (let n = starts[key]!; n < starts[key + 1]!; n += 1) {
              const i = items[n]!
              const dx = positions[i * 3]! - x
              const dy = positions[i * 3 + 1]! - y
              const dz = positions[i * 3 + 2]! - z
              const sq = dx * dx + dy * dy + dz * dz
              if (sq < bestSq) {
                bestSq = sq
                best = i
              }
            }
          }
        }
      }
    }
    return { index: best, distance: best === -1 ? Infinity : Math.sqrt(bestSq) }
  }

  /** Calls `visit` with every point within `radius` and its squared distance. */
  within(x: number, y: number, z: number, radius: number, visit: (index: number, distanceSq: number) => void): void {
    const { positions, dims, starts, items } = this
    const x0 = this.coordinate(x - radius, 0)
    const x1 = this.coordinate(x + radius, 0)
    const y0 = this.coordinate(y - radius, 1)
    const y1 = this.coordinate(y + radius, 1)
    const z0 = this.coordinate(z - radius, 2)
    const z1 = this.coordinate(z + radius, 2)
    const limit = radius * radius
    for (let gz = z0; gz <= z1; gz += 1) {
      for (let gy = y0; gy <= y1; gy += 1) {
        for (let gx = x0; gx <= x1; gx += 1) {
          const key = gx + dims[0] * (gy + dims[1] * gz)
          for (let n = starts[key]!; n < starts[key + 1]!; n += 1) {
            const i = items[n]!
            const dx = positions[i * 3]! - x
            const dy = positions[i * 3 + 1]! - y
            const dz = positions[i * 3 + 2]! - z
            const sq = dx * dx + dy * dy + dz * dz
            if (sq <= limit) visit(i, sq)
          }
        }
      }
    }
  }
}
