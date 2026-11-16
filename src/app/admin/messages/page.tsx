import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Messages' }

export default async function AdminMessagesPage() {
  await requireAdmin()
  const messages = await db.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })

  return (
    <div className="space-y-6">
      <h1 className="h2">Messages</h1>
      {messages.length === 0 ? (
        <p className="card p-8 text-center text-fog">No messages from the contact form yet.</p>
      ) : (
        <ul className="space-y-3">
          {messages.map(message => (
            <li key={message.id} className="card p-6">
              <div className="flex flex-col justify-between gap-1 sm:flex-row">
                <p className="font-medium">{message.subject}</p>
                <p className="font-mono text-xs text-ash">{message.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</p>
              </div>
              <p className="mt-1 text-sm text-ash">
                {message.name} · {message.email}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-fog">{message.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
