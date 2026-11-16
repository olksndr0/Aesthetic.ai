import 'server-only'

import { env } from './env'

type Mail = { to: string; subject: string; text: string; replyTo?: string }

/** Sends through Resend. Returns false when no provider is configured or the send failed. */
export async function sendEmail(mail: Mail): Promise<boolean> {
  if (!env.email.resendKey) {
    if (!env.isProd) {
      console.info(`\n[email not configured: printing instead]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`)
    } else {
      console.warn(`[email] RESEND_API_KEY is not set; "${mail.subject}" was not sent.`)
    }
    return false
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.email.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.email.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        reply_to: mail.replyTo,
      }),
    })
    if (!response.ok) console.error('[email] Resend answered', response.status, await response.text())
    return response.ok
  } catch (error) {
    console.error('[email] send failed', error)
    return false
  }
}
