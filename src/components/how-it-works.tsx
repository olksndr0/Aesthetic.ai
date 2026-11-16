'use client'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef, useState } from 'react'

import { SkullCanvas } from './three/skull-canvas'
import type { StagePose } from './three/skull-stage'

const STEPS: Array<{ title: string; body: string; pose: StagePose }> = [
  {
    title: 'Build the profile',
    body: 'The clinical record and the photographs of every view, front and both profiles at least. Each photo is re-encoded, stripped of location data and stored privately under your account.',
    pose: { yaw: 0, pitch: 0, zoom: 1, lift: 0 },
  },
  {
    title: 'Choose the procedure',
    body: 'Pick one of twelve procedures, the area to focus on and how far the change goes, from subtle to clearly visible.',
    pose: { yaw: -40, pitch: 4, zoom: 1.45, lift: -0.12 },
  },
  {
    title: 'Compare before and after',
    body: 'The model edits only the treated area of your own photos. Drag the slider on the front view and on the profile, then download or delete the result.',
    pose: { yaw: 88, pitch: 0, zoom: 1.05, lift: 0 },
  },
]

export function HowItWorks({ title }: { title: string }) {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const context = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-step]').forEach((element, index) => {
        ScrollTrigger.create({
          trigger: element,
          start: 'top 62%',
          end: 'bottom 38%',
          onToggle: self => self.isActive && setActive(index),
        })
      })
      gsap.fromTo(
        '[data-progress]',
        { scaleY: 0 },
        { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '[data-steps]', start: 'top 62%', end: 'bottom 38%', scrub: true } },
      )
    }, root)
    return () => context.revert()
  }, [])

  return (
    <section ref={root} aria-labelledby="how-title" className="section border-t border-line">
      <div className="wrap grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="h2 mt-4 max-w-lg">
            {title}
          </h2>
          <SkullCanvas
            pose={STEPS[active]?.pose ?? STEPS[0]!.pose}
            label="A 3D skull that turns to the view each step describes"
            className="mt-6 h-[46vh] min-h-[320px] lg:h-[calc(100%-11rem)]"
          />
        </div>
        <ol data-steps className="relative lg:py-[22vh]">
          <span aria-hidden="true" className="absolute left-[15px] top-0 hidden h-full w-px bg-white/10 lg:block">
            <span data-progress className="block h-full w-px origin-top bg-white" />
          </span>
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              data-step
              className={`relative flex gap-6 py-8 transition-opacity duration-500 lg:min-h-[46vh] lg:items-center lg:py-0 ${active === index ? 'opacity-100' : 'lg:opacity-35'}`}
            >
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 bg-ink font-mono text-xs">
                {index + 1}
              </span>
              <div>
                <h3 className="text-2xl font-medium tracking-tight sm:text-3xl">{step.title}</h3>
                <p className="lead mt-3 max-w-md">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
