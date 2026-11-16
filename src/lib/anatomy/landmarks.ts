import { UNIT_TO_MM, angleDeg, distance, isVec3, round, type Unit, type Vec3 } from './math'

export type Layer = 'skull' | 'face'
export type Side = 'R' | 'L' | null

/**
 * Where a coordinate comes from. `acquired`: measured on scanned geometry or
 * imported from a measurement. `estimated`: placed on reconstructed or
 * inferred geometry. `modified` is never stored: it marks a landmark the
 * simulation has moved.
 */
export type Provenance = 'acquired' | 'estimated'

export type LandmarkDefinition = { code: string; name: string; layer: Layer; side: Side }

// Standard craniometric (bone) and cephalometric soft-tissue points.
export const LANDMARKS: LandmarkDefinition[] = [
  { code: 'N', name: 'Nasion', layer: 'skull', side: null },
  { code: 'S', name: 'Sella', layer: 'skull', side: null },
  { code: 'Ba', name: 'Basion', layer: 'skull', side: null },
  { code: 'ANS', name: 'Anterior nasal spine', layer: 'skull', side: null },
  { code: 'PNS', name: 'Posterior nasal spine', layer: 'skull', side: null },
  { code: 'A', name: 'A point (subspinale)', layer: 'skull', side: null },
  { code: 'B', name: 'B point (supramentale)', layer: 'skull', side: null },
  { code: 'Pog', name: 'Pogonion', layer: 'skull', side: null },
  { code: 'Gn', name: 'Gnathion', layer: 'skull', side: null },
  { code: 'Me', name: 'Menton', layer: 'skull', side: null },
  { code: 'Or-R', name: 'Orbitale right', layer: 'skull', side: 'R' },
  { code: 'Or-L', name: 'Orbitale left', layer: 'skull', side: 'L' },
  { code: 'Po-R', name: 'Porion right', layer: 'skull', side: 'R' },
  { code: 'Po-L', name: 'Porion left', layer: 'skull', side: 'L' },
  { code: 'Zy-R', name: 'Zygion right', layer: 'skull', side: 'R' },
  { code: 'Zy-L', name: 'Zygion left', layer: 'skull', side: 'L' },
  { code: 'Go-R', name: 'Gonion right', layer: 'skull', side: 'R' },
  { code: 'Go-L', name: 'Gonion left', layer: 'skull', side: 'L' },
  { code: 'Co-R', name: 'Condylion right', layer: 'skull', side: 'R' },
  { code: 'Co-L', name: 'Condylion left', layer: 'skull', side: 'L' },
  { code: "G'", name: 'Soft-tissue glabella', layer: 'face', side: null },
  { code: "N'", name: 'Soft-tissue nasion', layer: 'face', side: null },
  { code: 'Prn', name: 'Pronasale', layer: 'face', side: null },
  { code: 'Sn', name: 'Subnasale', layer: 'face', side: null },
  { code: 'Ls', name: 'Labrale superius', layer: 'face', side: null },
  { code: 'Sto', name: 'Stomion', layer: 'face', side: null },
  { code: 'Li', name: 'Labrale inferius', layer: 'face', side: null },
  { code: 'Sm', name: 'Mentolabial sulcus', layer: 'face', side: null },
  { code: "Pog'", name: 'Soft-tissue pogonion', layer: 'face', side: null },
  { code: "Me'", name: 'Soft-tissue menton', layer: 'face', side: null },
  { code: 'En-R', name: 'Endocanthion right', layer: 'face', side: 'R' },
  { code: 'En-L', name: 'Endocanthion left', layer: 'face', side: 'L' },
  { code: 'Ex-R', name: 'Exocanthion right', layer: 'face', side: 'R' },
  { code: 'Ex-L', name: 'Exocanthion left', layer: 'face', side: 'L' },
  { code: 'Al-R', name: 'Alare right', layer: 'face', side: 'R' },
  { code: 'Al-L', name: 'Alare left', layer: 'face', side: 'L' },
  { code: 'Ch-R', name: 'Cheilion right', layer: 'face', side: 'R' },
  { code: 'Ch-L', name: 'Cheilion left', layer: 'face', side: 'L' },
  { code: 'T-R', name: 'Tragion right', layer: 'face', side: 'R' },
  { code: 'T-L', name: 'Tragion left', layer: 'face', side: 'L' },
]

export function landmarkDefinition(code: string): LandmarkDefinition | undefined {
  return LANDMARKS.find(item => item.code.toLowerCase() === code.trim().toLowerCase())
}

export type Landmark = {
  id: string
  code: string
  name: string
  layer: Layer
  side: Side
  /** Canonical frame, millimetres. */
  position: Vec3
  provenance: Provenance
  /** Free text: who or what produced the coordinate (e.g. "picked on CT surface", "cephalometric tracing, Dr. X"). */
  source: string
  /** Unit the value was supplied in, kept for traceability. */
  unit: Unit
}

