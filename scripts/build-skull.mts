// Builds the generic skull mannequin used by the site's 3D scenes and by the
// development example case. It is a mathematical model (a signed distance
// field assembled from anatomical parts), not a scan of anyone:
//   npx tsx scripts/build-skull.mts
// writes assets/models/skull-mannequin.amsh (planning), public/models/skull.bin
// (site scenes, with baked ambient occlusion) and src/lib/anatomy/mannequin.json
// (landmarks, on the surface). Frame: mm, +X patient left, +Y up, +Z anterior;
// Frankfort plane (porion, orbitale) at y = 0.
import { mkdirSync, writeFileSync } from 'node:fs'

import { extractSurface } from '../src/lib/anatomy/isosurface.ts'
import { computeNormals, encodeMesh, keepLargeComponents, type Mesh } from '../src/lib/anatomy/mesh.ts'

// ── Distance primitives (negative inside) ────────────────────────────────
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const carve = (d: number, hole: number, k: number) => -smin(-d, hole, k)

function ell(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const px = x - cx
  const py = y - cy
  const pz = z - cz
  const k0 = Math.hypot(px / rx, py / ry, pz / rz)
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz))
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1
}

const sph = (x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number) => Math.hypot(x - cx, y - cy, z - cz) - r

function cap(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): number {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz)))
  return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t) - r
}

/** A tube along a polyline whose section is `r` wide and `h` tall (per point). */
function sweep(x: number, y: number, z: number, line: number[][], r: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i]!
    const b = line[i + 1]!
    const s = r / ((a[3]! + b[3]!) / 2) // squeeze Y so a round tube becomes a tall one
    const d = cap(x, y * s, z, a[0]!, a[1]! * s, a[2]!, b[0]!, b[1]! * s, b[2]!, r)
    if (d < best) best = d
  }
  return best
}

function roundBox(px: number, py: number, pz: number, hx: number, hy: number, hz: number, round: number): number {
  const qx = Math.abs(px) - hx + round
  const qy = Math.abs(py) - hy + round
  const qz = Math.abs(pz) - hz + round
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round
}

// ── Dental arches ────────────────────────────────────────────────────────
// Half arches in the XZ plane, from the midline backwards (x, z).
const UPPER_ARCH = [[0, 88], [9, 86.6], [17, 81.5], [22.5, 72.5], [26, 61], [28, 49], [29, 38]]
const LOWER_ARCH = [[0, 85.2], [8, 84], [15.5, 79], [20.8, 70.5], [24.3, 59.5], [26.4, 48.5], [27.4, 38]]
// Mesio-distal width, thickness across the arch, crown length: central and lateral incisor, canine, two premolars, two molars.
const TEETH = [
  [8.6, 3.3, 10.5], [6.6, 3.1, 9.3], [7.6, 4.0, 10.8], [7.0, 4.4, 8.2], [6.8, 4.5, 7.8], [10.2, 5.2, 7.2], [9.6, 5.1, 6.8],
]

type Tooth = { x: number; z: number; tx: number; tz: number; hw: number; ht: number; len: number }

function layTeeth(arch: number[][], scale: number): Tooth[] {
  const teeth: Tooth[] = []
  let along = 0
  for (const [width, thickness, length] of TEETH as number[][]) {
    const centre = along + (width! * scale) / 2
    along += width! * scale
    // Walk the polyline to the tooth centre.
    let walked = 0
    for (let i = 0; i + 1 < arch.length; i += 1) {
      const [ax, az] = arch[i] as [number, number]
      const [bx, bz] = arch[i + 1] as [number, number]
      const segment = Math.hypot(bx - ax, bz - az)
      if (walked + segment >= centre || i + 2 === arch.length) {
        const t = Math.min(1, (centre - walked) / segment)
        teeth.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / segment, tz: (bz - az) / segment, hw: (width! * scale) / 2 - 0.42, ht: thickness!, len: length! })
        break
      }
      walked += segment
    }
  }
  return teeth
}

const UPPER_TEETH = layTeeth(UPPER_ARCH, 1)
const LOWER_TEETH = layTeeth(LOWER_ARCH, 0.93)

/** Crowns of one arch. `gum` is where they leave the bone, `sign` is +1 for crowns pointing down. */
function teeth(ax: number, y: number, z: number, row: Tooth[], gum: number, sign: number): number {
  let best = Infinity
  for (const tooth of row) {
    const dx = ax - tooth.x
    const dz = z - tooth.z
    const along = dx * tooth.tx + dz * tooth.tz
    const across = -dx * tooth.tz + dz * tooth.tx
    const half = tooth.len / 2 + 1.5
    const d = roundBox(along, y - (gum - sign * (half - 1.5)), across, tooth.hw, half, tooth.ht, 1.7)
    if (d < best) best = d
  }
  return best
}

