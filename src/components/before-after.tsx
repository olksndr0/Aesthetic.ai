'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Props = { beforeSrc: string; afterSrc: string; downloadHref?: string; beforeLabel?: string; afterLabel?: string; downloadLabel?: string }

export function BeforeAfter({ beforeSrc, afterSrc, downloadHref, beforeLabel = 'Before', afterLabel = 'AI Simulation', downloadLabel = 'Download result' }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(100)
  const [ratio, setRatio] = useState<number | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const hasPlayed = useRef(false)

  // Once the result has loaded, the divider glides from "all before" to the middle.
  const playIntro = useCallback(() => {
    if (hasPlayed.current) return
    hasPlayed.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPosition(50)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400)
      const eased = 1 - (1 - t) ** 4
      setPosition(100 - 50 * eased)
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])

  const moveTo = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    setPosition(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)))
  }, [])

  const close = useCallback(() => {
    setIsExpanded(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }, [])

  async function expand() {
    setIsExpanded(true)
    // Native fullscreen where the browser has it; the fixed overlay covers the rest (iOS Safari).
    try {
      await shell.current?.requestFullscreen?.()
    } catch {
      // overlay only
    }
  }

  useEffect(() => {
    if (!isExpanded) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    const onChange = () => !document.fullscreenElement && setIsExpanded(false)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onChange)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onChange)
      document.body.style.overflow = ''
    }
  }, [isExpanded, close])

  return (
    <div ref={shell} className={isExpanded ? 'fixed inset-0 z-[70] flex flex-col bg-ink p-3 sm:p-6' : ''}>
      <div className={`flex min-h-0 flex-1 items-center justify-center ${isExpanded ? '' : 'w-full'}`}>
        <div
          ref={frame}
          className={`relative touch-none select-none overflow-hidden rounded-2xl border border-line bg-coal ${isDragging ? 'cursor-grabbing' : 'cursor-ew-resize'} ${isExpanded ? 'max-h-full max-w-full' : 'w-full'}`}
          style={{ aspectRatio: ratio ?? 4 / 5, ...(isExpanded && ratio ? { height: '100%', width: 'auto' } : {}) }}
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setIsDragging(true)
            moveTo(event.clientX)
          }}
          onPointerMove={event => isDragging && moveTo(event.clientX)}
          onPointerUp={() => setIsDragging(false)}
          onPointerCancel={() => setIsDragging(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={afterSrc}
            alt={afterLabel}
            draggable={false}
            onLoad={playIntro}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeSrc}
            alt={beforeLabel}
            draggable={false}
            onLoad={event => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          />

          <span className="glass pointer-events-none absolute left-3 top-3 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ opacity: position > 12 ? 1 : 0 }}>
            {beforeLabel}
          </span>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink" style={{ opacity: position < 82 ? 1 : 0 }}>
            {afterLabel}
          </span>

          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_24px_rgba(255,255,255,0.7)]" style={{ left: `${position}%` }}>
            <span className={`absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-lg transition-transform ${isDragging ? 'scale-110' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 5 3 10l4 5M13 5l4 5-4 5" />
              </svg>
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(position)}
            onChange={event => setPosition(Number(event.target.value))}
            aria-label="Comparison position: left shows the simulation, right shows the original"
            className="absolute inset-x-0 bottom-0 h-11 w-full cursor-ew-resize opacity-0 focus-visible:opacity-100"
          />
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-2 ${isExpanded ? 'justify-center pt-4' : 'pt-4'}`}>
        <button type="button" onClick={isExpanded ? close : expand} className="btn-ghost btn-sm min-h-[44px]">
          {isExpanded ? 'Exit fullscreen' : 'View fullscreen'}
        </button>
        {downloadHref && (
          <a href={downloadHref} download className="btn-primary btn-sm min-h-[44px]">
            {downloadLabel}
          </a>
        )}
      </div>
    </div>
  )
}
