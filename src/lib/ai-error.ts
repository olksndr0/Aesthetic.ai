export type AiErrorCode = 'not_configured' | 'content_rejected' | 'timeout' | 'provider_error'

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message)
  }
}
