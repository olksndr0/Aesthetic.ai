import { det3, type Mat4, type Vec3 } from './math'

/** Indexed triangle mesh. Positions are x,y,z triples; indices are vertex triples. */
export type Mesh = { positions: Float32Array; indices: Uint32Array }

export type Bounds = { min: Vec3; max: Vec3; size: Vec3; centre: Vec3 }

export const MAX_VERTICES = 3_000_000
export const MAX_TRIANGLES = 6_000_000

const MAGIC = 0x48534d41 // "AMSH", little-endian
const HEADER_BYTES = 16

export class MeshError extends Error {}

/**
 * Storage format: "AMSH", version, vertex count, triangle count (uint32 LE),
 * then float32 positions and uint32 indices. Vertices are kept in the file's
 * own coordinates; the transform to the canonical frame is stored beside it.
 */
export function encodeMesh(mesh: Mesh): Uint8Array<ArrayBuffer> {
  const vertexCount = mesh.positions.length / 3
  const triangleCount = mesh.indices.length / 3
  const out = new Uint8Array(HEADER_BYTES + mesh.positions.byteLength + mesh.indices.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, MAGIC, true)
  view.setUint32(4, 1, true)
  view.setUint32(8, vertexCount, true)
  view.setUint32(12, triangleCount, true)
  out.set(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength), HEADER_BYTES)
  out.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength), HEADER_BYTES + mesh.positions.byteLength)
  return out
}

/** Parses and fully validates a stored mesh: counts, finite coordinates, index range. */
export function decodeMesh(bytes: Uint8Array): Mesh {
  if (bytes.byteLength < HEADER_BYTES) throw new MeshError('The mesh file is truncated.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 1) throw new MeshError('Not a mesh in the expected format.')
  const vertexCount = view.getUint32(8, true)
  const triangleCount = view.getUint32(12, true)
  if (vertexCount < 3 || triangleCount < 1) throw new MeshError('The mesh is empty.')
  if (vertexCount > MAX_VERTICES || triangleCount > MAX_TRIANGLES) throw new MeshError('The mesh is too large.')
  if (bytes.byteLength !== HEADER_BYTES + vertexCount * 12 + triangleCount * 12) throw new MeshError('The mesh file has the wrong length.')

  // Copy so the arrays are aligned and independent of the source buffer.
  const body = bytes.slice(HEADER_BYTES)
  const positions = new Float32Array(body.buffer, 0, vertexCount * 3)
  const indices = new Uint32Array(body.buffer, vertexCount * 12, triangleCount * 3)
  for (let i = 0; i < positions.length; i += 1) {
    if (!Number.isFinite(positions[i]!)) throw new MeshError('The mesh contains invalid coordinates.')
  }
  for (let i = 0; i < indices.length; i += 1) {
    if (indices[i]! >= vertexCount) throw new MeshError('The mesh refers to vertices that do not exist.')
  }
  return { positions, indices }
}

export function bounds(positions: Float32Array): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      const value = positions[i + a]!
      if (value < min[a]!) min[a] = value
      if (value > max[a]!) max[a] = value
    }
  }
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  return { min, max, size, centre: [min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2] }
}

export function transformPositions(positions: Float32Array, m: Mat4): Float32Array {
  const out = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!
    const y = positions[i + 1]!
    const z = positions[i + 2]!
    out[i] = m[0]! * x + m[1]! * y + m[2]! * z + m[3]!
    out[i + 1] = m[4]! * x + m[5]! * y + m[6]! * z + m[7]!
    out[i + 2] = m[8]! * x + m[9]! * y + m[10]! * z + m[11]!
  }
  return out
}

/** Applies a transform; a mirroring transform also reverses the winding so normals stay outward. */
export function transformMesh(mesh: Mesh, m: Mat4): Mesh {
  const positions = transformPositions(mesh.positions, m)
  if (det3(m) >= 0) return { positions, indices: mesh.indices }
  const indices = new Uint32Array(mesh.indices.length)
  for (let i = 0; i < indices.length; i += 3) {
    indices[i] = mesh.indices[i]!
    indices[i + 1] = mesh.indices[i + 2]!
    indices[i + 2] = mesh.indices[i + 1]!
  }
  return { positions, indices }
}

/** Area-weighted vertex normals. */
export function computeNormals(mesh: Mesh): Float32Array {
  const { positions, indices } = mesh
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3
    const b = indices[i + 1]! * 3
    const c = indices[i + 2]! * 3
    const ux = positions[b]! - positions[a]!
    const uy = positions[b + 1]! - positions[a + 1]!
    const uz = positions[b + 2]! - positions[a + 2]!
    const vx = positions[c]! - positions[a]!
    const vy = positions[c + 1]! - positions[a + 1]!
    const vz = positions[c + 2]! - positions[a + 2]!
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const v of [a, b, c]) {
      normals[v] = normals[v]! + nx
      normals[v + 1] = normals[v + 1]! + ny
      normals[v + 2] = normals[v + 2]! + nz
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1
    normals[i] = normals[i]! / l
    normals[i + 1] = normals[i + 1]! / l
    normals[i + 2] = normals[i + 2]! / l
  }
  return normals
}

/**
 * Merges all vertices that fall in the same cubic cell of side `cell` (the
 * unit of the mesh) and drops the triangles that collapse. With a tiny cell
 * this only welds duplicate vertices (STL has no shared vertices); with a
 * larger one it reduces a heavy mesh to that resolution.
 */
