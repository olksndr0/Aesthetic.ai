import type { Metadata } from 'next'
import Link from 'next/link'

import { requireAdmin } from '@/lib/auth'

export const metadata: Metadata = { title: { default: 'Admin', template: '%s | Admin' }, robots: { index: false, follow: false } }

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/plans', label: 'Plans & prices' },
  { href: '/admin/simulations', label: 'Generation errors' },
  { href: '/admin/faq', label: 'FAQ' },
  { href: '/admin/content', label: 'Site content' },
  { href: '/admin/messages', label: 'Messages' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Every admin page also runs behind this check; non-admins get a 404.
  await requireAdmin()

  return (
    <div className="wrap grid gap-8 py-10 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Admin" className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow mb-3">Admin</p>
        <ul className="flex gap-1 overflow-x-auto lg:block">
          {LINKS.map(link => (
            <li key={link.href}>
              <Link href={link.href} className="flex min-h-[44px] items-center whitespace-nowrap rounded-xl px-3 text-sm text-fog transition hover:bg-coal hover:text-white">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
