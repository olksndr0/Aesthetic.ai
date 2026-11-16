import * as dicomParserModule from 'dicom-parser'

import { blockTransform, type Volume } from './isosurface'
import { LPS_TO_CANONICAL, cross, dot, length, multiply, normalize, scale, sub, type Mat4, type Vec3 } from './math'

// The package is a UMD bundle: depending on the bundler it arrives as the namespace or under `default`.
const dicomParser: typeof dicomParserModule = (dicomParserModule as unknown as { default?: typeof dicomParserModule }).default ?? dicomParserModule

export type DicomErrorCode =
  | 'no_dicom'
  | 'not_a_volume'
  | 'compressed'
  | 'unsupported_pixels'
  | 'inconsistent_series'
  | 'irregular_spacing'
  | 'missing_geometry'

export class DicomError extends Error {
  constructor(
    public code: DicomErrorCode,
    message: string,
  ) {
    super(message)
  }
}

/** A file the series loader can read on demand, so a whole study is never held in memory at once. */
export type DicomSource = { name: string; read(): Promise<Uint8Array> }

type Slice = {
  source: DicomSource
  rows: number
  cols: number
  /** [between rows, between columns] in mm, as stored in PixelSpacing. */
  pixelSpacing: [number, number]
  position: Vec3
  rowDirection: Vec3
  colDirection: Vec3
  slope: number
  intercept: number
  bitsAllocated: number
  signed: boolean
  seriesUid: string
  modality: string
  manufacturer: string
  rescaleType: string
}

export type SeriesInfo = {
  modality: string
  manufacturer: string
  sliceCount: number
  /** Columns, rows, slices of the acquisition. */
  acquiredDims: [number, number, number]
  /** Voxel size of the acquisition in mm (column, row, slice). */
  acquiredVoxel: Vec3
  /** Block factors applied before surface extraction. */
  reduction: [number, number, number]
  /** Voxel size of the volume surfaces are extracted from, in mm. */
  workingVoxel: Vec3
  /** True when the series declares Hounsfield units; CBCT grey values usually are not calibrated. */
  hounsfield: boolean
  gantryTiltDeg: number
  ignoredFiles: number
  otherSeries: number
  warnings: string[]
}

// Uncompressed little-endian only. Compressed syntaxes need a codec that is not part of this project.
const UNCOMPRESSED = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1'])

function numbers(text: string | undefined, count: number): number[] | null {
  if (!text) return null
  const parts = text.split('\\').map(Number)
  return parts.length >= count && parts.slice(0, count).every(Number.isFinite) ? parts.slice(0, count) : null
}

function hasPreamble(bytes: Uint8Array): boolean {
  return bytes.length > 132 && bytes[128] === 0x44 && bytes[129] === 0x49 && bytes[130] === 0x43 && bytes[131] === 0x4d
}

/** Reads the geometry of one slice. Returns null for a file that is not an image slice (DICOMDIR, reports, non-DICOM). */
function readSlice(source: DicomSource, bytes: Uint8Array): Slice | null {
  if (!hasPreamble(bytes)) return null
  let data: dicomParserModule.DataSet
  try {
    data = dicomParser.parseDicom(bytes, { untilTag: 'x7fe00010' })
  } catch {
    return null
  }
  const rows = data.uint16('x00280010')
  const cols = data.uint16('x00280011')
  if (!rows || !cols) return null

  const syntax = (data.string('x00020010') ?? '').trim()
  if (!UNCOMPRESSED.has(syntax)) {
    throw new DicomError(
      'compressed',
      `"${source.name}" uses a compressed or unsupported transfer syntax (${syntax || 'unknown'}). Export the series as uncompressed DICOM (Explicit or Implicit VR Little Endian).`,
    )
  }
  if (Number(data.intString('x00280008') ?? 1) > 1) {
    throw new DicomError('unsupported_pixels', `"${source.name}" is a multi-frame object. Export the volume as one file per slice.`)
  }
  const samples = data.uint16('x00280002') ?? 1
  const bitsAllocated = data.uint16('x00280100') ?? 16
  if (samples !== 1 || bitsAllocated !== 16) {
    throw new DicomError('unsupported_pixels', `"${source.name}" is not a 16-bit greyscale slice.`)
  }

  const position = numbers(data.string('x00200032'), 3)
  const orientation = numbers(data.string('x00200037'), 6)
  const spacing = numbers(data.string('x00280030'), 2)
  if (!position || !orientation || !spacing) {
    throw new DicomError(
      'missing_geometry',
      `"${source.name}" has no position, orientation or pixel spacing, so it cannot be placed in space. A plain radiograph is not a volume.`,
    )
  }

  return {
    source,
    rows,
    cols,
    pixelSpacing: [spacing[0]!, spacing[1]!],
    position: position as Vec3,
    rowDirection: normalize(orientation.slice(0, 3) as Vec3),
    colDirection: normalize(orientation.slice(3, 6) as Vec3),
    slope: data.floatString('x00281053') ?? 1,
    intercept: data.floatString('x00281052') ?? 0,
    bitsAllocated,
    signed: (data.uint16('x00280103') ?? 0) === 1,
    seriesUid: (data.string('x0020000e') ?? '').trim(),
    modality: (data.string('x00080060') ?? '').trim(),
    manufacturer: (data.string('x00080070') ?? '').trim(),
    rescaleType: (data.string('x00281054') ?? '').trim(),
  }
}

