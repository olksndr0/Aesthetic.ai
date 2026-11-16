import type { Metadata } from 'next'
import Link from 'next/link'

import { resetPasswordAction } from '@/app/actions/auth'
import { ActionForm, Field } from '@/components/action-form'
import { AuthShell } from '@/components/auth-shell'

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams

  return (
    <AuthShell title="Choose a new password" lead="You will be signed out on every other device.">
      {token ? (
        <ActionForm action={resetPasswordAction} submit="Save new password">
          <input type="hidden" name="token" value={token} />
          <Field name="password" label="New password" type="password" autoComplete="new-password" hint="At least 10 characters, with a letter and a number." />
        </ActionForm>
      ) : (
        <p className="text-fog">
          This page needs the link from the reset email.{' '}
          <Link href="/forgot-password" className="link text-white">
            Request a new link
          </Link>
        </p>
      )}
    </AuthShell>
  )
}
