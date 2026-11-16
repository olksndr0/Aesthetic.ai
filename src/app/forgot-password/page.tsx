import type { Metadata } from 'next'
import Link from 'next/link'

import { forgotPasswordAction } from '@/app/actions/auth'
import { ActionForm, Field } from '@/components/action-form'
import { AuthShell } from '@/components/auth-shell'

export const metadata: Metadata = { title: 'Reset password', robots: { index: false } }

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      lead="Enter your account email and we send you a link that works for one hour."
      footer={
        <Link href="/login" className="link text-white">
          Back to log in
        </Link>
      }
    >
      <ActionForm action={forgotPasswordAction} submit="Send reset link">
        <Field name="email" label="Email" type="email" autoComplete="email" />
      </ActionForm>
    </AuthShell>
  )
}
