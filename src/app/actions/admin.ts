'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireAdmin } from '@/lib/auth'
import { CONTENT_DEFAULTS } from '@/lib/content-defaults'
import { db } from '@/lib/db'
import { deleteAllUserImages } from '@/lib/simulations'
import { getStripe } from '@/lib/stripe'

import type { FormState } from './auth'

// Every action re-checks the role on the server; hiding the pages is not the protection.

const planSchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(160),
  priceMonthly: z.coerce.number().min(0).max(10_000),
  priceYearly: z.coerce.number().min(0).max(100_000),
  credits: z.coerce.number().int().min(0).max(100_000),
  features: z.string().max(2000),
})

export async function updatePlanAction(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const parsed = planSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { message: 'Check the values: prices and credits must be zero or positive numbers.' }

  const { slug, priceMonthly, priceYearly, features, ...rest } = parsed.data
  await db.plan.update({
    where: { slug },
    data: {
      ...rest,
      priceMonthlyCents: Math.round(priceMonthly * 100),
      priceYearlyCents: Math.round(priceYearly * 100),
      features: features.split('\n').map(line => line.trim()).filter(Boolean),
      popular: form.get('popular') === 'on',
      active: form.get('active') === 'on',
      allProcedures: form.get('allProcedures') === 'on',
      highResolution: form.get('highResolution') === 'on',
      history: form.get('history') === 'on',
      priority: form.get('priority') === 'on',
    },
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Plan saved. New checkouts use these values; existing subscriptions keep their price.' }
}

const userSchema = z.object({
  id: z.string().min(1),
  credits: z.coerce.number().int().min(0).max(1_000_000),
  role: z.enum(['USER', 'ADMIN']),
})

export async function updateUserAction(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const parsed = userSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { message: 'Credits must be a whole number of zero or more.' }
  if (parsed.data.id === admin.id && parsed.data.role !== 'ADMIN') {
    return { message: 'You cannot remove your own admin role.' }
  }

  await db.user.update({ where: { id: parsed.data.id }, data: { credits: parsed.data.credits, role: parsed.data.role } })
  revalidatePath('/admin/users')
  return { ok: true, message: 'User saved.' }
}

export async function deleteUserAction(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const id = String(form.get('id') ?? '')
  if (id === admin.id) return { message: 'You cannot delete your own account here.' }

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return { message: 'User not found.' }

  if (user.stripeSubscriptionId) {
    const stripe = getStripe()
    if (!stripe) return { message: 'This user has a subscription and Stripe is not configured, so nothing was deleted.' }
    try {
      await stripe.subscriptions.cancel(user.stripeSubscriptionId)
    } catch {
      return { message: 'The subscription could not be cancelled, so nothing was deleted.' }
    }
  }

  await deleteAllUserImages(id)
  await db.user.delete({ where: { id } })
  revalidatePath('/admin/users')
  return { ok: true, message: `Deleted ${user.email} and all their images.` }
}

const faqSchema = z.object({
  id: z.string().optional(),
  question: z.string().trim().min(5).max(200),
  answer: z.string().trim().min(10).max(3000),
  sortOrder: z.coerce.number().int().min(0).max(1000),
})

export async function saveFaqAction(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const parsed = faqSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { message: 'A question needs 5+ characters and an answer 10+ characters.' }

  const { id, ...data } = parsed.data
  const published = form.get('published') === 'on'
  if (id) {
    await db.faq.update({ where: { id }, data: { ...data, published } })
  } else {
    await db.faq.create({ data: { ...data, published } })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: id ? 'Question saved.' : 'Question added.' }
}

export async function deleteFaqAction(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  await db.faq.deleteMany({ where: { id: String(form.get('id') ?? '') } })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Question deleted.' }
}

export async function saveContentAction(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()

  for (const key of Object.keys(CONTENT_DEFAULTS)) {
    const value = String(form.get(key) ?? '').trim().slice(0, 2000)
    if (value === '' || value === CONTENT_DEFAULTS[key as keyof typeof CONTENT_DEFAULTS]) {
      await db.siteContent.deleteMany({ where: { key } })
    } else {
      await db.siteContent.upsert({ where: { key }, update: { value }, create: { key, value } })
    }
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Content saved.' }
}
