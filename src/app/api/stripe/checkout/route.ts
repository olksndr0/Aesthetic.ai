import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUser } from '@/lib/auth'
import { getPlans } from '@/lib/content'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { jsonError, sameOrigin } from '@/lib/http'
import { rateLimit } from '@/lib/rate-limit'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

const bodySchema = z.object({ plan: z.string().min(1).max(40), interval: z.enum(['MONTHLY', 'YEARLY']) })

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, 'forbidden', 'Cross-site request refused.')

  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Sign in to choose a plan.')

  const limit = rateLimit(`checkout:${user.id}`, 10, 10 * 60_000)
  if (!limit.ok) return jsonError(429, 'rate_limited', 'Too many attempts. Try again in a few minutes.')

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return jsonError(400, 'invalid', 'Unknown plan.')

  const plan = (await getPlans()).find(candidate => candidate.slug === body.data.plan)
  const amount = body.data.interval === 'YEARLY' ? plan?.priceYearlyCents : plan?.priceMonthlyCents
  if (!plan || !amount || amount <= 0) return jsonError(400, 'invalid', 'This plan cannot be purchased.')

  const stripe = getStripe()
  if (!stripe) {
    return jsonError(503, 'not_configured', 'Payments are not configured on this server yet. Nothing was charged.', {
      setup: 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the server environment (see README, "Stripe").',
    })
  }

  if (user.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(user.subscriptionStatus ?? '')) {
    return jsonError(409, 'already_subscribed', 'You already have a subscription. Change or cancel it from your dashboard.')
  }

  try {
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } })
      customerId = customer.id
      await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } })
    }

    const metadata = { userId: user.id, planSlug: plan.slug, interval: body.data.interval }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: amount,
            recurring: { interval: body.data.interval === 'YEARLY' ? 'year' : 'month' },
            product_data: { name: `Aesthetic AI ${plan.name}`, metadata: { planSlug: plan.slug } },
          },
        },
      ],
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: true,
      success_url: `${env.appUrl}/dashboard?checkout=success`,
      cancel_url: `${env.appUrl}/pricing?checkout=cancelled`,
    })

    if (!session.url) return jsonError(502, 'stripe_error', 'Stripe did not return a checkout page.')
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[stripe] checkout failed', error)
    return jsonError(502, 'stripe_error', 'The checkout could not be started. Nothing was charged.')
  }
}
