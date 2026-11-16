import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import type { User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'

import { db } from './db'

const COOKIE = 'aai_session'
const SESSION_DAYS = 30

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)

  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } })

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value

  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  jar.delete(COOKIE)
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null

  try {
    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })
    if (!session || session.expiresAt < new Date()) return null
    return session.user
  } catch {
    // Database unreachable: treat as signed out so public pages still render.
    return null
  }
})

export async function requireUser(next = '/dashboard'): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`)
  return user
}

// Admin routes answer 404 to everyone else, so their existence is not advertised.
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') notFound()
  return user
}
