'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { NAV_LINKS } from '@/lib/site'

export function MobileMenu({ account }: { account: { href: string; label: string } }) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => setIsOpen(false), [pathname])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setIsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen])

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        onClick={() => setIsOpen(open => !open)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15"
      >
        <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
        <span aria-hidden="true" className="relative block h-3 w-5">
          <span className={`absolute left-0 top-0 h-px w-5 bg-white transition ${isOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
          <span className={`absolute bottom-0 left-0 h-px w-5 bg-white transition ${isOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
        </span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto bg-ink"
          >
            <nav aria-label="Mobile" className="wrap flex min-h-full flex-col gap-1 py-8">
              {[...NAV_LINKS, { href: '/contact', label: 'Contact' }].map((link, index) => (
                <motion.div key={link.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index }}>
                  <Link href={link.href} className="flex min-h-[56px] items-center border-b border-line text-2xl font-medium tracking-tight">
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-8 grid gap-3">
                <Link href="/simulator" className="btn-primary w-full">
                  Try AI Simulation
                </Link>
                <Link href={account.href} className="btn-ghost w-full">
                  {account.label}
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
