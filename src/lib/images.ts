import 'server-only'

import sharp from 'sharp'

import { MAX_UPLOAD_BYTES, MIN_SIDE_PX, sniffImage } from './upload-rules'

export class UploadError extends Error {}

/**
 * Validates an upload and re-encodes it: orientation applied, EXIF (location,
 * device) stripped, longest side capped. What we store is never the raw file.
 */
export async function prepareUpload(raw: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  if (raw.length === 0) throw new UploadError('The file is empty.')
  if (raw.length > MAX_UPLOAD_BYTES) throw new UploadError('The photo is larger than 12 MB.')
  if (!sniffImage(raw)) throw new UploadError('Upload a JPEG, PNG or WebP photo.')

  try {
    const { data, info } = await sharp(raw, { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    if (Math.min(info.width, info.height) < MIN_SIDE_PX) {
      throw new UploadError(`The photo is too small. The shorter side must be at least ${MIN_SIDE_PX} px.`)
    }
    return { data, width: info.width, height: info.height }
  } catch (error) {
    if (error instanceof UploadError) throw error
    throw new UploadError('The photo could not be read. Try another file.')
  }
}

/** Normalises what the provider returned: JPEG, capped to the plan's resolution. */
export async function finalizeResult(raw: Buffer, maxSide: number): Promise<Buffer> {
  return sharp(raw)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer()
}