export function clusterVertices(mesh: Mesh, cell: number): Mesh {
  const { positions, indices } = mesh
  const box = bounds(positions)
  const span = Math.max(box.size[0], box.size[1], box.size[2], cell)
  const side = Math.max(cell, span / 100_000)
  const stride = Math.floor(span / side) + 2

  const remap = new Uint32Array(positions.length / 3)
  const cells = new Map<number, number>()
  const sums: number[] = []
  const counts: number[] = []
  for (let v = 0; v < remap.length; v += 1) {
    const x = Math.floor((positions[v * 3]! - box.min[0]) / side)
    const y = Math.floor((positions[v * 3 + 1]! - box.min[1]) / side)
    const z = Math.floor((positions[v * 3 + 2]! - box.min[2]) / side)
    const key = x + stride * (y + stride * z)
    let index = cells.get(key)
    if (index === undefined) {
      index = counts.length
      cells.set(key, index)
      counts.push(0)
      sums.push(0, 0, 0)
    }
    counts[index] = counts[index]! + 1
    sums[index * 3] = sums[index * 3]! + positions[v * 3]!
    sums[index * 3 + 1] = sums[index * 3 + 1]! + positions[v * 3 + 1]!
    sums[index * 3 + 2] = sums[index * 3 + 2]! + positions[v * 3 + 2]!
    remap[v] = index
  }

  const merged = new Float32Array(counts.length * 3)
  for (let i = 0; i < counts.length; i += 1) {
    merged[i * 3] = sums[i * 3]! / counts[i]!
    merged[i * 3 + 1] = sums[i * 3 + 1]! / counts[i]!
    merged[i * 3 + 2] = sums[i * 3 + 2]! / counts[i]!
  }

  const kept = new Uint32Array(indices.length)
  let n = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]!]!
    const b = remap[indices[i + 1]!]!
    const c = remap[indices[i + 2]!]!
    if (a === b || b === c || a === c) continue
    kept[n] = a
    kept[n + 1] = b
    kept[n + 2] = c
    n += 3
  }
  return { positions: merged, indices: kept.slice(0, n) }
}

/** Removes vertices no triangle uses. */
export function compact(mesh: Mesh): Mesh {
  const used = new Int32Array(mesh.positions.length / 3).fill(-1)
  let count = 0
  const indices = new Uint32Array(mesh.indices.length)
  for (let i = 0; i < mesh.indices.length; i += 1) {
    const v = mesh.indices[i]!
    if (used[v] === -1) {
      used[v] = count
      count += 1
    }
    indices[i] = used[v]!
  }
  const positions = new Float32Array(count * 3)
  for (let v = 0; v < used.length; v += 1) {
    const to = used[v]!
    if (to === -1) continue
    positions[to * 3] = mesh.positions[v * 3]!
    positions[to * 3 + 1] = mesh.positions[v * 3 + 1]!
    positions[to * 3 + 2] = mesh.positions[v * 3 + 2]!
  }
  return { positions, indices }
}

/**
 * Keeps the connected pieces that hold at least `minShare` of the vertices
 * (1 keeps only the largest). Removes the scanner table and loose fragments.
 */
export function keepLargeComponents(mesh: Mesh, minShare: number): Mesh {
  const vertexCount = mesh.positions.length / 3
  const parent = new Uint32Array(vertexCount)
  for (let i = 0; i < vertexCount; i += 1) parent[i] = i
  const find = (v: number): number => {
    let root = v
    while (parent[root] !== root) root = parent[root]!
    while (parent[v] !== root) {
      const next = parent[v]!
      parent[v] = root
      v = next
    }
    return root
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = find(mesh.indices[i]!)
    const b = find(mesh.indices[i + 1]!)
    const c = find(mesh.indices[i + 2]!)
    parent[b] = a
    parent[find(c)] = a
  }

  const sizes = new Map<number, number>()
  for (let v = 0; v < vertexCount; v += 1) {
    const root = find(v)
    sizes.set(root, (sizes.get(root) ?? 0) + 1)
  }
  const largest = Math.max(...sizes.values())
  const threshold = minShare >= 1 ? largest : Math.min(largest, minShare * vertexCount)

  const indices = new Uint32Array(mesh.indices.length)
  let n = 0
  for (let i = 0; i < mesh.indices.length; i += 3) {
    if ((sizes.get(find(mesh.indices[i]!)) ?? 0) < threshold) continue
    indices[n] = mesh.indices[i]!
    indices[n + 1] = mesh.indices[i + 1]!
    indices[n + 2] = mesh.indices[i + 2]!
    n += 3
  }
  return compact({ positions: mesh.positions, indices: indices.slice(0, n) })
}

/** Ellipsoid with the given full dimensions (width X, height Y, depth Z), centred on the origin. */
export function ellipsoidMesh(size: Vec3, segments = 24): Mesh {
  const rings = Math.max(6, Math.round(segments / 2))
  const positions: number[] = [0, size[1] / 2, 0]
  for (let r = 1; r < rings; r += 1) {
    const phi = (Math.PI * r) / rings
    for (let s = 0; s < segments; s += 1) {
      const theta = (2 * Math.PI * s) / segments
      positions.push((Math.sin(phi) * Math.cos(theta) * size[0]) / 2, (Math.cos(phi) * size[1]) / 2, (Math.sin(phi) * Math.sin(theta) * size[2]) / 2)
    }
  }
  positions.push(0, -size[1] / 2, 0)
  const bottom = positions.length / 3 - 1
  const at = (r: number, s: number) => 1 + (r - 1) * segments + (s % segments)

  const indices: number[] = []
  for (let s = 0; s < segments; s += 1) {
    indices.push(0, at(1, s + 1), at(1, s))
    indices.push(bottom, at(rings - 1, s), at(rings - 1, s + 1))
    for (let r = 1; r < rings - 1; r += 1) {
      indices.push(at(r, s), at(r, s + 1), at(r + 1, s + 1), at(r, s), at(r + 1, s + 1), at(r + 1, s))
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}