function readPixels(bytes: Uint8Array, slice: Slice): Int16Array | Uint16Array {
  const data = dicomParser.parseDicom(bytes)
  const element = data.elements.x7fe00010
  const expected = slice.rows * slice.cols * 2
  if (!element || element.length < expected) {
    throw new DicomError('unsupported_pixels', `"${slice.source.name}" has incomplete pixel data.`)
  }
  const raw = bytes.slice(element.dataOffset, element.dataOffset + expected)
  return slice.signed ? new Int16Array(raw.buffer) : new Uint16Array(raw.buffer)
}

const close = (a: Vec3, b: Vec3, tolerance: number) => length(sub(a, b)) <= tolerance

/**
 * Loads one CT/CBCT series into a volume in the canonical frame. Geometry
 * comes from the DICOM headers only (position, orientation, spacing), so
 * scale and left/right are those of the acquisition. The volume is averaged
 * in blocks to `targetVoxelMm` before use; the reduction is reported.
 */
export async function loadSeries(
  sources: DicomSource[],
  options: { targetVoxelMm: number; maxVoxels?: number; onProgress?: (done: number, total: number, phase: 'headers' | 'pixels') => void },
): Promise<{ volume: Volume; info: SeriesInfo }> {
  const groups = new Map<string, Slice[]>()
  let ignored = 0
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i]!
    const slice = readSlice(source, await source.read())
    if (slice) groups.set(slice.seriesUid, [...(groups.get(slice.seriesUid) ?? []), slice])
    else ignored += 1
    options.onProgress?.(i + 1, sources.length, 'headers')
  }
  if (groups.size === 0) throw new DicomError('no_dicom', 'No DICOM image slices were found in the selected files.')

  const slices = [...groups.values()].sort((a, b) => b.length - a.length)[0]!
  const reference = slices[0]!
  if (slices.length < 8) {
    throw new DicomError(
      'not_a_volume',
      `Only ${slices.length} slice${slices.length === 1 ? '' : 's'} found. A single radiograph or a few slices cannot be reconstructed into a 3D model; select the whole CT/CBCT series.`,
    )
  }
  for (const slice of slices) {
    const same =
      slice.rows === reference.rows &&
      slice.cols === reference.cols &&
      close(slice.rowDirection, reference.rowDirection, 1e-3) &&
      close(slice.colDirection, reference.colDirection, 1e-3) &&
      Math.abs(slice.pixelSpacing[0] - reference.pixelSpacing[0]) < 1e-4 &&
      Math.abs(slice.pixelSpacing[1] - reference.pixelSpacing[1]) < 1e-4
    if (!same) throw new DicomError('inconsistent_series', `"${slice.source.name}" does not match the size, spacing or orientation of the rest of the series.`)
  }

  // Order along the slice normal; this also fixes the handedness of the volume.
  const normal = normalize(cross(reference.rowDirection, reference.colDirection))
  slices.sort((a, b) => dot(a.position, normal) - dot(b.position, normal))
  const first = slices[0]!
  const last = slices[slices.length - 1]!
  const step = scale(sub(last.position, first.position), 1 / (slices.length - 1))
  const stepLength = length(step)
  if (stepLength < 1e-4) throw new DicomError('irregular_spacing', 'All slices share the same position.')
  for (let i = 1; i < slices.length; i += 1) {
    const gap = dot(sub(slices[i]!.position, slices[i - 1]!.position), normal)
    if (Math.abs(gap - dot(step, normal)) > Math.max(0.02, 0.05 * stepLength)) {
      throw new DicomError(
        'irregular_spacing',
        `The distance between slices is not constant near "${slices[i]!.source.name}" (${gap.toFixed(2)} mm instead of ${stepLength.toFixed(2)} mm). Slices are missing or duplicated.`,
      )
    }
  }

  const warnings: string[] = []
  const tilt = (Math.acos(Math.min(1, Math.abs(dot(normalize(step), normal)))) * 180) / Math.PI
  if (tilt > 0.5) warnings.push(`Gantry tilt of ${tilt.toFixed(1)}° detected; the volume is sheared accordingly.`)
  const hounsfield = first.modality === 'CT' && (first.rescaleType === '' || first.rescaleType.toUpperCase() === 'HU')
  if (groups.size > 1) warnings.push(`${groups.size - 1} other series in the selection were not used.`)

  const colSpacing = first.pixelSpacing[1]
  const rowSpacing = first.pixelSpacing[0]
  const acquiredDims: [number, number, number] = [first.cols, first.rows, slices.length]
  const reduce = (voxel: number) => Math.max(1, Math.round(options.targetVoxelMm / voxel))
  const factor: [number, number, number] = [reduce(colSpacing), reduce(rowSpacing), reduce(stepLength)]
  const maxVoxels = options.maxVoxels ?? 20_000_000
  const voxels = () => Math.floor(acquiredDims[0] / factor[0]) * Math.floor(acquiredDims[1] / factor[1]) * Math.floor(acquiredDims[2] / factor[2])
  while (voxels() > maxVoxels) {
    // Reduce the finest axis first.
    const sizes = [colSpacing * factor[0], rowSpacing * factor[1], stepLength * factor[2]]
    const finest = sizes.indexOf(Math.min(...sizes))
    factor[finest] = factor[finest]! + 1
  }

  const [fx, fy, fz] = factor
  const mx = Math.floor(first.cols / fx)
  const my = Math.floor(first.rows / fy)
  const mz = Math.floor(slices.length / fz)
  if (mx < 2 || my < 2 || mz < 2) throw new DicomError('not_a_volume', 'The series is too small to reconstruct.')

  const data = new Int16Array(mx * my * mz)
  const sums = new Float64Array(mx * my)
  const block = fx * fy * fz
  for (let k = 0; k < mz * fz; k += 1) {
    const slice = slices[k]!
    const pixels = readPixels(await slice.source.read(), slice)
    for (let y = 0; y < my; y += 1) {
      for (let dy = 0; dy < fy; dy += 1) {
        const row = (y * fy + dy) * slice.cols
        for (let x = 0; x < mx; x += 1) {
          let sum = 0
          for (let dx = 0; dx < fx; dx += 1) sum += pixels[row + x * fx + dx]!
          sums[x + mx * y] = sums[x + mx * y]! + sum * slice.slope + fx * slice.intercept
        }
      }
    }
    if ((k + 1) % fz === 0) {
      const out = mx * my * ((k + 1) / fz - 1)
      for (let i = 0; i < sums.length; i += 1) {
        data[out + i] = Math.max(-32768, Math.min(32767, Math.round(sums[i]! / block)))
      }
      sums.fill(0)
    }
    options.onProgress?.(k + 1, mz * fz, 'pixels')
  }

  // Voxel (column, row, slice) to DICOM patient coordinates, then to the canonical frame.
  const r = scale(first.rowDirection, colSpacing)
  const c = scale(first.colDirection, rowSpacing)
  const indexToLps: Mat4 = [r[0], c[0], step[0], first.position[0], r[1], c[1], step[1], first.position[1], r[2], c[2], step[2], first.position[2], 0, 0, 0, 1]
  const indexToWorld = blockTransform(multiply(LPS_TO_CANONICAL, indexToLps), factor)

  return {
    volume: { data, dims: [mx, my, mz], indexToWorld },
    info: {
      modality: first.modality || 'unknown',
      manufacturer: first.manufacturer,
      sliceCount: slices.length,
      acquiredDims,
      acquiredVoxel: [colSpacing, rowSpacing, stepLength],
      reduction: factor,
      workingVoxel: [colSpacing * fx, rowSpacing * fy, stepLength * fz],
      hounsfield,
      gantryTiltDeg: tilt,
      ignoredFiles: ignored,
      otherSeries: groups.size - 1,
      warnings,
    },
  }
}
