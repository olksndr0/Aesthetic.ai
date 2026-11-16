import type { Metadata } from 'next'

import { deleteFaqAction, saveFaqAction } from '@/app/actions/admin'
import { ActionForm, CheckField } from '@/components/action-form'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'FAQ' }

function FaqFields({ id, question = '', answer = '', sortOrder = 0, published = true }: { id: string; question?: string; answer?: string; sortOrder?: number; published?: boolean }) {
  return (
    <>
      <div>
        <label htmlFor={`q-${id}`} className="label">
          Question
        </label>
        <input id={`q-${id}`} name="question" defaultValue={question} className="field" />
      </div>
      <div>
        <label htmlFor={`a-${id}`} className="label">
          Answer
        </label>
        <textarea id={`a-${id}`} name="answer" rows={4} defaultValue={answer} className="field" />
      </div>
      <div className="flex flex-wrap items-end gap-5">
        <div>
          <label htmlFor={`o-${id}`} className="label">
            Order
          </label>
          <input id={`o-${id}`} name="sortOrder" type="number" min={0} defaultValue={sortOrder} className="field w-24" />
        </div>
        <CheckField name="published" defaultChecked={published}>
          Published
        </CheckField>
      </div>
    </>
  )
}

export default async function AdminFaqPage() {
  await requireAdmin()
  const faqs = await db.faq.findMany({ orderBy: { sortOrder: 'asc' } })

  return (
    <div className="space-y-6">
      <h1 className="h2">FAQ</h1>
      <div className="card p-6">
        <h2 className="h3 mb-5">Add a question</h2>
        <ActionForm action={saveFaqAction} submit="Add question" submitClassName="btn-primary">
          <FaqFields id="new" sortOrder={faqs.length} />
        </ActionForm>
      </div>
      {faqs.map(faq => (
        <div key={faq.id} className="card p-6">
          <ActionForm action={saveFaqAction} submit="Save question" submitClassName="btn-ghost">
            <input type="hidden" name="id" value={faq.id} />
            <FaqFields id={faq.id} question={faq.question} answer={faq.answer} sortOrder={faq.sortOrder} published={faq.published} />
          </ActionForm>
          <div className="mt-3">
            <ActionForm action={deleteFaqAction} submit="Delete question" confirm="Confirm delete" className="" submitClassName="btn-danger btn-sm min-h-[44px]">
              <input type="hidden" name="id" value={faq.id} />
            </ActionForm>
          </div>
        </div>
      ))}
    </div>
  )
}
