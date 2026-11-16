// A stylised head built from a deformed sphere: no model file to download.
// Two shapes share one point set: the head as it is, and the same head with a
// refined nose, cheeks, lips, jaw and chin. The scene blends between them.

export type HeadData = { before: Float32Array; after: Float32Array; normals: Float32Array; seeds: Float32Array }

type Vec3 = [number, number, number]

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function gauss(dx: number, dy: number, sx: number, sy: number): number {
  return Math.exp(-((dx * dx) / sx + (dy * dy) / sy))
}

function shape(dir: Vec3, refined: boolean): Vec3 {
  const [dx, dy, dz] = dir
  let x = dx * 0.74
  const y = dy
  let z = dz * (dz < 0 ? 0.94 : 0.88)

  // The skull narrows into the jaw.
  const jaw = smoothstep(0.1, -0.95, dy)
  x *= 1 - (refined ? 0.41 : 0.35) * jaw
  if (dz < 0) z *= 1 - 0.2 * jaw

  // Features only on the front of the head.
  const front = smoothstep(0.15, 0.75, dz)
  const ax = Math.abs(x)

  z += front * 0.07 * Math.exp(-((y - 0.28) ** 2) / 0.006) // brow
  z -= front * 0.12 * gauss(ax - 0.27, y - 0.14, 0.014, 0.006) // eye sockets
  z += front * (refined ? 0.24 : 0.28) * gauss(x, y + (refined ? 0.085 : 0.1), refined ? 0.008 : 0.011, 0.03) // nose tip
  z += front * (refined ? 0.09 : 0.12) * gauss(x, y - 0.08, 0.006, 0.04) // nose bridge
  z += front * (refined ? 0.058 : 0.04) * gauss(ax - 0.36, y + 0.02, 0.03, 0.02) // cheekbones
  z += front * (refined ? 0.085 : 0.065) * gauss(x, y + 0.4, 0.03, 0.0035) // lips
  z -= front * 0.035 * gauss(x, y + 0.52, 0.03, 0.003) // crease under the lip
  z += front * (refined ? 0.1 : 0.07) * gauss(x, y + 0.74, 0.04, 0.02) // chin

  return [x, y, z]
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

// The true normal of the deformed surface, from two nearby samples. It is what
// lets light pick out the nose, brow, lips and chin.
function surfaceNormal(dir: Vec3): Vec3 {
  const step = 0.012
  const up: Vec3 = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]
  const tangent = normalize(cross(up, dir))
  const bitangent = cross(dir, tangent)
  const centre = shape(dir, false)
  const a = shape(normalize([dir[0] + tangent[0] * step, dir[1] + tangent[1] * step, dir[2] + tangent[2] * step]), false)
  const b = shape(normalize([dir[0] + bitangent[0] * step, dir[1] + bitangent[1] * step, dir[2] + bitangent[2] * step]), false)
  const normal = normalize(cross([a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]], [b[0] - centre[0], b[1] - centre[1], b[2] - centre[2]]))
  // Keep it pointing outwards.
  return normal[0] * dir[0] + normal[1] * dir[1] + normal[2] * dir[2] < 0 ? [-normal[0], -normal[1], -normal[2]] : normal
}

export function buildHead(count: number): HeadData {
  const neckCount = Math.floor(count * 0.1)
  const headCount = count - neckCount
  const before = new Float32Array(count * 3)
  const after = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < headCount; i += 1) {
    const dy = 1 - (i / (headCount - 1)) * 2
    const ring = Math.sqrt(Math.max(0, 1 - dy * dy))
    const angle = i * golden
    const dir: Vec3 = [Math.cos(angle) * ring, dy, Math.sin(angle) * ring]
    before.set(shape(dir, false), i * 3)
    after.set(shape(dir, true), i * 3)
    normals.set(surfaceNormal(dir), i * 3)
    seeds[i] = (i * 0.61803398875) % 1
  }

  for (let j = 0; j < neckCount; j += 1) {
    const i = headCount + j
    const angle = j * golden
    const y = -0.86 - (j / neckCount) * 0.62
    const radius = 0.34 + 0.05 * smoothstep(-1.2, -1.48, y)
    const point: Vec3 = [Math.cos(angle) * radius, y, Math.sin(angle) * radius - 0.1]
    before.set(point, i * 3)
    after.set(point, i * 3)
    normals.set([Math.cos(angle), 0, Math.sin(angle)], i * 3)
    seeds[i] = (i * 0.61803398875) % 1
  }

  return { before, after, normals, seeds }
}

export type HeadGrid = {
  positions: Float32Array
  after: Float32Array
  normals: Float32Array
  /** Triangles of the closed surface: used as an invisible depth shell so the head reads as a solid. */
  triangles: Uint16Array
  /** Segments along the latitude rings and meridians: the contour lines drawn over the surface. */
  lines: Uint16Array
}

/** The same head as a latitude/longitude grid. The seam sits at the back of the skull. */
export function buildHeadGrid(rows = 72, cols = 96, ringStep = 3, meridianStep = 4): HeadGrid {
  const stride = cols + 1
  const total = (rows + 1) * stride
  const positions = new Float32Array(total * 3)
  const after = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)

  for (let r = 0; r <= rows; r += 1) {
    const theta = (r / rows) * Math.PI
    for (let c = 0; c <= cols; c += 1) {
      const phi = (c / cols) * Math.PI * 2
      const dir: Vec3 = [Math.sin(theta) * Math.sin(phi), Math.cos(theta), -Math.sin(theta) * Math.cos(phi)]
      const i = (r * stride + c) * 3
      positions.set(shape(dir, false), i)
      after.set(shape(dir, true), i)
      normals.set(surfaceNormal(dir), i)
    }
  }

  const triangles: number[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * stride + c
      const b = a + stride
      triangles.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }

  const lines: number[] = []
  for (let r = ringStep; r < rows; r += ringStep) {
    for (let c = 0; c < cols; c += 1) lines.push(r * stride + c, r * stride + c + 1)
  }
  for (let c = 0; c < cols; c += meridianStep) {
    for (let r = 0; r < rows; r += 1) lines.push(r * stride + c, (r + 1) * stride + c)
  }

  return { positions, after, normals, triangles: new Uint16Array(triangles), lines: new Uint16Array(lines) }
}

/** Centres of the areas the scene can light up, in the head's own space. */
export const ZONES = {
  nose: [0, -0.08, 1.0],
  lips: [0, -0.4, 0.86],
  jaw: [0, -0.72, 0.78],
  eyes: [0, 0.15, 0.8],
} as const satisfies Record<string, Vec3>

export type ZoneName = keyof typeof ZONES
