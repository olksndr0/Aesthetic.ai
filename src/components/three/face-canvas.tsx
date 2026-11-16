'use client'

import dynamic from 'next/dynamic'

import type { SceneMode } from './face-scene'

// WebGL is loaded after the page is interactive; the ring holds the space until then.
const FaceScene = dynamic(() => import('./face-scene'), {
  ssr: false,
  loading: () => <Placeholder />,
})

function Placeholder() {
  return (
    <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
      <div className="aspect-[3/4] h-[62%] rounded-[50%] border border-white/15 bg-[radial-gradient(closest-side,rgba(255,255,255,0.08),transparent)]" />
    </div>
  )
}

export function FaceCanvas({ mode, label, className = '' }: { mode: SceneMode; label: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side,rgba(255,255,255,0.07),transparent_70%)]" />
      <FaceScene mode={mode} label={label} />
    </div>
  )
}
