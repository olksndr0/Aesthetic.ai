'use client'

import { useEffect, useRef, useState } from 'react'
import type { BufferGeometry } from 'three'

import type { SkullStage, StagePose } from './skull-stage'

// The model is fetched and parsed once for every canvas on the page.
let geometry: Promise<BufferGeometry> | null = null

type Props = {
  /** Where the skull should be; it eases there. */
  pose: StagePose
  /** Degrees of slow side-to-side sway added on top of the pose. */
  sway?: number
  label: string
  className?: string
}

/** The skull mannequin on a transparent canvas, easing toward `pose`. Three.js loads after the page is interactive. */
export function SkullCanvas({ pose, sway = 0, label, className = '' }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const target = useRef(pose)
  const swayRef = useRef(sway)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  target.current = pose
  swayRef.current = sway

  useEffect(() => {
    const element = container.current
    if (!element) return
    let stage: SkullStage | null = null
    let frame = 0
    let visible = true
    let cancelled = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const current = { ...target.current }

    const tick = (time: number) => {
      frame = 0
      if (!stage || !visible) return
      const goal = target.current
      const ease = reduced ? 1 : 0.09
      current.yaw += (goal.yaw - current.yaw) * ease
      current.pitch += (goal.pitch - current.pitch) * ease
      current.zoom += (goal.zoom - current.zoom) * ease
      current.lift += (goal.lift - current.lift) * ease
      const swing = reduced ? 0 : swayRef.current * Math.sin(time / 2600)
      stage.setPose({ ...current, yaw: current.yaw + swing })
      frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }

    void import('./skull-stage')
      .then(async module => {
        geometry ??= module.loadSkullGeometry()
        const loaded = await geometry
        if (cancelled) return
        stage = new module.SkullStage(element, loaded)
        setState('ready')
        start()
      })
      .catch(() => {
        geometry = null
        if (!cancelled) setState('failed')
      })

    // Nothing is drawn while the canvas is off screen.
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting)
      if (visible) start()
    })
    observer.observe(element)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      stage?.dispose()
    }
  }, [])

  return (
    <div className={`relative ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side,rgba(255,255,255,0.07),transparent_70%)]" />
      <div ref={container} role="img" aria-label={label} className={`absolute inset-0 transition-opacity duration-700 ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`} />
      {state !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="aspect-[3/4] h-[58%] rounded-[46%] border border-white/15 bg-[radial-gradient(closest-side,rgba(255,255,255,0.08),transparent)]" />
        </div>
      )}
    </div>
  )
}
