// Shared by the browser (early feedback) and the server (the real check).
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
export const MIN_SIDE_PX = 512
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ImageKind = (typeof ACCEPTED_TYPES)[number]

/** Reads the file signature; the declared MIME type is never trusted. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  return riff && webp ? 'image/webp' : null
}
