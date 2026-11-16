import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { registerAction } from '@/app/actions/auth'
import { ActionForm, CheckField, Field } from '@/components/action-form'
import { AuthShell } from '@/components/auth-shell'
import { getCurrentUser } from '@/lib/auth'
import { safeNext } from '@/lib/validation'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a free Aesthetic AI account and run your first AI simulation.',
  alternates: { canonical: '/register' },
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  if (await getCurrentUser()) redirect(safeNext(next, '/simulator'))

  return (
    <AuthShell
      title="Create your account"
      lead="Free, with one AI simulation included."
      footer={
        <>
          Already registered?{' '}
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link text-white">
            Log in
          </Link>
        </>
      }
    >
      <ActionForm action={registerAction} submit="Create account">
        <input type="hidden" name="next" value={safeNext(next, '/simulator')} />
        <Field name="name" label="Name" autoComplete="name" />
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field name="password" label="Password" type="password" autoComplete="new-password" hint="At least 10 characters, with a letter and a number." />
        <CheckField name="adult">I am 18 or older.</CheckField>
        <CheckField name="terms">
          I accept the{' '}
          <Link href="/terms" className="link text-white">
            Terms & Conditions
          </Link>{' '}
          and have read the{' '}
          <Link href="/privacy" className="link text-white">
            Privacy Policy
          </Link>
          .
        </CheckField>
      </ActionForm>
    </AuthShell>
  )
}
