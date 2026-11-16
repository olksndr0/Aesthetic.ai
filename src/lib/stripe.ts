import 'server-only'

import Stripe from 'stripe'

import { env } from './env'

let client: Stripe | undefined

/** Null until STRIPE_SECRET_KEY is set; callers answer 503 with setup steps. */
export function getStripe(): Stripe | null {
  if (!env.stripe.secretKey) return null
  client ??= new Stripe(env.stripe.secretKey)
  return client
}
