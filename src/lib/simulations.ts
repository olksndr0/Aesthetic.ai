import 'server-only'

import { db } from './db'
import { env } from './env'
import { deleteAllUserCases, purgeExpiredCases } from './planning'
import { deleteAllUserProfiles } from './profiles'
import { createQueue } from './queue'
import { storage } from './storage'

export const generationQueue = createQueue(() => env.ai.maxConcurrency)

export function retentionDate(from = new Date()): Date {
  return new Date(from.getTime() + env.retentionDays * 86_400_000)
}

type ImageKeys = {
  originalKey: string | null
  resultKey: string | null
  profileOriginalKey: string | null
  profileResultKey: string | null
}

const IMAGE_KEY_SELECT = { originalKey: true, resultKey: true, profileOriginalKey: true, profileResultKey: true } as const
const NO_IMAGE_KEYS = { originalKey: null, resultKey: null, profileOriginalKey: null, profileResultKey: null } as const

function imageKeys(simulation: ImageKeys): Array<string | null> {
  return [simulation.originalKey, simulation.resultKey, simulation.profileOriginalKey, simulation.profileResultKey]
}

async function removeFiles(keys: Array<string | null>): Promise<void> {
  await Promise.all(
    keys.filter((key): key is string => Boolean(key)).map(key => storage().remove(key).catch(() => undefined)),
  )
}

/** Deletes one simulation and its images. Scoped to the owner. */
export async function deleteSimulation(id: string, userId: string): Promise<boolean> {
  const simulation = await db.simulation.findFirst({ where: { id, userId } })
  if (!simulation) return false
  await removeFiles(imageKeys(simulation))
  await db.simulation.delete({ where: { id } })
  return true
}

export async function deleteAllUserImages(userId: string): Promise<void> {
  const simulations = await db.simulation.findMany({ where: { userId }, select: IMAGE_KEY_SELECT })
  await removeFiles(simulations.flatMap(imageKeys))
  await deleteAllUserCases(userId)
  await deleteAllUserProfiles(userId)
}

/** Removes images past the retention date. The row stays, without files, for statistics. */
export async function purgeExpired(now = new Date()): Promise<number> {
  const expired = await db.simulation.findMany({
    where: { expiresAt: { lte: now }, OR: Object.keys(IMAGE_KEY_SELECT).map(key => ({ [key]: { not: null } })) },
    take: 500,
  })

  for (const simulation of expired) {
    await removeFiles(imageKeys(simulation))
    await db.simulation.update({ where: { id: simulation.id }, data: NO_IMAGE_KEYS })
  }

  const cases = await purgeExpiredCases(now)

  await db.session.deleteMany({ where: { expiresAt: { lte: now } } })
  await db.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } })
  return expired.length + cases
}
