export function AuthShell({ title, lead, children, footer }: { title: string; lead: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="wrap flex min-h-[calc(100svh-4rem)] items-center justify-center py-14">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-medium tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 text-fog">{lead}</p>
        <div className="card mt-8 p-6 sm:p-8">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-fog">{footer}</p>}
      </div>
    </section>
  )
}
