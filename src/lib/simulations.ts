import 'server-only'

import { db } from './db'
import { env } from './env'
import { createQueue } from './queue'
import { storage } from './storage'

export const generationQueue = createQueue(() => env.ai.maxConcurrency)

export function retentionDate(from = new Date()): Date {
  return new Date(from.getTime() + env.retentionDays * 86_400_000)
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
  await removeFiles([simulation.originalKey, simulation.resultKey])
  await db.simulation.delete({ where: { id } })
  return true
}

export async function deleteAllUserImages(userId: string): Promise<void> {
  const simulations = await db.simulation.findMany({ where: { userId }, select: { originalKey: true, resultKey: true } })
  await removeFiles(simulations.flatMap(simulation => [simulation.originalKey, simulation.resultKey]))
}

/** Removes images past the retention date. The row stays, without files, for statistics. */
export async function purgeExpired(now = new Date()): Promise<number> {
  const expired = await db.simulation.findMany({
    where: { expiresAt: { lte: now }, OR: [{ originalKey: { not: null } }, { resultKey: { not: null } }] },
    take: 500,
  })

  for (const simulation of expired) {
    await removeFiles([simulation.originalKey, simulation.resultKey])
    await db.simulation.update({ where: { id: simulation.id }, data: { originalKey: null, resultKey: null } })
  }

  await db.session.deleteMany({ where: { expiresAt: { lte: now } } })
  await db.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } })
  return expired.length
}
