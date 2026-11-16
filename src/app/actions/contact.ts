'use server'

import { headers } from 'next/headers'

import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { env } from '@/lib/env'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { contactSchema, fieldErrors } from '@/lib/validation'

import type { FormState } from './auth'

export async function contactAction(_: FormState, form: FormData): Promise<FormState> {
  const limit = rateLimit(`contact:${clientIp(await headers())}`, 5, 60 * 60_000)
  if (!limit.ok) return { message: `Too many messages. Try again in ${limit.retryAfterSeconds} seconds.` }

  // Honeypot: a real visitor never fills the hidden field.
  if (String(form.get('website') ?? '') !== '') return { ok: true, message: 'Message received. We reply within two working days.' }

  const parsed = contactSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { errors: fieldErrors(parsed.error) }

  try {
    await db.contactMessage.create({ data: parsed.data })
  } catch (error) {
    console.error('[contact] save failed', error)
    return { message: 'Your message could not be saved. Please try again in a moment.' }
  }

  if (env.email.contactInbox) {
    await sendEmail({
      to: env.email.contactInbox,
      replyTo: parsed.data.email,
      subject: `[Contact] ${parsed.data.subject}`,
      text: `${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}`,
    })
  }

  return { ok: true, message: 'Message received. We reply within two working days.' }
}
