import Link from 'next/link'

import { getContent } from '@/lib/content'
import { SITE } from '@/lib/site'

import { CookieSettingsButton } from './cookie-consent'
import { Logo } from './logo'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/simulator', label: 'AI Simulator' },
      { href: '/procedures', label: 'Procedures' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About us' },
      { href: '/contact', label: 'Contact' },
      { href: '/login', label: 'Log in' },
      { href: '/register', label: 'Create account' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms & Conditions' },
      { href: '/cookies', label: 'Cookie Policy' },
    ],
  },
]

export async function Footer() {
  const content = await getContent()

  return (
    <footer className="border-t border-line">
      <div className="wrap grid gap-12 py-16 lg:grid-cols-[1.4fr_2fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-5 text-sm leading-relaxed text-ash">{content['disclaimer.short']}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {COLUMNS.map(column => (
            <nav key={column.title} aria-label={column.title}>
              <p className="eyebrow">{column.title}</p>
              <ul className="mt-4">
                {column.links.map(link => (
                  <li key={link.href}>
                    <Link href={link.href} className="flex min-h-[44px] items-center text-sm text-fog transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
                {column.title === 'Legal' && (
                  <li>
                    <CookieSettingsButton />
                  </li>
                )}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="wrap flex flex-col gap-2 py-6 text-xs text-ash sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.legalName}. All rights reserved.
          </p>
          <p>For adults aged 18 and over. Not a medical device.</p>
        </div>
      </div>
    </footer>
  )
}
