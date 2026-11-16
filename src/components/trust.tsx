const ITEMS = [
  {
    title: 'Secure image processing',
    body: 'Every upload is checked, re-encoded and stripped of location and device data before it is stored.',
    icon: 'M11 2 3 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3Zm-3 9 2.2 2.2L14.5 9',
  },
  {
    title: 'Privacy-first architecture',
    body: 'Images live in private storage. Only your signed-in account can open them; there are no public links.',
    icon: 'M5 10V7a6 6 0 0 1 12 0v3M4 10h14v9H4zM11 13.5v2.5',
  },
  {
    title: 'Encrypted data transmission',
    body: 'Photos and results travel over HTTPS between your device, our servers and the AI provider.',
    icon: 'M3 11h16M11 3c3 3 3 13 0 16M11 3c-3 3-3 13 0 16M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
  },
  {
    title: 'Secure authentication',
    body: 'Passwords are stored as salted bcrypt hashes. Sessions use HTTP-only cookies and end on every device when you change your password.',
    icon: 'M14 8a4 4 0 1 1-3.5 6H8v2H6v2H3v-3l5.2-5.2A4 4 0 0 1 14 8Zm1.5 2.5h.01',
  },
  {
    title: 'User-controlled deletion',
    body: 'Delete a single simulation or your whole account at any time. Files are removed from storage at once.',
    icon: 'M4 6h14M9 6V4h4v2M6 6l1 13h8l1-13M9.5 10v6M12.5 10v6',
  },
  {
    title: 'Clear privacy policy',
    body: 'Photos are never used to train AI models. The policy states what is processed, by whom and for how long.',
    icon: 'M6 3h8l4 4v12H6zM14 3v4h4M9 11h6M9 14.5h6',
  },
]

export function Trust({ title, retentionDays }: { title: string; retentionDays: number }) {
  return (
    <section aria-labelledby="trust-title" className="section border-t border-line">
      <div className="wrap">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="eyebrow">Trust & privacy</p>
            <h2 id="trust-title" className="h2 mt-4">
              {title}
            </h2>
          </div>
          <p className="lead lg:justify-self-end lg:text-right">
            A photo of a face is sensitive personal data. It is processed for one purpose, your simulation, and deleted automatically after {retentionDays} days.
          </p>
        </div>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(item => (
            <li key={item.title} className="group bg-ink p-7 transition duration-300 hover:bg-coal">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition duration-300 group-hover:-translate-y-0.5">
                <path d={item.icon} />
              </svg>
              <h3 className="mt-5 text-lg font-medium tracking-tight">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