const archLine = (arch: number[][], y: number, height: number) => arch.map(([x, z]) => [x!, y, z!, height])

const ZYGOMATIC_ARCH = [[53, -8.5, 53, 6.5], [59, -7, 36, 5.2], [63, -5.5, 20, 5], [62.5, -3.5, 7, 6]]
const UPPER_ALVEOLAR = archLine(UPPER_ARCH, -41, 8.5)
// Mandibular body: narrow at the chin, flaring to the angles; lower border rising backwards.
const MANDIBLE_BODY = [
  [0, -80.5, 80.5, 14.5], [10, -80.5, 78.5, 14.5], [19, -79.5, 70.5, 14], [25.5, -77.5, 58, 13], [30.5, -75.5, 44, 12.5], [35.5, -73, 30, 12], [41, -70.5, 15, 12], [46, -68, 3, 12.5],
]

// ── The skull ────────────────────────────────────────────────────────────
export function skull(x: number, y: number, z: number): number {
  const ax = Math.abs(x)

  // Braincase: vault, frontal bone, wide flat base.
  let d = ell(x, y, z, 0, 50, -22, 71, 68, 80)
  d = smin(d, ell(x, y, z, 0, 43, 25, 56, 59, 62), 20)
  d = smin(d, ell(x, y, z, 0, 8, -14, 61, 36, 72), 18)
  d = smin(d, ell(x, y, z, 0, 2, -72, 30, 16, 20), 14) // occipital protuberance region

  // Brow ridges and glabella.
  d = smin(d, cap(ax, y, z, 9, 30.5, 85.5, 45, 27, 71, 6.4), 7)
  d = smin(d, sph(x, y, z, 0, 31, 85.5, 8.5), 6)

  // Midface.
  let face = ell(x, y, z, 0, -17, 58, 36, 29, 30)
  face = smin(face, ell(ax, y, z, 46.5, -7.5, 58, 15, 13, 12), 8) // zygomatic body
  face = smin(face, cap(ax, y, z, 51.5, 23, 66, 51.5, -3, 62.5, 5.4), 5) // lateral orbital rim
  face = smin(face, cap(ax, y, z, 50, -9.5, 62.5, 17, -9.5, 77, 4.8), 5) // infraorbital rim
  face = smin(face, cap(ax, y, z, 8.5, 22, 80.5, 14.5, -11, 80.5, 6), 5) // frontal process of the maxilla
  face = smin(face, cap(x, y, z, 0, 25, 86.5, 0, 5.5, 96.5, 5), 5) // nasal bones
  face = smin(face, sweep(ax, y, z, ZYGOMATIC_ARCH, 3.3), 5) // zygomatic arch: a flat bar, taller than thick
  face = smin(face, ell(x, y, z, 0, 15, 75, 14, 17, 13), 6) // nasal root between the orbits
  face = smin(face, ell(x, y, z, 0, -19, 30, 27, 24, 27), 10) // sphenoid and pterygoid mass
  face = smin(face, sweep(ax, y, z, UPPER_ALVEOLAR, 6.4), 6) // alveolar process
  face = smin(face, ell(x, y, z, 0, -37.5, 58, 25, 4.2, 30), 4) // hard palate
  d = smin(d, face, 9)

  // Temporal bone: articular eminence and mastoid process.
  d = smin(d, ell(ax, y, z, 58, 3, 2, 8.5, 6.5, 10), 9)
  d = smin(d, cap(ax, y, z, 55.5, -5, -17, 51, -30.5, -12.5, 8.6), 8)

  // Orbits: a wide entrance narrowing backwards and medially.
  d = carve(d, ell(ax, y, z, 35.5, 9, 80, 19, 17.5, 26), 3)
  d = carve(d, ell(ax, y, z, 29, 8, 50, 13.5, 12.5, 34), 4)

  // Piriform aperture (pear shaped) with the septum inside and the anterior nasal spine below.
  const aperture = smin(ell(x, y, z, 0, -13.5, 84, 11.6, 10.2, 24), cap(x, y, z, 0, -10, 86, 0, 5.5, 88.5, 5), 4)
  d = carve(d, aperture, 2.6)
  d = Math.min(d, roundBox(x, y + 11, z - 66, 1.2, 11, 9, 0.6)) // set back, so it reads as a shadowed partition
  d = smin(d, cap(x, y, z, 0, -25, 82, 0, -26.2, 90.5, 1.7), 5)

  // Canine fossa, temporal fossa, and the small openings that make bone read as bone.
  d = carve(d, sph(ax, y, z, 24.5, -24, 91.5, 9.2), 6)
  d = carve(d, ell(ax, y, z, 70, 22, 38, 14, 24, 26), 14)
  d = carve(d, sph(ax, y, z, 27.5, -13.5, 81.6, 2.3), 1.2) // infraorbital foramen
  d = carve(d, cap(ax, y, z, 55, 0, -1, 75, 0, -1, 4.2), 2) // external acoustic meatus
  d = carve(d, cap(x, y, z, 0, -60, -28, 0, -24, -28, 15.5), 4) // foramen magnum
  d = smin(d, sph(ax, y, z, 18.5, -31.5, -17, 7), 4) // occipital condyles

  if (y < -40 && y > -64 && z > 30 && ax < 37) d = smin(d, teeth(ax, y, z, UPPER_TEETH, -47.5, 1), 1.2)

  // Mandible: a separate bone.
  let jaw = sweep(ax, y, z, MANDIBLE_BODY, 6.4)
  jaw = smin(jaw, ell(x, y, z, 0, -88.5, 83, 14.5, 9, 7), 7) // mental protuberance
  jaw = smin(jaw, sph(ax, y, z, 11, -91, 79.5, 4.6), 4) // mental tubercles
  // Ramus: a plate, so the Z axis is squeezed.
  const squeeze = 4.3 / 15.5
  const ramus = Math.min(cap(ax, y, z * squeeze, 46, -66, 3.5 * squeeze, 48, -40, 5.5 * squeeze, 4.3), cap(ax, y, z * squeeze, 48, -40, 5.5 * squeeze, 49.5, -17, 5 * squeeze, 4.3))
  jaw = smin(jaw, ramus, 7)
  jaw = smin(jaw, ell(ax, y, z, 46, -69, -5, 5, 9, 8), 6) // angle
  jaw = carve(jaw, sph(ax, y, z, 49, -9.5, 13.5, 9), 2.2) // sigmoid notch
  jaw = smin(jaw, ell(ax, y, z, 50, -10.5, 1.5, 9.6, 6, 5.4), 3) // condyle
  jaw = smin(jaw, cap(ax, y, z, 47.5, -27, 20, 48, -11, 27.5, 3.5), 4) // coronoid process
  jaw = carve(jaw, sph(ax, y, z, 25.5, -80, 69.5, 2.2), 1.2) // mental foramen
  if (y < -52 && y > -70 && z > 30 && ax < 36) jaw = smin(jaw, teeth(ax, y, z, LOWER_TEETH, -65.5, -1), 1.2)

  return Math.min(d, jaw)
}

