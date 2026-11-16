import 'server-only'

import type { User } from '@prisma/client'

import { db } from './db'
import { UploadError, prepareUpload } from './images'
import { PlanningError, photoQuality } from './planning'
import { MAX_PROFILES, profileDataSchema, type ProfileData } from './profile/fields'
import { storage } from './storage'

// Ownership is part of every query: another account's id answers "not found".
export function ownedProfile(id: string, userId: string) {
  return db.patientProfile.findFirst({ where: { id, userId }, include: { photos: { orderBy: { createdAt: 'asc' } } } })
}

export function ownedProfilePhoto(id: string, userId: string) {
  return db.profilePhoto.findFirst({ where: { id, profile: { userId } } })
}

export function profileData(value: unknown): ProfileData {
  const parsed = profileDataSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

/** Accounts keep a few people; development access is not limited. */
export async function canAddProfile(user: Pick<User, 'id' | 'devAccess'>): Promise<boolean> {
  return user.devAccess || (await db.patientProfile.count({ where: { userId: user.id } })) < MAX_PROFILES
}

export function photoRecords(photos: Array<{ id: string; view: string; meta: unknown }>) {
  return photos.map(photo => ({ id: photo.id, view: photo.view, meta: photo.meta }))
}

/** Validates, re-encodes and stores the photograph of one view, replacing the previous one. */
export async function storeProfilePhoto(userId: string, profileId: string, view: string, raw: Buffer): Promise<void> {
  let photo: Awaited<ReturnType<typeof prepareUpload>>
  try {
    photo = await prepareUpload(raw)
  } catch (error) {
    throw new PlanningError('invalid_image', error instanceof UploadError ? error.message : 'The photo could not be read.')
  }
  const quality = await photoQuality(photo.data)
  const previous = await db.profilePhoto.findUnique({ where: { profileId_view: { profileId, view } } })
  if (previous) {
    await storage().remove(previous.key).catch(() => undefined)
    await db.profilePhoto.delete({ where: { id: previous.id } })
  }
  const created = await db.profilePhoto.create({
    data: { profileId, view, key: '', bytes: photo.data.length, meta: { width: photo.width, height: photo.height, ...quality } },
  })
  const key = `u/${userId}/profiles/${profileId}/${created.id}.jpg`
  await storage().put(key, photo.data, 'image/jpeg')
  await db.profilePhoto.update({ where: { id: created.id }, data: { key } })
}

export async function deleteProfile(id: string, userId: string): Promise<boolean> {
  const found = await ownedProfile(id, userId)
  if (!found) return false
  await Promise.all(found.photos.map(photo => storage().remove(photo.key).catch(() => undefined)))
  await db.patientProfile.delete({ where: { id } })
  return true
}

export async function deleteAllUserProfiles(userId: string): Promise<void> {
  const photos = await db.profilePhoto.findMany({ where: { profile: { userId } }, select: { key: true } })
  await Promise.all(photos.map(photo => storage().remove(photo.key).catch(() => undefined)))
  await db.patientProfile.deleteMany({ where: { userId } })
}
