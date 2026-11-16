import type { Metadata } from 'next'
import Link from 'next/link'

import { deleteUserAction, updateUserAction } from '@/app/actions/admin'
import { ActionForm } from '@/components/action-form'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Users' }

const PAGE_SIZE = 25

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin()
  const { q = '', page = '1' } = await searchParams
  const current = Math.max(1, Number.parseInt(page, 10) || 1)
  const where = q ? { OR: [{ email: { contains: q, mode: 'insensitive' as const } }, { name: { contains: q, mode: 'insensitive' as const } }] } : {}

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (current - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { simulations: true } } },
    }),
    db.user.count({ where }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="h2">Users</h1>
        <form className="flex gap-2">
          <label className="sr-only" htmlFor="q">
            Search users
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Search email or name" className="field w-64" />
          <button type="submit" className="btn-ghost btn-sm min-h-[46px]">
            Search
          </button>
        </form>
      </div>
      <p className="text-sm text-ash">
        {total} user{total === 1 ? '' : 's'}. Edit credits or role and save the row.
      </p>

      <ul className="space-y-3">
        {users.map(user => (
          <li key={user.id} className="card p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{user.email}</p>
                <p className="mt-1 text-sm text-ash">
                  {user.name ?? 'No name'} · {user.planSlug}
                  {user.subscriptionStatus ? ` (${user.subscriptionStatus})` : ''} · {user._count.simulations} simulations · joined {user.createdAt.toISOString().slice(0, 10)}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <ActionForm action={updateUserAction} submit="Save" className="flex flex-wrap items-center gap-2" submitClassName="btn-ghost btn-sm min-h-[44px]">
                  <input type="hidden" name="id" value={user.id} />
                  <label className="sr-only" htmlFor={`credits-${user.id}`}>
                    Credits for {user.email}
                  </label>
                  <input id={`credits-${user.id}`} name="credits" type="number" min={0} defaultValue={user.credits} className="field w-24" />
                  <label className="sr-only" htmlFor={`role-${user.id}`}>
                    Role for {user.email}
                  </label>
                  <select id={`role-${user.id}`} name="role" defaultValue={user.role} className="field w-28">
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </ActionForm>
                <ActionForm action={deleteUserAction} submit="Delete" confirm="Confirm delete" className="flex flex-wrap items-center gap-2" submitClassName="btn-danger btn-sm min-h-[44px]">
                  <input type="hidden" name="id" value={user.id} />
                </ActionForm>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={`/admin/users?q=${encodeURIComponent(q)}&page=${current - 1}`} className="btn-ghost btn-sm min-h-[44px]">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ash">
            Page {current} of {pages}
          </span>
          {current < pages ? (
            <Link href={`/admin/users?q=${encodeURIComponent(q)}&page=${current + 1}`} className="btn-ghost btn-sm min-h-[44px]">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