// ── Meshing ──────────────────────────────────────────────────────────────
const BOX = { min: [-84, -106, -110], max: [84, 124, 104] } as const

function build(voxel: number): Mesh {
  const dims = BOX.min.map((low, axis) => Math.ceil((BOX.max[axis]! - low) / voxel) + 1) as [number, number, number]
  const data = new Int16Array(dims[0] * dims[1] * dims[2])
  for (let k = 0; k < dims[2]; k += 1) {
    const z = BOX.min[2] + k * voxel
    for (let j = 0; j < dims[1]; j += 1) {
      const y = BOX.min[1] + j * voxel
      for (let i = 0; i < dims[0]; i += 1) {
        const d = skull(BOX.min[0] + i * voxel, y, z)
        data[i + dims[0] * (j + dims[1] * k)] = Math.round(Math.max(-30, Math.min(30, -d)) * 1000)
      }
    }
  }
  const mesh = extractSurface({ data, dims, indexToWorld: [voxel, 0, 0, BOX.min[0], 0, voxel, 0, BOX.min[1], 0, 0, voxel, BOX.min[2], 0, 0, 0, 1] }, 0)
  // Skull and mandible; anything smaller is a meshing speck.
  return keepLargeComponents(mesh, 0.02)
}

// Directions spread over a hemisphere (around +Z), with cosine weights.
const HEMISPHERE: number[][] = []
for (let ring = 0; ring < 4; ring += 1) {
  const polar = ((ring + 0.5) / 4) * (Math.PI / 2)
  const count = ring === 0 ? 4 : 8
  for (let i = 0; i < count; i += 1) {
    const azimuth = ((i + (ring % 2) / 2) / count) * 2 * Math.PI
    HEMISPHERE.push([Math.sin(polar) * Math.cos(azimuth), Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.cos(polar)])
  }
}

/**
 * Ambient occlusion from the field itself: from each vertex, rays over the
 * hemisphere around its normal are marched up to 55 mm; the share that hits
 * bone, weighted by distance, darkens the vertex.
 */
