'use client'

import type { ReactNode } from 'react'

import { STATUS_COLOURS, type MarkerStatus } from './status'

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h3 className="eyebrow">{title}</h3>
      {hint && <p className="mt-2 text-sm leading-relaxed text-ash">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <p role={tone === 'warning' ? 'alert' : undefined} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tone === 'warning' ? 'border-white/40 text-white' : 'border-line text-fog'}`}>
      {children}
    </p>
  )
}

const STATUS_TEXT: Record<MarkerStatus, string> = { acquired: 'Acquired', estimated: 'Estimated', modified: 'Modified by simulation' }

/** Marks data as measured, inferred, or changed by the simulation. */
export function StatusBadge({ status }: { status: MarkerStatus }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fog">
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOURS[status] }} />
      {STATUS_TEXT[status]}
    </span>
  )
}

type NumProps = {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  /** Shown when the field is empty: these values are never pre-filled. */
  placeholder?: string
}

export function Num({ label, value, onChange, unit, step = 0.5, min, max, placeholder }: NumProps) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs text-ash">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <input
        type="number"
        inputMode="decimal"
        className="field min-h-[44px] px-3 py-2 text-sm"
        value={value ?? ''}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value === '' || Number.isNaN(event.target.valueAsNumber) ? null : event.target.valueAsNumber)}
      />
    </label>
  )
}

type Triple = [number, number, number]

/** Three numbers on the anatomical axes of the canonical frame. */
export function Axes({ label, value, onChange, unit, labels = ['Left', 'Superior', 'Anterior'], step }: { label: string; value: Triple; onChange: (value: Triple) => void; unit: string; labels?: [string, string, string]; step?: number }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-fog">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {labels.map((name, index) => (
          <Num
            key={name}
            label={name}
            unit={unit}
            step={step}
            value={value[index]!}
            onChange={next => {
              const copy: Triple = [...value]
              copy[index] = next ?? 0
              onChange(copy)
            }}
          />
        ))}
      </div>
    </fieldset>
  )
}

export function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs text-ash">{label}</span>
      <select className="field min-h-[44px] px-3 py-2 text-sm" value={value} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => (
          <option key={option.value} value={option.value} className="bg-coal">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs text-ash">{label}</span>
      <input className="field min-h-[44px] px-3 py-2 text-sm" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    </label>
  )
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm leading-relaxed text-fog">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-white" />
      <span>{children}</span>
    </label>
  )
}

export const mm = (value: number, digits = 1) => `${value.toFixed(digits)} mm`
