import type { Metadata } from 'next'
import Link from 'next/link'

import { changePasswordAction, deleteAccountAction, logoutAction, updateProfileAction } from '@/app/actions/auth'
import { ActionForm, Field } from '@/components/action-form'
import { DeleteSimulationButton, ManageBillingButton } from '@/components/dashboard-client'
import { requireUser } from '@/lib/auth'
import { getPlan } from '@/lib/content'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { formatPrice } from '@/lib/plans'
import { getProcedure } from '@/lib/procedures'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await requireUser('/dashboard')
  const [{ checkout }, plan] = await Promise.all([searchParams, getPlan(user.planSlug)])
  const isPaid = plan.priceMonthlyCents > 0
  const hasHistory = plan.history || user.role === 'ADMIN'

  const simulations = await db.simulation.findMany({
    where: { userId: user.id, status: 'COMPLETED', resultKey: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: hasHistory ? 60 : 1,
  })

  return (
    <div className="wrap space-y-12 py-12 sm:py-16">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="h2 mt-3">{user.name ? `Hello, ${user.name}` : 'Your account'}</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/simulator" className="btn-primary btn-sm min-h-[44px]">
            New simulation
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost btn-sm min-h-[44px]">
              Log out
            </button>
          </form>
        </div>
      </header>

      {checkout === 'success' && (
        <p role="status" className="card p-5 text-sm leading-relaxed">
          {isPaid
            ? `Stripe has confirmed your payment. ${plan.name} is active.`
            : 'You are back from checkout. Your plan activates as soon as Stripe confirms the payment, usually within a minute; reload this page to check. Nothing is activated before that confirmation.'}
        </p>
      )}

      <section aria-label="Plan and credits" className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        <div className="bg-ink p-7">
          <p className="eyebrow">Active plan</p>
          <p className="mt-4 text-4xl font-medium tracking-tight">{plan.name}</p>
          <p className="mt-2 text-sm text-ash">
            {isPaid
              ? `${formatPrice(user.billingInterval === 'YEARLY' ? plan.priceYearlyCents : plan.priceMonthlyCents)} / ${user.billingInterval === 'YEARLY' ? 'year' : 'month'}`
              : 'Free'}
          </p>
        </div>
        <div className="bg-ink p-7">
          <p className="eyebrow">Simulations left</p>
          <p className="mt-4 text-4xl font-medium tracking-tight">{user.credits}</p>
          <p className="mt-2 text-sm text-ash">One credit per simulation. A failed generation returns its credit.</p>
        </div>
        <div className="bg-ink p-7">
          <p className="eyebrow">Subscription</p>
          {user.stripeSubscriptionId ? (
            <>
              <p className="mt-4 text-sm leading-relaxed text-fog">
                {user.cancelAtPeriodEnd ? 'Cancelled. Active until ' : 'Renews on '}
                {user.currentPeriodEnd ? dateFormat.format(user.currentPeriodEnd) : 'the end of the period'}.
                {user.subscriptionStatus === 'past_due' && ' The last payment failed; update your card to keep the plan.'}
              </p>
              <div className="mt-4">
                <ManageBillingButton />
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm leading-relaxed text-fog">No paid subscription.</p>
              <Link href="/pricing" className="btn-ghost btn-sm mt-4 min-h-[44px]">
                See the plans
              </Link>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="history-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="history-title" className="text-2xl font-medium tracking-tight">
            {hasHistory ? 'Simulation history' : 'Latest simulation'}
          </h2>
          <p className="text-sm text-ash">Deleted automatically after {env.retentionDays} days</p>
        </div>
        {simulations.length === 0 ? (
          <div className="card mt-6 p-10 text-center">
            <p className="text-fog">No simulations yet.</p>
            <Link href="/simulator" className="btn-primary mt-5">
              Run your first simulation
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {simulations.map(simulation => (
              <li key={simulation.id} className="card overflow-hidden">
                <Link href={`/dashboard/simulations/${simulation.id}`} className="group block overflow-hidden bg-coal" aria-label={`Open ${getProcedure(simulation.procedure)?.name ?? simulation.procedure} simulation`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/simulations/${simulation.id}/image?type=result`}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/5] w-full object-cover transition duration-500 ease-out group-hover:scale-[1.03]"
                  />
                </Link>
                <div className="flex items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-medium">{getProcedure(simulation.procedure)?.name ?? simulation.procedure}</p>
                    <p className="mt-1 text-sm text-ash">{dateFormat.format(simulation.createdAt)}</p>
                  </div>
                  <DeleteSimulationButton id={simulation.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!hasHistory && (
          <p className="mt-5 text-sm text-ash">
            Starter keeps your latest result.{' '}
            <Link href="/pricing" className="link text-white">
              Pro and Premium keep your full history
            </Link>
            .
          </p>
        )}
      </section>

      <section aria-labelledby="account-title" className="grid gap-5 lg:grid-cols-3">
        <h2 id="account-title" className="sr-only">
          Account settings
        </h2>
        <div className="card p-6">
          <h3 className="h3">Profile</h3>
          <p className="mb-5 mt-1 text-sm text-ash">{user.email}</p>
          <ActionForm action={updateProfileAction} submit="Save profile" submitClassName="btn-ghost w-full">
            <Field name="name" label="Name" autoComplete="name" defaultValue={user.name ?? ''} />
          </ActionForm>
        </div>
        <div className="card p-6">
          <h3 className="h3">Password</h3>
          <p className="mb-5 mt-1 text-sm text-ash">At least 10 characters, with a letter and a number.</p>
          <ActionForm action={changePasswordAction} submit="Change password" submitClassName="btn-ghost w-full">
            <Field name="current" label="Current password" type="password" autoComplete="current-password" />
            <Field name="password" label="New password" type="password" autoComplete="new-password" />
          </ActionForm>
        </div>
        <div className="card p-6">
          <h3 className="h3">Delete account</h3>
          <p className="mb-5 mt-1 text-sm leading-relaxed text-ash">
            Cancels any subscription and permanently removes your account, photos and simulations. This cannot be undone.
          </p>
          <ActionForm action={deleteAccountAction} submit="Delete my account" confirm="Confirm: delete everything" submitClassName="btn-danger w-full">
            <Field name="password" label="Your password" type="password" autoComplete="current-password" />
          </ActionForm>
        </div>
      </section>
    </div>
  )
}
