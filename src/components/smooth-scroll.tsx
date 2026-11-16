'use client'

import Lenis from 'lenis'
import { useEffect } from 'react'

/** Eased wheel scrolling on pointer devices. Touch keeps native scrolling. */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (reduced || coarse) return

    const lenis = new Lenis({ duration: 1.05, smoothWheel: true })
    let frame = requestAnimationFrame(function loop(time) {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    })

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [])

  return null
}
