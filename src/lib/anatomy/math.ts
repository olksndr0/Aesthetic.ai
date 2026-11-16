// Geometry shared by the browser (viewer, simulation) and the server (validation).
//
// Canonical anatomical frame, used for every stored coordinate:
//   millimetres, right-handed
//   +X = patient LEFT, +Y = SUPERIOR, +Z = ANTERIOR
// A camera in front of the face (on +Z) therefore sees the patient's right on
// the left of the image, as in a clinical photograph.

export type Vec3 = [number, number, number]
/** 4x4 affine matrix, row-major. */
export type Mat4 = number[]

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export const UNIT_TO_MM = { mm: 1, cm: 10, m: 1000, in: 25.4 } as const
export type Unit = keyof typeof UNIT_TO_MM
export const UNITS = Object.keys(UNIT_TO_MM) as Unit[]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b))

export function normalize(a: Vec3): Vec3 {
  const l = length(a)
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0]
}

/** Angle at `vertex` between the rays to `a` and `b`, in degrees. */
export function angleDeg(a: Vec3, vertex: Vec3, b: Vec3): number {
  const u = normalize(sub(a, vertex))
  const v = normalize(sub(b, vertex))
  return (Math.acos(Math.min(1, Math.max(-1, dot(u, v)))) * 180) / Math.PI
}

export function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n))
}

export function isMat4(value: unknown): value is Mat4 {
  return Array.isArray(value) && value.length === 16 && value.every(n => typeof n === 'number' && Number.isFinite(n))
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0)
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[r * 4 + k]! * b[k * 4 + c]!
      out[r * 4 + c] = sum
    }
  }
  return out
}

export function applyPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2] + m[3]!,
    m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2] + m[7]!,
    m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2] + m[11]!,
  ]
}

export function applyVector(m: Mat4, v: Vec3): Vec3 {
  return [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[4]! * v[0] + m[5]! * v[1] + m[6]! * v[2], m[8]! * v[0] + m[9]! * v[1] + m[10]! * v[2]]
}

/** Determinant of the linear part. Negative means the transform mirrors, i.e. swaps left and right. */
export function det3(m: Mat4): number {
  return (
    m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[1]! * (m[4]! * m[10]! - m[6]! * m[8]!) + m[2]! * (m[4]! * m[9]! - m[5]! * m[8]!)
  )
}

/** Uniform scale factor of a similarity transform (cube root of |det|). */
export function scaleOf(m: Mat4): number {
  return Math.cbrt(Math.abs(det3(m)))
}

export function invert(m: Mat4): Mat4 {
  const d = det3(m)
  if (Math.abs(d) < 1e-12) throw new Error('Singular transform')
  const [a, b, c, , e, f, g, , h, i, j] = m as [number, number, number, number, number, number, number, number, number, number, number]
  const inv = [
    (f * j - g * i) / d,
    (c * i - b * j) / d,
    (b * g - c * f) / d,
    (g * h - e * j) / d,
    (a * j - c * h) / d,
    (c * e - a * g) / d,
    (e * i - f * h) / d,
    (b * h - a * i) / d,
    (a * f - b * e) / d,
  ]
  const t: Vec3 = [m[3]!, m[7]!, m[11]!]
  const tx = -(inv[0]! * t[0] + inv[1]! * t[1] + inv[2]! * t[2])
  const ty = -(inv[3]! * t[0] + inv[4]! * t[1] + inv[5]! * t[2])
  const tz = -(inv[6]! * t[0] + inv[7]! * t[1] + inv[8]! * t[2])
  return [inv[0]!, inv[1]!, inv[2]!, tx, inv[3]!, inv[4]!, inv[5]!, ty, inv[6]!, inv[7]!, inv[8]!, tz, 0, 0, 0, 1]
}

export const translation = (t: Vec3): Mat4 => [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2], 0, 0, 0, 1]
export const scaling = (s: number): Mat4 => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]

/** Rotation by degrees about X, then Y, then Z (fixed anatomical axes). */
export function rotationXYZ(deg: Vec3): Mat4 {
  const [rx, ry, rz] = deg.map(d => (d * Math.PI) / 180) as Vec3
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)]
  const x: Mat4 = [1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0, 0, 0, 0, 1]
  const y: Mat4 = [cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0, 0, 0, 0, 1]
  const z: Mat4 = [cz, -sz, 0, 0, sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  return multiply(z, multiply(y, x))
}

/** The same linear transform, applied about `centre` instead of the origin. */
export function aroundPoint(m: Mat4, centre: Vec3): Mat4 {
  return multiply(translation(centre), multiply(m, translation(scale(centre, -1))))
}

/** Rigid motion: rotate about `centre`, then translate. */
export function rigid(translationMm: Vec3, rotationDeg: Vec3, centre: Vec3): Mat4 {
  return multiply(translation(translationMm), aroundPoint(rotationXYZ(rotationDeg), centre))
}

export const AXES = ['+x', '-x', '+y', '-y', '+z', '-z'] as const
export type Axis = (typeof AXES)[number]

export function axisVector(axis: Axis): Vec3 {
  const sign = axis[0] === '-' ? -1 : 1
  return axis[1] === 'x' ? [sign, 0, 0] : axis[1] === 'y' ? [0, sign, 0] : [0, 0, sign]
}

export type Orientation = {
  /** Axis of the file that points to the front of the face. */
  anterior: Axis
  /** Axis of the file that points to the top of the head. */
  superior: Axis
  /** True when the file is a mirror image (left-handed export): left and right are swapped back. */
  mirrored: boolean
}

/**
 * Matrix from a file's own axes and unit to the canonical frame. The left
 * axis follows from the other two; it is negated only when `mirrored` is set,
 * and that is the single case in which the matrix has a negative determinant.
 */
export function orientationMatrix(orientation: Orientation, unit: Unit): Mat4 {
  const a = axisVector(orientation.anterior)
  const s = axisVector(orientation.superior)
  if (Math.abs(dot(a, s)) > 0.5) throw new Error('Anterior and superior must be different axes.')
  const l = scale(cross(s, a), orientation.mirrored ? -1 : 1)
  const k = UNIT_TO_MM[unit]
  return [l[0] * k, l[1] * k, l[2] * k, 0, s[0] * k, s[1] * k, s[2] * k, 0, a[0] * k, a[1] * k, a[2] * k, 0, 0, 0, 0, 1]
}

/** DICOM patient coordinates (LPS: +x left, +y posterior, +z superior, mm) to the canonical frame. */
export const LPS_TO_CANONICAL: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]

export function round(value: number, digits = 2): number {
  const k = 10 ** digits
  return Math.round(value * k) / k
}
