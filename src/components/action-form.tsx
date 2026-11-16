'use client'

import { createContext, useActionState, useContext, useState } from 'react'
import { useFormStatus } from 'react-dom'

import type { FormState } from '@/app/actions/auth'

const ErrorsContext = createContext<Record<string, string>>({})

type Action = (state: FormState, form: FormData) => Promise<FormState>

type FormProps = {
  action: Action
  submit: string
  children: React.ReactNode
  className?: string
  submitClassName?: string
  /** A destructive form asks for a second press before it submits. */
  confirm?: string
}

function Submit({ label, className, confirm }: { label: string; className: string; confirm?: string }) {
  const { pending } = useFormStatus()
  const [isArmed, setIsArmed] = useState(false)

  if (confirm && !isArmed) {
    return (
      <button type="button" onClick={() => setIsArmed(true)} className={className}>
        {label}
      </button>
    )
  }

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? 'Working…' : (confirm ?? label)}
    </button>
  )
}

export function ActionForm({ action, submit, children, className = 'space-y-5', submitClassName = 'btn-primary w-full', confirm }: FormProps) {
  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className={className} noValidate>
      <ErrorsContext.Provider value={state.errors ?? {}}>{children}</ErrorsContext.Provider>
      <Submit label={submit} className={submitClassName} confirm={confirm} />
      {state.message && (
        <p role={state.ok ? 'status' : 'alert'} className={`text-sm leading-relaxed ${state.ok ? 'text-fog' : 'text-white'}`}>
          {state.ok ? '✓ ' : ''}
          {state.message}
        </p>
      )}
    </form>
  )
}

type FieldProps = {
  name: string
  label: string
  type?: 'text' | 'email' | 'password' | 'number'
  autoComplete?: string
  defaultValue?: string | number
  hint?: string
  rows?: number
  step?: string
}

export function Field({ name, label, type = 'text', autoComplete, defaultValue, hint, rows, step }: FieldProps) {
  const error = useContext(ErrorsContext)[name]
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined
  const shared = {
    id: name,
    name,
    defaultValue,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: 'field',
  }

  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      {rows ? <textarea {...shared} rows={rows} /> : <input {...shared} type={type} autoComplete={autoComplete} step={step} />}
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1.5 text-xs text-ash">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function CheckField({ name, children, defaultChecked }: { name: string; children: React.ReactNode; defaultChecked?: boolean }) {
  const error = useContext(ErrorsContext)[name]

  return (
    <div>
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm leading-relaxed text-fog">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-5 w-5 shrink-0 accent-white" />
        <span>{children}</span>
      </label>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}
