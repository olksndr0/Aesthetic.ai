import 'server-only'

import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { User } from '@prisma/client'

import { landmarkDefinition } from './anatomy/landmarks'
import { IDENTITY } from './anatomy/math'
import mannequinLandmarks from './anatomy/mannequin.json'
import { VIEW_IDS } from './anatomy/views'
import { hashPassword } from './auth'
import { db } from './db'
import { assetKey, inspectMesh } from './planning'
import { EXAMPLE_PROFILES } from './profile/examples'
import { storeProfilePhoto } from './profiles'
import { storage } from './storage'

export const DEV_EMAIL = 'dev@aesthetic-ai.local'

/**
 * Development shortcut: sign in without credentials, with sample data.
 * On while developing; in a production build only when DEV_ACCESS="true".
 * Remove before launch.
 */
export function devAccessEnabled(): boolean {
  const flag = process.env.DEV_ACCESS
  return flag === 'true' || (process.env.NODE_ENV !== 'production' && flag !== 'false')
}

const asset = (...parts: string[]) => path.join(process.cwd(), 'assets', ...parts)

/** The development account, created on first use, with unlimited profiles and plenty of credits. */
export async function ensureDevUser(): Promise<User> {
  const existing = await db.user.findUnique({ where: { email: DEV_EMAIL } })
  const user =
    existing ??
    (await db.user.create({
      // The password is random and never shown: this account is entered through the shortcut only.
      data: { email: DEV_EMAIL, name: 'Developer', devAccess: true, credits: 999, planSlug: 'premium', passwordHash: await hashPassword(randomBytes(24).toString('base64url')) },
    }))
  if (!user.devAccess || user.credits < 50) await db.user.update({ where: { id: user.id }, data: { devAccess: true, credits: 999, planSlug: 'premium' } })
  await ensureExamples(user.id)
  return user
}

/** Sample records and a sample planning case, so every screen has something to show. Created once. */
async function ensureExamples(userId: string): Promise<void> {
  if ((await db.patientProfile.count({ where: { userId, example: true } })) > 0) return

  const profiles = []
  for (const [index, example] of EXAMPLE_PROFILES.entries()) {
    const profile = await db.patientProfile.create({ data: { userId, label: example.label, data: example.data, example: true, consentAt: new Date() } })
    profiles.push(profile)
    // The first record has every view; the second only the three a photographic render needs.
    const views = index === 0 ? VIEW_IDS : ['front', 'profile-left', 'profile-right']
    for (const view of views) {
      const file = await readFile(asset('dev-example', `${view}.jpg`)).catch(() => null)
      if (file) await storeProfilePhoto(userId, profile.id, view, file)
    }
  }

  const mesh = await readFile(asset('models', 'skull-mannequin.amsh')).catch(() => null)
  if (!mesh) return
  const landmarks = Object.entries(mannequinLandmarks as Record<string, number[]>).map(([code, position], index) => {
    const known = landmarkDefinition(code)
    return {
      id: `mannequin-${index}`,
      code,
      name: known?.name ?? code,
      layer: 'skull',
      side: known?.side ?? null,
      position,
      provenance: 'estimated',
      source: 'Defined on the generic mannequin, not measured on a person',
      unit: 'mm',
    }
  })
  const created = await db.planningCase.create({
    data: { userId, profileId: profiles[0]?.id, title: 'Example · skull mannequin', consentAt: new Date(), landmarks },
  })
  const meta = {
    fileName: 'skull-mannequin.amsh',
    format: 'stl',
    sourceHash: 'mannequin',
    unit: 'mm',
    origin: 'Generic skull mannequin built from a mathematical model (scripts/build-skull.mts). It is not a scan of any person.',
    resampledMm: 1.25,
    steps: [{ kind: 'import', note: 'Generated directly in the anatomical frame, in millimetres.', rmsMm: null, at: new Date().toISOString() }],
    measured: inspectMesh(new Uint8Array(mesh), 'skull', IDENTITY),
  }
  const stored = await db.caseAsset.create({
    data: { caseId: created.id, kind: 'skull', provenance: 'estimated', label: 'Skull mannequin (generic)', key: '', bytes: mesh.length, transform: IDENTITY, meta },
  })
  const key = assetKey(userId, created.id, stored.id, 'amsh')
  await storage().put(key, mesh, 'application/octet-stream')
  await db.caseAsset.update({ where: { id: stored.id }, data: { key } })
}
