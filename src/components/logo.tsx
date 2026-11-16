import Link from 'next/link'

export function Logo() {
  return (
    <Link href="/" aria-label="Aesthetic AI home" className="group flex min-h-[44px] items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="transition duration-500 group-hover:rotate-180">
        <circle cx="11" cy="11" r="10" fill="none" stroke="#fff" strokeWidth="1.2" />
        <path d="M11 1a10 10 0 0 1 0 20z" fill="#fff" />
      </svg>
      <span className="text-[15px] font-medium tracking-[0.16em]">AESTHETIC AI</span>
    </Link>
  )
}
