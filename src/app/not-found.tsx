import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="wrap flex min-h-[70svh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow">Error 404</p>
      <h1 className="h2 mt-4">This page does not exist.</h1>
      <p className="lead mt-4">The link may be old, or the page may have been removed.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary">
          Go to the homepage
        </Link>
        <Link href="/simulator" className="btn-ghost">
          Open the simulator
        </Link>
      </div>
    </section>
  )
}
