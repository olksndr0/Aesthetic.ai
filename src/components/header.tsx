import Link from 'next/link'

import { getCurrentUser } from '@/lib/auth'
import { NAV_LINKS } from '@/lib/site'

import { Logo } from './logo'
import { MobileMenu } from './mobile-menu'

export async function Header() {
  const user = await getCurrentUser()
  const account = user
    ? { href: user.role === 'ADMIN' ? '/admin' : '/dashboard', label: user.role === 'ADMIN' ? 'Admin' : 'Dashboard' }
    : { href: '/login', label: 'Log in' }

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="wrap flex h-16 items-center justify-between gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-5 lg:flex xl:gap-7">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className="text-sm text-fog transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          {user?.role === 'ADMIN' && (
            <Link href="/dashboard" className="text-sm text-fog transition hover:text-white">
              Dashboard
            </Link>
          )}
          <Link href={account.href} className="btn-ghost btn-sm">
            {account.label}
          </Link>
          <Link href="/simulator" className="btn-primary btn-sm">
            Try AI Simulation
          </Link>
        </div>
        <MobileMenu account={account} />
      </div>
    </header>
  )
}
