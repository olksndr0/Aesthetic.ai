import { aiConfigured } from '@/lib/ai'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { getProcedure } from '@/lib/procedures'

export default async function AdminOverviewPage() {
  await requireAdmin()
  const monthAgo = new Date(Date.now() - 30 * 86_400_000)

  const [users, newUsers, subscriptions, completed, failed, recent, byProcedure, byPlan, average] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: monthAgo } } }),
    db.user.count({ where: { subscriptionStatus: { in: ['active', 'trialing'] } } }),
    db.simulation.count({ where: { status: 'COMPLETED' } }),
    db.simulation.count({ where: { status: 'FAILED' } }),
    db.simulation.count({ where: { createdAt: { gte: monthAgo } } }),
    db.simulation.groupBy({ by: ['procedure'], _count: { _all: true }, orderBy: { _count: { procedure: 'desc' } }, take: 12 }),
    db.user.groupBy({ by: ['planSlug'], _count: { _all: true } }),
    db.simulation.aggregate({ where: { status: 'COMPLETED' }, _avg: { durationMs: true } }),
  ])

  const total = completed + failed
  const stats: Array<[string, string, string]> = [
    ['Registered users', String(users), `${newUsers} in the last 30 days`],
    ['Active subscriptions', String(subscriptions), byPlan.map(row => `${row.planSlug} ${row._count._all}`).join(' · ') || 'No users yet'],
    ['Simulations', String(total), `${recent} in the last 30 days`],
    ['Success rate', total ? `${Math.round((completed / total) * 100)}%` : 'n/a', `${failed} failed`],
    ['Average generation', average._avg.durationMs ? `${(average._avg.durationMs / 1000).toFixed(1)} s` : 'n/a', 'Completed simulations'],
  ]
  const services: Array<[string, boolean, string]> = [
    ['AI provider', aiConfigured(), env.ai.provider ?? 'Set OPENAI_API_KEY, REPLICATE_API_TOKEN or GEMINI_API_KEY'],
    ['Stripe payments', Boolean(env.stripe.secretKey && env.stripe.webhookSecret), 'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET'],
    ['Transactional email', Boolean(env.email.resendKey), 'RESEND_API_KEY'],
    ['Scheduled cleanup', Boolean(env.cronSecret), 'CRON_SECRET'],
  ]
  const top = Math.max(1, ...byProcedure.map(row => row._count._all))

  return (
    <div className="space-y-10">
      <h1 className="h2">Overview</h1>

      <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value, note]) => (
          <div key={label} className="bg-ink p-6">
            <dt className="eyebrow">{label}</dt>
            <dd className="mt-3 text-4xl font-medium tracking-tight">{value}</dd>
            <dd className="mt-2 text-xs text-ash">{note}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="services-title" className="card p-6">
        <h2 id="services-title" className="h3">
          Service configuration
        </h2>
        <ul className="mt-4 divide-y divide-white/10 text-sm">
          {services.map(([name, isReady, detail]) => (
            <li key={name} className="flex items-center justify-between gap-4 py-3">
              <span>{name}</span>
              <span className={isReady ? 'text-white' : 'text-ash'}>{isReady ? `Configured${name === 'AI provider' ? ` (${detail})` : ''}` : `Not configured: ${detail}`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="by-procedure-title" className="card p-6">
        <h2 id="by-procedure-title" className="h3">
          Simulations by procedure
        </h2>
        {byProcedure.length === 0 ? (
          <p className="mt-4 text-sm text-ash">No simulations yet.</p>
        ) : (
          <ul className="mt-5 space-y-3 text-sm">
            {byProcedure.map(row => (
              <li key={row.procedure} className="grid grid-cols-[160px_1fr_40px] items-center gap-4">
                <span className="truncate text-fog">{getProcedure(row.procedure)?.name ?? row.procedure}</span>
                <span className="h-1.5 rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-white" style={{ width: `${(row._count._all / top) * 100}%` }} />
                </span>
                <span className="text-right font-mono">{row._count._all}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
