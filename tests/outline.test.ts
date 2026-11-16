import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { checkOutline } from '@/lib/outline-check'

const W = 512
const H = 640

/** A disc on a plain background, as raw RGB turned into PNG. */
async function disc(cx: number, cy: number, r: number, subject: [number, number, number], background: [number, number, number], patch?: [number, number, number]) {
  const data = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const inside = Math.hypot(x - cx, y - cy) <= r
      // An area of the subject that happens to have the background's colour.
      const lit = patch && Math.hypot(x - cx, y - cy) <= r / 3
      const colour = inside ? (lit ? patch : subject) : background
      data.set(colour, (x + W * y) * 3)
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
}

describe('outline check of a generated photograph', () => {
  const grey: [number, number, number] = [200, 200, 200]
  const skin: [number, number, number] = [205, 160, 135]
  const roi = { x: 180, y: 380, width: 150, height: 100 } // lower edge of the disc
  const base = { roi, renderWidth: W, mmPerPixel: 0.4, toleranceMm: 2 }

  it('passes an image that keeps the outline, even where the subject matches the background colour', async () => {
    const outline = await disc(256, 320, 150, [255, 255, 255], [0, 0, 0])
    const generated = await disc(256, 320, 150, skin, grey, grey)
    const check = await checkOutline({ ...base, generated, outline })
    expect(check.status).toBe('pass')
    expect(check.meanDeviationMm).toBeLessThan(0.5)
  })

  it('flags an image whose outline moved, and reports roughly by how much', async () => {
    const outline = await disc(256, 320, 150, [255, 255, 255], [0, 0, 0])
    const generated = await disc(256, 335, 150, skin, grey) // 15 px lower: 6 mm at 0.4 mm per pixel
    const check = await checkOutline({ ...base, generated, outline })
    expect(check.status).toBe('fail')
    expect(check.meanDeviationMm).toBeGreaterThan(4)
    expect(check.meanDeviationMm).toBeLessThan(8)
  })

  it('says so when the outline cannot speak for the changed region', async () => {
    const outline = await disc(256, 320, 150, [255, 255, 255], [0, 0, 0])
    const generated = await disc(256, 320, 150, skin, grey)
    const inner = await checkOutline({ ...base, roi: { x: 230, y: 300, width: 40, height: 40 }, generated, outline })
    expect(inner.status).toBe('not_assessable')
    const none = await checkOutline({ ...base, roi: null, generated, outline })
    expect(none.status).toBe('not_assessable')
    expect(none.meanDeviationMm).toBeNull()
  })
})
