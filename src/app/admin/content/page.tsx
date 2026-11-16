import type { Metadata } from 'next'

import { saveContentAction } from '@/app/actions/admin'
import { ActionForm, Field } from '@/components/action-form'
import { requireAdmin } from '@/lib/auth'
import { getContent } from '@/lib/content'
import { CONTENT_LABELS, type ContentKey } from '@/lib/content-defaults'

export const metadata: Metadata = { title: 'Site content' }

export default async function AdminContentPage() {
  await requireAdmin()
  const content = await getContent()

  return (
    <div className="space-y-6">
      <h1 className="h2">Site content</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-ash">The main headings and paragraphs of the public pages. Clear a field and save to restore its default text.</p>
      <div className="card p-6">
        <ActionForm action={saveContentAction} submit="Save content" submitClassName="btn-primary">
          {(Object.keys(CONTENT_LABELS) as ContentKey[]).map(key => (
            <Field key={key} name={key} label={CONTENT_LABELS[key]} defaultValue={content[key]} rows={content[key].length > 70 ? 3 : undefined} />
          ))}
        </ActionForm>
      </div>
    </div>
  )
}
