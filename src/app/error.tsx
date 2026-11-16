'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="wrap flex min-h-[70svh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="h2 mt-4">This page could not be loaded.</h1>
      <p className="lead mt-4 max-w-md">Nothing was charged and no photo was lost. Try again; if it keeps happening, tell us.</p>
      {error.digest && <p className="mt-3 font-mono text-xs text-ash">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/contact" className="btn-ghost">
          Contact support
        </Link>
      </div>
    </section>
  )
}
