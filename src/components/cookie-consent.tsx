'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const KEY = 'aai_cookie_choice'
const OPEN_EVENT = 'aai:cookie-settings'

type Choice = 'essential' | 'all'

function readChoice(): Choice | null {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'essential' || value === 'all' ? value : null
  } catch {
    return null
  }
}

/**
 * The site sets one essential cookie (the session). The choice made here is
 * stored so that optional cookies, if any are ever added, stay off until "all"
 * has been chosen.
 */
export function CookieConsent() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (readChoice() === null) setIsOpen(true)
    const open = () => setIsOpen(true)
    window.addEventListener(OPEN_EVENT, open)
    return () => window.removeEventListener(OPEN_EVENT, open)
  }, [])

  function choose(choice: Choice) {
    try {
      window.localStorage.setItem(KEY, choice)
    } catch {
      // Storage blocked: the banner returns on the next visit.
    }
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div role="dialog" aria-label="Cookie preferences" className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-5">
      <div className="glass mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-fog">
          We use one essential cookie to keep you signed in. Optional cookies stay off unless you accept them.{' '}
          <Link href="/cookies" className="link text-white">
            Cookie Policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose('essential')} className="btn-ghost btn-sm min-h-[44px]">
            Essential only
          </button>
          <button type="button" onClick={() => choose('all')} className="btn-primary btn-sm min-h-[44px]">
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="flex min-h-[44px] items-center text-sm text-fog transition hover:text-white"
    >
      Cookie settings
    </button>
  )
}
