import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { jsonError } from '@/lib/http'
import { isResponse, planningUser } from '@/lib/planning-http'
import { ownedProfilePhoto } from '@/lib/profiles'
import { storage } from '@/lib/storage'

export const runtime = 'nodejs'

// The only door to a profile photograph; the owner is part of the query.
export async function GET(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const user = await planningUser(request, false)
  if (isResponse(user)) return user
  const { photoId } = await params
  const photo = await ownedProfilePhoto(photoId, user.id)
  if (!photo?.key) return jsonError(404, 'not_found', 'Photo not found.')
  let data: Buffer
  try {
    data = await storage().get(photo.key)
  } catch {
    return jsonError(404, 'not_found', 'Photo not found.')
  }
  return new Response(new Uint8Array(data), {
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(data.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { photoId } = await params
  const photo = await ownedProfilePhoto(photoId, user.id)
  if (!photo) return jsonError(404, 'not_found', 'Photo not found.')
  await storage().remove(photo.key).catch(() => undefined)
  await db.profilePhoto.delete({ where: { id: photoId } })
  return NextResponse.json({ ok: true })
}
