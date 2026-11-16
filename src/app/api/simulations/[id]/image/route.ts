import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { storage } from '@/lib/storage'

export const runtime = 'nodejs'

// The only door to a stored image. The owner check is part of the query, so
// another account's id answers 404, the same as an id that does not exist.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Sign in to view this image.')

  const { id } = await params
  const url = new URL(request.url)
  const type = url.searchParams.get('type') === 'original' ? 'original' : 'result'

  const simulation = await db.simulation.findFirst({ where: { id, userId: user.id } })
  const key = type === 'original' ? simulation?.originalKey : simulation?.resultKey
  if (!simulation || !key) return jsonError(404, 'not_found', 'Image not found.')

  let data: Buffer
  try {
    data = await storage().get(key)
  } catch {
    return jsonError(404, 'not_found', 'Image not found.')
  }

  const headers = new Headers({
    'Content-Type': 'image/jpeg',
    'Content-Length': String(data.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  if (url.searchParams.get('download') === '1') {
    headers.set('Content-Disposition', `attachment; filename="aesthetic-ai-${simulation.procedure}-${type}.jpg"`)
  }
  return new Response(new Uint8Array(data), { headers })
}