function occlusion(mesh: Mesh): Uint8Array {
  const normals = computeNormals(mesh)
  const out = new Uint8Array(mesh.positions.length / 3)
  for (let v = 0; v < out.length; v += 1) {
    const [x, y, z] = [mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!]
    const [nx, ny, nz] = [normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!]
    // A basis around the normal.
    const ux0 = Math.abs(nx) < 0.8 ? 1 : 0
    const uy0 = 1 - ux0
    let tx = uy0 * nz
    let ty = -ux0 * nz
    let tz = ux0 * ny - uy0 * nx
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl
    ty /= tl
    tz /= tl
    const bx = ny * tz - nz * ty
    const by = nz * tx - nx * tz
    const bz = nx * ty - ny * tx

    let blocked = 0
    let total = 0
    for (const [a, b, c, weight] of HEMISPHERE as number[][]) {
      const dx = tx * a! + bx * b! + nx * c!
      const dy = ty * a! + by * b! + ny * c!
      const dz = tz * a! + bz * b! + nz * c!
      total += weight!
      let t = 2.2
      while (t < 55) {
        const d = skull(x + dx * t, y + dy * t, z + dz * t)
        if (d < 0.25) {
          blocked += weight! * (1 - t / 70)
          break
        }
        t += Math.max(1.5, d * 0.9)
      }
    }
    out[v] = Math.round(255 * Math.max(0.06, 1 - 0.95 * (blocked / total)))
  }
  return out
}

/** Moves a point onto the surface along the field's gradient. */
function snap(point: number[]): number[] {
  let [x, y, z] = point as [number, number, number]
  for (let i = 0; i < 30; i += 1) {
    const d = skull(x, y, z)
    const e = 0.2
    const gx = skull(x + e, y, z) - skull(x - e, y, z)
    const gy = skull(x, y + e, z) - skull(x, y - e, z)
    const gz = skull(x, y, z + e) - skull(x, y, z - e)
    const g = Math.hypot(gx, gy, gz) || 1
    x -= (gx / g) * d * 0.8
    y -= (gy / g) * d * 0.8
    z -= (gz / g) * d * 0.8
  }
  return [x, y, z].map(value => Math.round(value * 10) / 10)
}

const LANDMARKS: Record<string, number[]> = {
  N: [0, 24, 88], ANS: [0, -25.8, 95], A: [0, -32, 88], B: [0, -74, 84], Pog: [0, -88, 91], Me: [0, -98, 82],
  'Or-R': [-33, -8, 78], 'Or-L': [33, -8, 78], 'Po-R': [-62, 4, -1], 'Po-L': [62, 4, -1], 'Zy-R': [-67, -5, 30], 'Zy-L': [67, -5, 30],
  'Go-R': [-48, -76, -8], 'Go-L': [48, -76, -8], 'Co-R': [-52, -5, 1], 'Co-L': [52, -5, 1],
}

const started = Date.now()
const fine = build(Number(process.argv[2] ?? 1.25))
const light = build(Number(process.argv[3] ?? 1.9))
const ao = occlusion(light)

mkdirSync('assets/models', { recursive: true })
mkdirSync('public/models', { recursive: true })
writeFileSync('assets/models/skull-mannequin.amsh', encodeMesh(fine))

// Site scenes: "SKL1", vertex count, triangle count, float32 positions, uint8 occlusion (padded to 4), uint16 or uint32 indices.
const vertices = light.positions.length / 3
const wide = vertices > 65535
const aoBytes = Math.ceil(vertices / 4) * 4
const indices = wide ? light.indices : new Uint16Array(light.indices)
const file = new Uint8Array(12 + light.positions.byteLength + aoBytes + indices.byteLength)
const view = new DataView(file.buffer)
view.setUint32(0, 0x314c4b53, true)
view.setUint32(4, vertices, true)
view.setUint32(8, light.indices.length / 3, true)
file.set(new Uint8Array(light.positions.buffer, light.positions.byteOffset, light.positions.byteLength), 12)
file.set(ao, 12 + light.positions.byteLength)
file.set(new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength), 12 + light.positions.byteLength + aoBytes)
writeFileSync('public/models/skull.bin', file)

writeFileSync('src/lib/anatomy/mannequin.json', `${JSON.stringify(Object.fromEntries(Object.entries(LANDMARKS).map(([code, point]) => [code, snap(point)])), null, 2)}\n`)
console.log(`skull built in ${Math.round((Date.now() - started) / 1000)} s: planning ${fine.positions.length / 3} vertices, site ${vertices} vertices (${Math.round(file.length / 1024)} KB)`)
