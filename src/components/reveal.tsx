'use client'

import { useEffect, useRef } from 'react'

/**
 * One quiet entrance for a section's heading block. The content is visible by
 * default; it is only hidden, then revealed, when the script is running, the
 * block is still below the viewport and motion is allowed.
 */
export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const node = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = node.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (element.getBoundingClientRect().top < window.innerHeight * 0.9) return

    element.dataset.reveal = 'pending'
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          element.dataset.reveal = 'shown'
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -80px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={node} className={`reveal ${className}`}>
      {children}
    </div>
  )
}
