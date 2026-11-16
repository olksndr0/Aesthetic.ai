import type { MetadataRoute } from 'next'

const PAGES = ['', '/simulator', '/procedures', '/pricing', '/about', '/faq', '/contact', '/register', '/privacy', '/terms', '/cookies']

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return PAGES.map(path => ({
    url: `${base}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/simulator' ? 0.9 : 0.6,
  }))
}
