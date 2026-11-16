import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  // `server-only` is a Next.js build-time guard; tests run the server code directly.
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), 'server-only': path.resolve(__dirname, 'tests/helpers/server-only.ts') } },
})
