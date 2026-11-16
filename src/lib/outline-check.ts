import 'server-only'

import sharp from 'sharp'

export type OutlineCheck = {
  /** `not_assessable`: the changed region does not touch the outline in this view, so the outline says nothing about it. */
  status: 'pass' | 'fail' | 'not_assessable'
  /** Mean distance between the generated outline and the 3D outline inside the changed region, in mm. */
  meanDeviationMm: number | null
  toleranceMm: number
  note: string
}

type Roi = { x: number; y: number; width: number; height: number }

const WORK_WIDTH = 512

/**
 * Compares the outline of a generated photograph with the outline of the 3D
 * model it was asked to follow, inside the region the simulation changed.
 * The subject is separated from the plain background by colour; the area in
 * which the two outlines disagree, divided by the length of the 3D outline,
 * is the mean deviation. This checks the silhouette only. It cannot see
 * changes inside the outline, and it does not locate landmarks.
 */
export async function checkOutline(input: {
  generated: Buffer
  /** White subject on black, rendered from the simulated model with the same camera. */
  outline: Buffer
  roi: Roi | null
  renderWidth: number
  mmPerPixel: number
  toleranceMm: number
}): Promise<OutlineCheck> {
  const { toleranceMm } = input
  if (!input.roi) {
    return { status: 'not_assessable', meanDeviationMm: null, toleranceMm, note: 'Nothing moves in this view.' }
  }

  const reference = await sharp(input.outline).resize({ width: WORK_WIDTH }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = reference.info
  const generated = await sharp(input.generated).resize({ width, height, fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer()

  // Background colour: the median of the image border.
  const border: number[][] = [[], [], []]
  const frame = Math.max(2, Math.round(width * 0.03))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= frame && x < width - frame && y >= frame && y < height - frame) continue
      for (let c = 0; c < 3; c += 1) border[c]!.push(generated[(x + width * y) * 3 + c]!)
    }
  }
  const background = border.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!)
  const subject = (x: number, y: number) => {
    const i = (x + width * y) * 3
    return Math.hypot(generated[i]! - background[0]!, generated[i + 1]! - background[1]!, generated[i + 2]! - background[2]!) > 30
  }
  const model = (x: number, y: number) => reference.data[x + width * y]! > 127

  const k = width / input.renderWidth
  const margin = 12
  const x0 = Math.max(1, Math.floor(input.roi.x * k) - margin)
  const y0 = Math.max(1, Math.floor(input.roi.y * k) - margin)
  const x1 = Math.min(width - 2, Math.ceil((input.roi.x + input.roi.width) * k) + margin)
  const y1 = Math.min(height - 2, Math.ceil((input.roi.y + input.roi.height) * k) + margin)

  let contour = 0
  let disagreement = 0
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const inside = model(x, y)
      if (inside && !(model(x - 1, y) && model(x + 1, y) && model(x, y - 1) && model(x, y + 1))) contour += 1
      if (inside !== subject(x, y)) disagreement += 1
    }
  }
  if (contour < 20) {
    return {
      status: 'not_assessable',
      meanDeviationMm: null,
      toleranceMm,
      note: 'The changed region lies inside the outline in this view, so the outline cannot confirm it.',
    }
  }

  const meanDeviationMm = Math.round(((disagreement / contour) * input.mmPerPixel) / k * 100) / 100
  const pass = meanDeviationMm <= toleranceMm
  return {
    status: pass ? 'pass' : 'fail',
    meanDeviationMm,
    toleranceMm,
    note: pass
      ? 'The generated outline follows the 3D model within the tolerance.'
      : 'The generated outline departs from the 3D model by more than the tolerance. Rely on the geometric render for this view.',
  }
}
