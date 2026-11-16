'use client'

import { useEffect, useRef, useState } from 'react'

import { SkullCanvas } from './three/skull-canvas'
import type { StagePose } from './three/skull-stage'

type Slide = { eyebrow: string; title: string; body: string; pose: StagePose }

const SLIDES: Slide[] = [
  {
    eyebrow: 'The base',
    title: 'Every simulation starts from bone.',
    body: 'A 3D model of the skull, in millimetres, is the geometric base. What you see here is a generic mannequin; a case uses the anatomy of the person.',
    pose: { yaw: 0, pitch: 2, zoom: 1, lift: 0 },
  },
  {
    eyebrow: 'Every angle',
    title: 'One model, seen from anywhere.',
    body: 'Front, both profiles, three-quarter, from above and below: every view is drawn from the same model, so they always agree with each other.',
    pose: { yaw: 90, pitch: 0, zoom: 1.05, lift: 0 },
  },
  {
    eyebrow: 'The jaws',
    title: 'BSSO, Le Fort, Bi-Max.',
    body: 'A jaw operation is a measured movement of a bone segment. The plan states it in millimetres and degrees, and the model moves by exactly that.',
    pose: { yaw: -38, pitch: 6, zoom: 1.75, lift: -0.2 },
  },
  {
    eyebrow: 'Implants',
    title: 'Titanium, designed on the bone.',
    body: 'Chin, jaw angle or cheekbone: an implant is a 3D shape with a position and an orientation on the patient’s own skull.',
    pose: { yaw: 28, pitch: -24, zoom: 1.7, lift: -0.27 },
  },
  {
    eyebrow: 'The picture',
    title: 'From geometry to a photograph.',
    body: 'The changed model is rendered from the front and in profile, then an image model turns the renders into a photographic view, checked against the 3D outline.',
    pose: { yaw: -16, pitch: 8, zoom: 1.12, lift: 0.02 },
  },
]

const mix = (a: number, b: number, t: number) => a + (b - a) * t

type Scroller = { scrollTo: (target: number, options?: { duration?: number; lock?: boolean; onComplete?: () => void }) => void }

/**
 * A slideshow driven by scrolling: the section stays pinned while the skull
 * turns from one slide's pose to the next, and the page settles on the
 * nearest slide when scrolling stops.
 */
export function SkullShowcase() {
  const section = useRef<HTMLElement>(null)
  const settling = useRef(false)
  const [position, setPosition] = useState(0) // 0 … slides - 1, fractional while scrolling

  useEffect(() => {
    const element = section.current
    if (!element) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let idle = 0

    const measure = () => {
      const rect = element.getBoundingClientRect()
      const travel = rect.height - window.innerHeight
      const progress = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0
      return { progress, travel, top: window.scrollY + rect.top, inside: rect.top < 1 && rect.bottom > window.innerHeight - 1 }
    }
    const goTo = (index: number) => {
      const { travel, top } = measure()
      const y = top + (travel * index) / (SLIDES.length - 1)
      const smooth = (window as unknown as { lenis?: Scroller }).lenis
      settling.current = true
      const done = () => {
        settling.current = false
      }
      if (smooth) smooth.scrollTo(y, { duration: 0.7, onComplete: done })
      else {
        window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' })
        window.setTimeout(done, 700)
      }
    }
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setPosition(measure().progress * (SLIDES.length - 1))
        })
      }
      // When scrolling stops inside the section, settle on the nearest slide.
      window.clearTimeout(idle)
      if (reduced || settling.current) return
      idle = window.setTimeout(() => {
        const { progress, inside } = measure()
        const exact = progress * (SLIDES.length - 1)
        if (inside && Math.abs(exact - Math.round(exact)) > 0.02) goTo(Math.round(exact))
      }, 170)
    }
    const onGoTo = (event: Event) => goTo((event as CustomEvent<number>).detail)

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    element.addEventListener('showcase:goto', onGoTo)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(idle)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      element.removeEventListener('showcase:goto', onGoTo)
    }
  }, [])

  const from = Math.min(SLIDES.length - 1, Math.floor(position))
  const to = Math.min(SLIDES.length - 1, from + 1)
  const raw = position - from
  const t = raw * raw * (3 - 2 * raw)
  const a = SLIDES[from]!.pose
  const b = SLIDES[to]!.pose
  const pose: StagePose = { yaw: mix(a.yaw, b.yaw, t), pitch: mix(a.pitch, b.pitch, t), zoom: mix(a.zoom, b.zoom, t), lift: mix(a.lift, b.lift, t) }
  const active = Math.round(position)
  const goTo = (index: number) => section.current?.dispatchEvent(new CustomEvent('showcase:goto', { detail: index }))

  return (
    <section ref={section} aria-label="How the 3D simulation works" className="relative border-b border-line" style={{ height: `${SLIDES.length * 100}svh` }}>
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden pt-16 lg:flex-row lg:items-stretch">
        <SkullCanvas pose={pose} label="A 3D skull mannequin that turns as you scroll" className="h-[46svh] w-full shrink-0 lg:order-2 lg:h-auto lg:w-[55%]" />

        <div className="wrap relative flex min-h-0 flex-1 items-center lg:order-1 lg:w-[45%] lg:max-w-none lg:pl-[max(2rem,calc((100vw-1200px)/2+2rem))] lg:pr-0">
          <div className="relative w-full">
            {SLIDES.map((slide, index) => (
              <div
                key={slide.title}
                aria-hidden={active !== index}
                className={`transition duration-500 ease-out ${index === 0 ? '' : 'absolute inset-x-0 top-0'} ${active === index ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
              >
                <p className="eyebrow">
                  {String(index + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')} · {slide.eyebrow}
                </p>
                <h2 className="h2 mt-4 max-w-xl">{slide.title}</h2>
                <p className="lead mt-5 max-w-lg">{slide.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center lg:inset-x-auto lg:bottom-auto lg:right-6 lg:top-1/2 lg:-translate-y-1/2">
          <div className="pointer-events-auto flex gap-1 lg:flex-col" role="tablist" aria-label="Slides">
            {SLIDES.map((slide, index) => (
              <button key={slide.title} type="button" role="tab" aria-selected={active === index} aria-label={`Slide ${index + 1}: ${slide.eyebrow}`} onClick={() => goTo(index)} className="flex h-11 w-7 items-center justify-center lg:h-7 lg:w-11">
                <span className={`block rounded-full transition-all duration-300 ${active === index ? 'h-2 w-6 bg-white lg:h-6 lg:w-2' : 'h-2 w-2 bg-white/30'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
