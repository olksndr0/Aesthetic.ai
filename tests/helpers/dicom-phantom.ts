// Writes synthetic CT slices as DICOM Part 10 files (Explicit VR Little Endian),
// so the loader is tested on real file bytes with known geometry.

type Element = { tag: [number, number]; vr: string; value: Uint8Array }

function text(value: string, pad = ' '): Uint8Array {
  const padded = value.length % 2 === 0 ? value : value + pad
  return new TextEncoder().encode(padded)
}

function us(value: number): Uint8Array {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, value, true)
  return out
}

function encode(elements: Element[]): Uint8Array {
  const chunks: Uint8Array[] = []
  for (const { tag, vr, value } of elements) {
    const long = ['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].includes(vr)
    const header = new Uint8Array(long ? 12 : 8)
    const view = new DataView(header.buffer)
    view.setUint16(0, tag[0], true)
    view.setUint16(2, tag[1], true)
    header[4] = vr.charCodeAt(0)
    header[5] = vr.charCodeAt(1)
    if (long) view.setUint32(8, value.length, true)
    else view.setUint16(6, value.length, true)
    chunks.push(header, value)
  }
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export type SliceSpec = {
  rows: number
  cols: number
  /** [between rows, between columns] in mm. */
  pixelSpacing: [number, number]
  position: [number, number, number]
  orientation: [number, number, number, number, number, number]
  /** Stored values; HU = value * slope + intercept. */
  pixels: Int16Array
  slope?: number
  intercept?: number
  seriesUid?: string
  transferSyntax?: string
  modality?: string
}

export function writeDicomSlice(spec: SliceSpec): Uint8Array {
  const meta = encode([
    { tag: [0x0002, 0x0001], vr: 'OB', value: new Uint8Array([0, 1]) },
    { tag: [0x0002, 0x0002], vr: 'UI', value: text('1.2.840.10008.5.1.4.1.1.2', '\0') },
    { tag: [0x0002, 0x0003], vr: 'UI', value: text('1.2.3.4.5.6.7', '\0') },
    { tag: [0x0002, 0x0010], vr: 'UI', value: text(spec.transferSyntax ?? '1.2.840.10008.1.2.1', '\0') },
  ])
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, meta.length, true)
  const group = encode([{ tag: [0x0002, 0x0000], vr: 'UL', value: length }])

  const ds = (values: number[]) => text(values.map(value => String(Number(value.toFixed(6)))).join('\\'))
  const body = encode([
    { tag: [0x0008, 0x0060], vr: 'CS', value: text(spec.modality ?? 'CT') },
    { tag: [0x0008, 0x0070], vr: 'LO', value: text('Phantom') },
    { tag: [0x0020, 0x000e], vr: 'UI', value: text(spec.seriesUid ?? '1.2.826.0.1.3680043.9.1', '\0') },
    { tag: [0x0020, 0x0032], vr: 'DS', value: ds(spec.position) },
    { tag: [0x0020, 0x0037], vr: 'DS', value: ds(spec.orientation) },
    { tag: [0x0028, 0x0002], vr: 'US', value: us(1) },
    { tag: [0x0028, 0x0004], vr: 'CS', value: text('MONOCHROME2') },
    { tag: [0x0028, 0x0010], vr: 'US', value: us(spec.rows) },
    { tag: [0x0028, 0x0011], vr: 'US', value: us(spec.cols) },
    { tag: [0x0028, 0x0030], vr: 'DS', value: ds(spec.pixelSpacing) },
    { tag: [0x0028, 0x0100], vr: 'US', value: us(16) },
    { tag: [0x0028, 0x0101], vr: 'US', value: us(16) },
    { tag: [0x0028, 0x0102], vr: 'US', value: us(15) },
    { tag: [0x0028, 0x0103], vr: 'US', value: us(1) },
    { tag: [0x0028, 0x1052], vr: 'DS', value: ds([spec.intercept ?? 0]) },
    { tag: [0x0028, 0x1053], vr: 'DS', value: ds([spec.slope ?? 1]) },
    { tag: [0x7fe0, 0x0010], vr: 'OW', value: new Uint8Array(spec.pixels.buffer, spec.pixels.byteOffset, spec.pixels.byteLength) },
  ])

  const out = new Uint8Array(132 + group.length + meta.length + body.length)
  out.set(new TextEncoder().encode('DICM'), 128)
  out.set(group, 132)
  out.set(meta, 132 + group.length)
  out.set(body, 132 + group.length + meta.length)
  return out
}

export type PhantomOptions = {
  /** Voxel edge in mm. */
  voxel: number
  /** Half extent of the scanned cube in mm. */
  half: number
  /** Hounsfield value at a point given in DICOM patient coordinates (LPS, mm). */
  density: (l: number, p: number, s: number) => number
}

/** An axial series, head-first supine: columns run to the patient's left, rows to the posterior, slices upward. */
export function writePhantomSeries(options: PhantomOptions): Array<{ name: string; bytes: Uint8Array }> {
  const n = Math.round((2 * options.half) / options.voxel) + 1
  const files: Array<{ name: string; bytes: Uint8Array }> = []
  for (let k = 0; k < n; k += 1) {
    const pixels = new Int16Array(n * n)
    const s = -options.half + k * options.voxel
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        // Stored with a rescale of slope 1, intercept -1024, as CT scanners do.
        pixels[col + n * row] = Math.round(options.density(-options.half + col * options.voxel, -options.half + row * options.voxel, s)) + 1024
      }
    }
    files.push({
      name: `IM${String(k).padStart(4, '0')}.dcm`,
      bytes: writeDicomSlice({
        rows: n,
        cols: n,
        pixelSpacing: [options.voxel, options.voxel],
        position: [-options.half, -options.half, s],
        orientation: [1, 0, 0, 0, 1, 0],
        pixels,
        intercept: -1024,
      }),
    })
  }
  return files
}

/**
 * A head-like phantom: an ellipsoid of soft tissue with a bone shell inside,
 * a chin, a nose and a marker on the patient's LEFT cheek. Coordinates are
 * LPS (x left, y posterior, z superior), so the front of the face is at -y.
 */
export function headDensity(l: number, p: number, s: number): number {
  const ellipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => ((l - cx) / rx) ** 2 + ((p - cy) / ry) ** 2 + ((s - cz) / rz) ** 2
  const skin = Math.min(ellipsoid(0, 0, 0, 70, 85, 95), ellipsoid(0, -78, -70, 22, 18, 20), ellipsoid(0, -88, -10, 12, 16, 18), ellipsoid(55, -52, -20, 9, 9, 9))
  const outerBone = Math.min(ellipsoid(0, 0, 0, 62, 75, 86), ellipsoid(0, -68, -70, 18, 14, 16))
  const innerBone = ellipsoid(0, 0, 0, 55, 68, 79)
  if (outerBone <= 1 && innerBone > 1) return 1200
  if (skin <= 1) return 40
  return -1000
}
