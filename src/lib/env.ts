import 'server-only'

function str(name: string, fallback = ''): string {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function int(name: string, fallback: number): number {
  const value = Number.parseInt(str(name), 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const env = {
  get appUrl() {
    return str('APP_URL', 'http://localhost:3000').replace(/\/$/, '')
  },
  get isProd() {
    return process.env.NODE_ENV === 'production'
  },
  ai: {
    get provider(): 'openai' | 'replicate' | null {
      const chosen = str('AI_PROVIDER').toLowerCase()
      if (chosen === 'openai') return str('OPENAI_API_KEY') ? 'openai' : null
      if (chosen === 'replicate') return str('REPLICATE_API_TOKEN') ? 'replicate' : null
      if (str('OPENAI_API_KEY')) return 'openai'
      if (str('REPLICATE_API_TOKEN')) return 'replicate'
      return null
    },
    get openaiKey() {
      return str('OPENAI_API_KEY')
    },
    get openaiModel() {
      return str('OPENAI_IMAGE_MODEL', 'gpt-image-1')
    },
    get replicateToken() {
      return str('REPLICATE_API_TOKEN')
    },
    get replicateModel() {
      return str('REPLICATE_MODEL', 'black-forest-labs/flux-kontext-pro')
    },
    get maxConcurrency() {
      return int('AI_MAX_CONCURRENCY', 2)
    },
    get timeoutMs() {
      return int('AI_TIMEOUT_MS', 180_000)
    },
  },
  stripe: {
    get secretKey() {
      return str('STRIPE_SECRET_KEY')
    },
    get webhookSecret() {
      return str('STRIPE_WEBHOOK_SECRET')
    },
  },
  storage: {
    get driver(): 'local' | 's3' {
      return str('STORAGE_DRIVER', 'local') === 's3' ? 's3' : 'local'
    },
    get localDir() {
      return str('STORAGE_LOCAL_DIR', './storage')
    },
    get bucket() {
      return str('S3_BUCKET')
    },
    get region() {
      return str('S3_REGION', 'auto')
    },
    get endpoint() {
      return str('S3_ENDPOINT')
    },
    get accessKeyId() {
      return str('S3_ACCESS_KEY_ID')
    },
    get secretAccessKey() {
      return str('S3_SECRET_ACCESS_KEY')
    },
  },
  get retentionDays() {
    return int('IMAGE_RETENTION_DAYS', 30)
  },
  get cronSecret() {
    return str('CRON_SECRET')
  },
  email: {
    get resendKey() {
      return str('RESEND_API_KEY')
    },
    get from() {
      return str('EMAIL_FROM', 'Aesthetic AI <no-reply@aesthetic-ai.example>')
    },
    get contactInbox() {
      return str('CONTACT_INBOX')
    },
  },
}
