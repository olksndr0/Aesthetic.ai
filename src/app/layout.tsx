import './globals.css'

import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata, Viewport } from 'next'

import { CookieConsent } from '@/components/cookie-consent'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { SmoothScroll } from '@/components/smooth-scroll'
import { SITE } from '@/lib/site'

const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    title: `${SITE.name}: ${SITE.tagline}`,
    description: SITE.description,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: SITE.name, description: SITE.description },
  alternates: { canonical: '/' },
}

export const viewport: Viewport = { themeColor: '#080808', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-5 focus:py-3 focus:text-ink">
          Skip to content
        </a>
        <SmoothScroll />
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  )
}
