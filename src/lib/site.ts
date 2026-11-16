// Replace these with the operating company's real details before going live.
// They appear in the footer, the legal pages and the contact page.
export const SITE = {
  name: 'Aesthetic AI',
  tagline: 'AI simulation of aesthetic surgery on your own photo',
  description:
    'Upload a photo, choose one of twelve aesthetic procedures and see an AI-generated simulation of the result on your own face or body. Private by design.',
  legalName: 'Aesthetic AI',
  supportEmail: 'hello@aesthetic-ai.example',
  privacyEmail: 'privacy@aesthetic-ai.example',
  lastLegalUpdate: '16 November 2026',
} as const

export const NAV_LINKS = [
  { href: '/simulator', label: 'AI Simulator' },
  { href: '/profiles', label: 'Profiles' },
  { href: '/planning', label: '3D Planning' },
  { href: '/procedures', label: 'Procedures' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
] as const
