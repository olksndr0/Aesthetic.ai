'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

type Item = { id: string; question: string; answer: string }

export function FaqAccordion({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null)

  return (
    <div className="border-t border-line">
      {items.map(item => {
        const isOpen = open === item.id
        return (
          <div key={item.id} className="border-b border-line">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${item.id}`}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className="group flex min-h-[72px] w-full items-center justify-between gap-6 py-5 text-left text-lg font-medium tracking-tight transition hover:text-white sm:text-xl"
              >
                {item.question}
                <span aria-hidden="true" className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 transition duration-300 group-hover:border-white/45 ${isOpen ? 'rotate-45 bg-white text-ink' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`faq-${item.id}`}
                  role="region"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-3xl pb-7 text-[16px] leading-relaxed text-fog">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
