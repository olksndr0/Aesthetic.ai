'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ManageBillingButton({ label = 'Manage subscription' }: { label?: string }) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    setIsPending(true)
    setError(null)
    try {
      const response = await fetch('/api/stripe/portal', { method: 'POST' })
      const json = (await response.json().catch(() => null)) as { url?: string; error?: { message: string } } | null
      if (response.ok && json?.url) {
        window.location.assign(json.url)
        return
      }
      setError(json?.error?.message ?? 'The billing portal could not be opened.')
    } catch {
      setError('The connection failed. Try again.')
    }
    setIsPending(false)
  }

  return (
    <div>
      <button type="button" onClick={open} disabled={isPending} className="btn-ghost btn-sm min-h-[44px]">
        {isPending ? 'Opening…' : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

export function DeleteSimulationButton({ id, redirectTo }: { id: string; redirectTo?: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<'idle' | 'armed' | 'working' | 'failed'>('idle')

  async function remove() {
    setStage('working')
    const response = await fetch(`/api/simulations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (response?.ok) {
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    } else {
      setStage('failed')
    }
  }

  if (stage === 'idle' || stage === 'failed') {
    return (
      <button type="button" onClick={() => setStage('armed')} className="btn-ghost btn-sm min-h-[44px]">
        {stage === 'failed' ? 'Delete failed. Try again' : 'Delete'}
      </button>
    )
  }

  return (
    <button type="button" onClick={remove} disabled={stage === 'working'} className="btn-danger btn-sm min-h-[44px]">
      {stage === 'working' ? 'Deleting…' : 'Confirm delete'}
    </button>
  )
}
