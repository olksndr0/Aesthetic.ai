import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254)

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'Use at most 200 characters.')
  .refine(value => /[a-zA-Z]/.test(value) && /\d/.test(value), 'Include at least one letter and one number.')

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  email: emailSchema,
  password: passwordSchema,
  terms: z.literal('on', { errorMap: () => ({ message: 'Accept the terms to continue.' }) }),
  adult: z.literal('on', { errorMap: () => ({ message: 'You must be 18 or older.' }) }),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
})

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  email: emailSchema,
  subject: z.string().trim().min(3, 'Enter a subject.').max(120),
  message: z.string().trim().min(10, 'Write at least 10 characters.').max(4000),
})

export const simulationSchema = z.object({
  procedure: z.string().min(1).max(60),
  focus: z.string().min(1).max(40),
  intensity: z.coerce.number().int().min(10).max(100),
  consentSelf: z.literal('true'),
  consentAdult: z.literal('true'),
  consentProcessing: z.literal('true'),
})

export type FieldErrors = Record<string, string>

export function fieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    result[key] ??= issue.message
  }
  return result
}

/** Only same-site relative paths are followed after login. */
export function safeNext(next: unknown, fallback = '/dashboard'): string {
  return typeof next === 'string' && /^\/[a-zA-Z0-9/_?=&%-]*$/.test(next) && !next.startsWith('//') ? next : fallback
}
