import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { devAccessAction, loginAction } from '@/app/actions/auth'
import { ActionForm, Field } from '@/components/action-form'
import { AuthShell } from '@/components/auth-shell'
import { getCurrentUser } from '@/lib/auth'
import { devAccessEnabled } from '@/lib/dev-access'
import { safeNext } from '@/lib/validation'

export const metadata: Metadata = { title: 'Log in', robots: { index: false }, alternates: { canonical: '/login' } }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  if (await getCurrentUser()) redirect(safeNext(next))

  return (
    <AuthShell
      title="Log in"
      lead="Open your simulations and your plan."
      footer={
        <>
          New here?{' '}
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link text-white">
            Create a free account
          </Link>
        </>
      }
    >
      <ActionForm action={loginAction} submit="Log in">
        <input type="hidden" name="next" value={safeNext(next)} />
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field name="password" label="Password" type="password" autoComplete="current-password" />
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="link">
            Forgot your password?
          </Link>
        </p>
      </ActionForm>
      {devAccessEnabled() && (
        <form action={devAccessAction} className="mt-6 border-t border-line pt-6">
          <button type="submit" className="btn-ghost w-full">
            Dev access
          </button>
          <p className="mt-3 text-center text-xs leading-relaxed text-ash">Development only: enters a sample account with example profiles, no email or password. To be removed before launch.</p>
        </form>
      )}
    </AuthShell>
  )
}