export type Measure = { id: string; kind: 'distance' | 'angle'; label: string; landmarks: string[] }

/** Value of a measure from landmark coordinates: millimetres or degrees. Null when a landmark is missing. */
export function measureValue(measure: Measure, positions: Map<string, Vec3>): number | null {
  const points = measure.landmarks.map(id => positions.get(id))
  if (points.some(point => !point)) return null
  if (measure.kind === 'distance' && points.length === 2) return round(distance(points[0]!, points[1]!))
  if (measure.kind === 'angle' && points.length === 3) return round(angleDeg(points[0]!, points[1]!, points[2]!), 1)
  return null
}

export type SideIssue = { code: string; message: string }

/**
 * Left/right consistency. In the canonical frame the patient's left is +X, so
 * a right-side landmark must lie at smaller X than its left counterpart, and
 * on its own side of the midline points. A failure means a mirrored model or
 * mislabelled points.
 */
export function checkSides(landmarks: Landmark[]): SideIssue[] {
  const issues: SideIssue[] = []
  const midline = landmarks.filter(item => item.side === null)
  const midX = midline.length > 0 ? midline.reduce((sum, item) => sum + item.position[0], 0) / midline.length : null

  for (const right of landmarks.filter(item => item.side === 'R')) {
    const left = landmarks.find(item => item.side === 'L' && item.layer === right.layer && item.code === right.code.replace(/-R$/, '-L'))
    if (left && right.position[0] >= left.position[0]) {
      issues.push({ code: right.code, message: `${right.name} is on the patient's left of ${left.name}. The model may be mirrored, or the two points are swapped.` })
    }
  }
  if (midX !== null) {
    for (const item of landmarks) {
      if (item.side === 'R' && item.position[0] > midX) issues.push({ code: item.code, message: `${item.name} lies on the left of the midline landmarks.` })
      if (item.side === 'L' && item.position[0] < midX) issues.push({ code: item.code, message: `${item.name} lies on the right of the midline landmarks.` })
    }
  }
  return issues
}

export type ImportedPoint = { code: string; name: string; position: Vec3 }

/**
 * Reads a landmark table: JSON (`[{ "code": "N", "x": 0, "y": 0, "z": 0 }]`)
 * or CSV/TSV with columns code, x, y, z (a header row is optional). Values
 * are converted to millimetres; the frame is handled by the caller.
 */
export function parseLandmarkTable(text: string, unit: Unit): { points: ImportedPoint[]; errors: string[] } {
  const points: ImportedPoint[] = []
  const errors: string[] = []
  const k = UNIT_TO_MM[unit]
  const push = (code: unknown, x: unknown, y: unknown, z: unknown, where: string) => {
    const position = [Number(x) * k, Number(y) * k, Number(z) * k]
    const label = String(code ?? '').trim()
    if (!label) return errors.push(`${where}: missing landmark code.`)
    if (!isVec3(position)) return errors.push(`${where}: "${label}" has a coordinate that is not a number.`)
    if (points.some(point => point.code.toLowerCase() === label.toLowerCase())) return errors.push(`${where}: "${label}" appears twice.`)
    const known = landmarkDefinition(label)
    points.push({ code: known?.code ?? label, name: known?.name ?? label, position: position as [number, number, number] })
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const rows = Array.isArray(parsed) ? parsed : ((parsed as { landmarks?: unknown }).landmarks ?? [])
      if (!Array.isArray(rows)) throw new Error('not a list')
      rows.forEach((row, index) => {
        const item = row as Record<string, unknown>
        const position = Array.isArray(item.position) ? item.position : [item.x, item.y, item.z]
        push(item.code ?? item.name, position[0], position[1], position[2], `Item ${index + 1}`)
      })
    } catch {
      errors.push('The file is not valid JSON.')
    }
    return { points, errors }
  }

  trimmed.split(/\r?\n/).forEach((line, index) => {
    // With ";" or tab as the separator, a comma inside a cell is a decimal comma.
    const cells = /[;\t]/.test(line) ? line.split(/[;\t]/).map(cell => cell.trim().replace(',', '.')) : line.split(',').map(cell => cell.trim())
    if (cells.length < 4 || cells.every(cell => cell === '')) return
    if (index === 0 && cells.slice(1, 4).some(cell => Number.isNaN(Number(cell)))) return // header
    push(cells[0], cells[1], cells[2], cells[3], `Line ${index + 1}`)
  })
  if (points.length === 0 && errors.length === 0) errors.push('No landmark rows found. Expected columns: code, x, y, z.')
  return { points, errors }
}
