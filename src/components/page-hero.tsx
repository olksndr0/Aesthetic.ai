export function PageHero({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <section className="border-b border-line">
      <div className="wrap py-16 sm:py-24">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="h1 mt-5 max-w-4xl !text-[clamp(2.4rem,5.2vw,4.25rem)]">{title}</h1>
        {lead && <p className="lead mt-6 max-w-2xl">{lead}</p>}
        {children}
      </div>
    </section>
  )
}
