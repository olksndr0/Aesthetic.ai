'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  hashToken,
  newToken,
  verifyPassword,
} from '@/lib/auth'
import { db } from '@/lib/db'
import { devAccessEnabled, ensureDevUser } from '@/lib/dev-access'
import { sendEmail } from '@/lib/email'
import { env } from '@/lib/env'
import { DEFAULT_PLANS } from '@/lib/plans'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { deleteAllUserImages } from '@/lib/simulations'
import { getStripe } from '@/lib/stripe'
import { emailSchema, fieldErrors, loginSchema, passwordSchema, registerSchema, safeNext, type FieldErrors } from '@/lib/validation'

export type FormState = { ok?: boolean; message?: string; errors?: FieldErrors }

async function limited(bucket: string, limit: number, windowMs: number): Promise<string | null> {
  const result = rateLimit(`${bucket}:${clientIp(await headers())}`, limit, windowMs)
  return result.ok ? null : `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await limited('register', 8, 60 * 60_000)
  if (blocked) return { message: blocked }

  const parsed = registerSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { errors: fieldErrors(parsed.error) }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return { errors: { email: 'An account with this email already exists. Sign in instead.' } }

  const starter = (await db.plan.findUnique({ where: { slug: 'starter' } })) ?? DEFAULT_PLANS[0]
  const user = await db.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      credits: starter?.credits ?? 1,
    },
  })

  await createSession(user.id)
  redirect(safeNext(form.get('next'), '/simulator'))
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await limited('login', 10, 15 * 60_000)
  if (blocked) return { message: blocked }

  const parsed = loginSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { errors: fieldErrors(parsed.error) }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } })
  // Compare against a dummy hash when the user is unknown, so timing does not reveal which emails exist.
  const hash = user?.passwordHash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5KQ5c8m0G8pU1y1VwYcVqK0bq5oM5uC'
  const valid = await verifyPassword(parsed.data.password, hash)
  if (!user || !valid) return { message: 'The email or password is incorrect.' }

  await createSession(user.id)
  redirect(safeNext(form.get('next')))
}

/** Development shortcut: enters the sample account without credentials. Refused when the shortcut is off. */
export async function devAccessAction(): Promise<void> {
  if (!devAccessEnabled()) redirect('/login')
  const user = await ensureDevUser()
  await createSession(user.id)
  redirect('/profiles')
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect('/')
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await limited('forgot', 5, 60 * 60_000)
  if (blocked) return { message: blocked }

  const parsed = emailSchema.safeParse(form.get('email'))
  if (!parsed.success) return { errors: { email: 'Enter a valid email address.' } }

  const user = await db.user.findUnique({ where: { email: parsed.data } })
  if (user) {
    const token = newToken()
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
    })
    await sendEmail({
      to: user.email,
      subject: 'Reset your Aesthetic AI password',
      text: `Open this link within one hour to choose a new password:\n\n${env.appUrl}/reset-password?token=${token}\n\nIf you did not ask for it, ignore this email.`,
    })
  }

  // Same answer whether or not the account exists.
  return { ok: true, message: 'If an account uses that email, a reset link is on its way. The link works for one hour.' }
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await limited('reset', 10, 60 * 60_000)
  if (blocked) return { message: blocked }

  const password = passwordSchema.safeParse(form.get('password'))
  if (!password.success) return { errors: { password: password.error.issues[0]?.message ?? 'Choose a stronger password.' } }

  const token = String(form.get('token') ?? '')
  const record = token ? await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } }) : null
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { message: 'This reset link is invalid or has expired. Request a new one.' }
  }

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password.data) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Every device is signed out after a password change.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ])

  await createSession(record.userId)
  redirect('/dashboard')
}

export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { message: 'Sign in first.' }

  const name = String(form.get('name') ?? '').trim()
  if (name.length < 1 || name.length > 80) return { errors: { name: 'Enter a name of 1 to 80 characters.' } }

  await db.user.update({ where: { id: user.id }, data: { name } })
  return { ok: true, message: 'Profile saved.' }
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { message: 'Sign in first.' }

  if (!(await verifyPassword(String(form.get('current') ?? ''), user.passwordHash))) {
    return { errors: { current: 'The current password is incorrect.' } }
  }
  const password = passwordSchema.safeParse(form.get('password'))
  if (!password.success) return { errors: { password: password.error.issues[0]?.message ?? 'Choose a stronger password.' } }

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password.data) } })
  return { ok: true, message: 'Password changed.' }
}

export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { message: 'Sign in first.' }

  if (!(await verifyPassword(String(form.get('password') ?? ''), user.passwordHash))) {
    return { errors: { password: 'The password is incorrect.' } }
  }

  // Stop billing first: an account must never be deleted while still being charged.
  if (user.stripeSubscriptionId) {
    const stripe = getStripe()
    if (!stripe) return { message: 'Your subscription could not be cancelled because payments are not configured. Contact support.' }
    try {
      await stripe.subscriptions.cancel(user.stripeSubscriptionId)
    } catch (error) {
      console.error('[account] subscription cancel failed', error)
      return { message: 'Your subscription could not be cancelled, so the account was not deleted. Try again or contact support.' }
    }
  }

  await deleteAllUserImages(user.id)
  await db.user.delete({ where: { id: user.id } })
  await destroySession()
  redirect('/?deleted=1')
}
