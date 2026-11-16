import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#080808',
        coal: '#171717',
        ash: '#929292',
        line: 'rgba(255,255,255,0.10)',
        mist: '#e6e6e6',
        fog: '#bdbdbd',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      boxShadow: {
        soft: '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -30px rgba(0,0,0,0.9)',
      },
      maxWidth: { wrap: '1200px' },
    },
  },
  plugins: [],
}

export default config
