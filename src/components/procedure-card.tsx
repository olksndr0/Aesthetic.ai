import Link from 'next/link'

import type { Procedure } from '@/lib/procedures'

import { ProcedureGlyph } from './procedure-glyph'

export function ProcedureCard({ procedure }: { procedure: Procedure }) {
  return (
    <article id={procedure.slug} className="card card-link group flex flex-col overflow-hidden">
      <div className="relative flex h-52 items-center justify-center overflow-hidden border-b border-line bg-ink/60">
        <ProcedureGlyph procedure={procedure} className="h-44 transition duration-500 ease-out group-hover:scale-[1.04]" />
        {!procedure.starter && (
          <span className="absolute right-4 top-4 rounded-full border border-white/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fog">
            Pro
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="h3">{procedure.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-fog">{procedure.summary}</p>
        <dl className="mt-5 grid gap-3 border-t border-line pt-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ash">Area</dt>
            <dd className="text-right">{procedure.region}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ash">Typical recovery</dt>
            <dd className="text-right">{procedure.recovery}</dd>
          </div>
        </dl>
        <Link href={`/simulator?procedure=${procedure.slug}`} className="btn-ghost btn-sm mt-6 min-h-[44px] w-full">
          Simulate This Procedure
        </Link>
      </div>
    </article>
  )
}
