import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['sharp', '@aws-sdk/client-s3'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Private user images must never be cached by shared caches.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ]
  },
}

export default config
