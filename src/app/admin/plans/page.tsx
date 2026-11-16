import type { Metadata } from 'next'

import { updatePlanAction } from '@/app/actions/admin'
import { ActionForm, CheckField, Field } from '@/components/action-form'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Plans & prices' }

export default async function AdminPlansPage() {
  await requireAdmin()
  const plans = await db.plan.findMany({ orderBy: { sortOrder: 'asc' } })

  return (
    <div className="space-y-6">
      <h1 className="h2">Plans & prices</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-ash">
        Prices are in euro. Credits are per month; a yearly invoice grants twelve months at once. Changes apply to new checkouts; existing subscriptions keep the price they were sold at.
      </p>
      {plans.length === 0 && <p className="card p-6 text-sm">No plans in the database. Run `npm run db:seed`.</p>}
      <div className="grid gap-5 xl:grid-cols-3">
        {plans.map(plan => (
          <div key={plan.slug} className="card p-6">
            <p className="eyebrow mb-5">{plan.slug}</p>
            <ActionForm action={updatePlanAction} submit="Save plan" submitClassName="btn-ghost w-full">
              <input type="hidden" name="slug" value={plan.slug} />
              <PlanField plan={plan.slug} name="name" label="Name" defaultValue={plan.name} />
              <PlanField plan={plan.slug} name="description" label="Description" defaultValue={plan.description} />
              <div className="grid grid-cols-2 gap-3">
                <PlanField plan={plan.slug} name="priceMonthly" label="Monthly €" type="number" step="0.01" defaultValue={(plan.priceMonthlyCents / 100).toFixed(2)} />
                <PlanField plan={plan.slug} name="priceYearly" label="Yearly €" type="number" step="0.01" defaultValue={(plan.priceYearlyCents / 100).toFixed(2)} />
              </div>
              <PlanField plan={plan.slug} name="credits" label="Credits per month" type="number" defaultValue={plan.credits} />
              <PlanField plan={plan.slug} name="features" label="Features, one per line" rows={6} defaultValue={plan.features.join('\n')} />
              <div className="grid grid-cols-2 gap-x-3">
                <CheckField name="allProcedures" defaultChecked={plan.allProcedures}>All procedures</CheckField>
                <CheckField name="highResolution" defaultChecked={plan.highResolution}>High resolution</CheckField>
                <CheckField name="history" defaultChecked={plan.history}>History</CheckField>
                <CheckField name="priority" defaultChecked={plan.priority}>Priority</CheckField>
                <CheckField name="popular" defaultChecked={plan.popular}>Most popular</CheckField>
                <CheckField name="active" defaultChecked={plan.active}>Active</CheckField>
              </div>
            </ActionForm>
          </div>
        ))}
      </div>
    </div>
  )
}

// Three forms share one page, so each field id carries its plan.
function PlanField(props: { plan: string; name: string; label: string; type?: 'text' | 'number'; step?: string; rows?: number; defaultValue: string | number }) {
  const { plan, name, label, ...rest } = props
  return (
    <div>
      <label htmlFor={`${plan}-${name}`} className="label">
        {label}
      </label>
      {rest.rows ? (
        <textarea id={`${plan}-${name}`} name={name} rows={rest.rows} defaultValue={rest.defaultValue} className="field" />
      ) : (
        <input id={`${plan}-${name}`} name={name} type={rest.type ?? 'text'} step={rest.step} min={rest.type === 'number' ? 0 : undefined} defaultValue={rest.defaultValue} className="field" />
      )}
    </div>
  )
}
