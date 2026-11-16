import { NextResponse } from 'next/server'

import { viewIdSchema } from '@/lib/anatomy/schema'
import { jsonError } from '@/lib/http'
import { isResponse, planningFailure, planningUser } from '@/lib/planning-http'
import { ownedProfile, photoRecords, storeProfilePhoto } from '@/lib/profiles'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-rules'

export const runtime = 'nodejs'

/** Stores the photograph of one view of a profile and returns the whole set as stored. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await planningUser(request, true)
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await ownedProfile(id, user.id))) return jsonError(404, 'not_found', 'Profile not found.')

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError(400, 'bad_request', 'The upload could not be read.')
  }
  const view = viewIdSchema.safeParse(form.get('view'))
  const file = form.get('file')
  if (!view.success) return jsonError(400, 'invalid', 'Choose which view the photograph shows.')
  if (!(file instanceof File) || file.size === 0) return jsonError(400, 'invalid', 'Attach a photo.')
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, 'too_large', 'The photo is larger than 12 MB.')

  try {
    await storeProfilePhoto(user.id, id, view.data, Buffer.from(await file.arrayBuffer()))
  } catch (error) {
    return planningFailure(error)
  }
  const fresh = await ownedProfile(id, user.id)
  return NextResponse.json({ photos: photoRecords(fresh?.photos ?? []) })
}
