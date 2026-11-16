import { SURGERY_CATALOG, SURGERY_CATEGORIES, formatRange } from '@/lib/surgery/catalog'

/** The clinic's operations with their indicative ranges and conditions. Not the price of the simulation service. */
export function SurgeryPriceList() {
  return (
    <div className="space-y-10">
      {SURGERY_CATEGORIES.map(category => (
        <div key={category}>
          <h3 className="eyebrow">{category}</h3>
          <ul className="mt-4 divide-y divide-white/10 border-y border-line">
            {SURGERY_CATALOG.filter(item => item.category === category).map(item => (
              <li key={item.slug} className="grid gap-x-8 gap-y-3 py-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                <div>
                  <p className="text-lg font-medium tracking-tight">
                    {item.name}
                    {item.short ? <span className="ml-2 font-mono text-xs text-ash">{item.short}</span> : null}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ash">{item.summary}</p>
                </div>
                <details className="text-sm text-fog">
                  <summary className="min-h-[44px] cursor-pointer py-2 text-white">Conditions ({item.conditions.length})</summary>
                  <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
                    {item.conditions.map(condition => (
                      <li key={condition}>{condition}</li>
                    ))}
                  </ul>
                </details>
                <p className="whitespace-nowrap font-mono text-sm md:text-right">{formatRange(item)}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
