import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { jsonError, sameOrigin } from '@/lib/http'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, 'forbidden', 'Cross-site request refused.')

  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Sign in first.')

  const stripe = getStripe()
  if (!stripe) return jsonError(503, 'not_configured', 'Payments are not configured on this server yet.')
  if (!user.stripeCustomerId) return jsonError(400, 'no_customer', 'You have no paid plan to manage yet.')

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${env.appUrl}/dashboard`,
    })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[stripe] portal failed', error)
    return jsonError(502, 'stripe_error', 'The billing portal could not be opened.')
  }
}
