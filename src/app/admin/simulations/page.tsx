import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { getProcedure } from '@/lib/procedures'

export const metadata: Metadata = { title: 'Generation errors' }

export default async function AdminSimulationsPage() {
  await requireAdmin()
  const [failures, counts] = await Promise.all([
    db.simulation.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { email: true } } },
    }),
    db.simulation.groupBy({ by: ['errorCode'], where: { status: 'FAILED' }, _count: { _all: true } }),
  ])

  return (
    <div className="space-y-6">
      <h1 className="h2">Generation errors</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-ash">
        The latest 100 failed generations. A failed attempt returns its credit and keeps no photo. Images of users are never shown here.
      </p>
      {counts.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {counts.map(row => (
            <li key={row.errorCode ?? 'unknown'} className="rounded-full border border-line px-3 py-1.5">
              {row.errorCode ?? 'unknown'} <span className="font-mono text-ash">{row._count._all}</span>
            </li>
          ))}
        </ul>
      )}
      {failures.length === 0 ? (
        <p className="card p-8 text-center text-fog">No failed generations.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-admin">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Procedure</th>
                <th>Code</th>
                <th>Provider message</th>
              </tr>
            </thead>
            <tbody>
              {failures.map(failure => (
                <tr key={failure.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{failure.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td>{failure.user.email}</td>
                  <td>{getProcedure(failure.procedure)?.name ?? failure.procedure}</td>
                  <td className="font-mono text-xs text-white">{failure.errorCode}</td>
                  <td className="max-w-md break-words text-xs">{failure.errorMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
