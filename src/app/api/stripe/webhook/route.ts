import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { jsonError } from '@/lib/http'
import { DEFAULT_PLANS, creditsForInterval } from '@/lib/plans'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

// The only place a plan or paid credits are ever granted. The browser's
// return from Checkout grants nothing: Stripe's signed event does.
export async function POST(request: Request) {
  const stripe = getStripe()
  if (!stripe || !env.stripe.webhookSecret) return jsonError(503, 'not_configured', 'Stripe is not configured.')

  const signature = request.headers.get('stripe-signature')
  if (!signature) return jsonError(400, 'bad_signature', 'Missing signature.')

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, env.stripe.webhookSecret)
  } catch {
    return jsonError(400, 'bad_signature', 'Signature verification failed.')
  }

  // Stripe retries deliveries; each event is applied once.
  try {
    await db.stripeEvent.create({ data: { id: event.id, type: event.type } })
  } catch {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object)
        break
      case 'invoice.paid':
        await onInvoicePaid(stripe, event.data.object)
        break
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(event.data.object)
        break
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event.data.object)
        break
      default:
        break
    }
  } catch (error) {
    console.error('[stripe] webhook handler failed', event.type, error)
    // Forget the event so Stripe's retry is processed.
    await db.stripeEvent.delete({ where: { id: event.id } }).catch(() => undefined)
    return jsonError(500, 'handler_failed', 'Handler failed; retry.')
  }

  return NextResponse.json({ received: true })
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

// Field locations moved between Stripe API versions; read both shapes.
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const loose = invoice as unknown as {
    subscription?: string | { id: string } | null
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
  }
  return idOf(loose.subscription) ?? idOf(loose.parent?.subscription_details?.subscription)
}

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const loose = subscription as unknown as {
    current_period_end?: number
    items?: { data?: Array<{ current_period_end?: number }> }
  }
  const seconds = loose.current_period_end ?? loose.items?.data?.[0]?.current_period_end
  return seconds ? new Date(seconds * 1000) : null
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId ?? session.client_reference_id
  const customerId = idOf(session.customer)
  if (!userId || !customerId) return
  await db.user.updateMany({ where: { id: userId }, data: { stripeCustomerId: customerId } })
}

async function onInvoicePaid(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const { userId, planSlug, interval } = subscription.metadata
  if (!userId || !planSlug) return

  const plan = (await db.plan.findUnique({ where: { slug: planSlug } })) ?? DEFAULT_PLANS.find(entry => entry.slug === planSlug)
  if (!plan) return

  const billingInterval = interval === 'YEARLY' ? 'YEARLY' : 'MONTHLY'
  await db.user.updateMany({
    where: { id: userId },
    data: {
      planSlug: plan.slug,
      billingInterval,
      credits: creditsForInterval(plan.credits, billingInterval),
      stripeCustomerId: idOf(subscription.customer) ?? undefined,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  })
}

async function onSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  if (['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)) {
    await onSubscriptionDeleted(subscription)
    return
  }
  await db.user.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      subscriptionStatus: subscription.status,
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  })
}

async function onSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  await db.user.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      planSlug: 'starter',
      billingInterval: null,
      credits: 0,
      stripeSubscriptionId: null,
      subscriptionStatus: 'canceled',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  })
}
