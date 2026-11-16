import Link from 'next/link'

import { FaceCanvas } from './three/face-canvas'

// The entrance is plain CSS (`.enter`), so the hero is readable without
// JavaScript and rests in its final state under reduced motion.
export function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  const delay = (seconds: number) => ({ '--enter-delay': `${seconds}s` }) as React.CSSProperties

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="wrap relative grid min-h-[calc(100svh-4rem)] items-end py-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-8 lg:py-0">
        <div className="enter-fade absolute inset-x-0 top-0 h-[58svh] opacity-70 lg:relative lg:order-2 lg:h-[calc(100svh-4rem)] lg:opacity-100">
          <FaceCanvas
            mode="hero"
            label="A 3D head made of light points. A vertical line sweeps across it and the side it has passed takes a refined shape."
            className="h-full"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-4 hidden justify-between lg:flex font-mono text-[10px] uppercase tracking-[0.22em] text-ash lg:inset-x-10 lg:bottom-10">
            <span>Before</span>
            <span className="text-white">AI Simulation</span>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink to-transparent lg:hidden" />
        </div>

        <div className="relative z-10 lg:order-1">
          <p className="eyebrow enter" style={delay(0)}>
            AI aesthetic surgery simulator · 12 procedures
          </p>
          <h1 className="h1 enter mt-5" style={delay(0.08)}>
            {title}
          </h1>
          <p className="lead enter mt-6 max-w-xl" style={delay(0.18)}>
            {subtitle}
          </p>
          <div className="enter mt-8 flex flex-col gap-3 sm:flex-row" style={delay(0.28)}>
            <Link href="/simulator" className="btn-primary">
              Try AI Simulation
            </Link>
            <Link href="/procedures" className="btn-ghost">
              Explore Procedures
            </Link>
          </div>
          <p className="enter mt-6 text-sm text-ash" style={delay(0.38)}>
            One free simulation with a new account. Illustrative only, not a medical prediction.
          </p>
        </div>
      </div>
    </section>
  )
}
