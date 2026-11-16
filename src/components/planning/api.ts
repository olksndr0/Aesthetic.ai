import { decodeMesh, type Mesh } from '@/lib/anatomy/mesh'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public setup?: string,
  ) {
    super(message)
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as (T & { error?: { code: string; message: string; setup?: string } }) | null
  if (response.ok && json) return json
  throw new ApiError(json?.error?.code ?? 'network', json?.error?.message ?? 'The server could not be reached. Try again.', json?.error?.setup)
}

export function sendJson<T>(method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
  return fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    .catch(() => {
      throw new ApiError('network', 'The connection was lost. Check your network and try again.')
    })
    .then(response => unwrap<T>(response))
}

export function sendForm<T>(url: string, form: FormData): Promise<T> {
  return fetch(url, { method: 'POST', body: form })
    .catch(() => {
      throw new ApiError('network', 'The connection was lost during the upload. Try again.')
    })
    .then(response => unwrap<T>(response))
}

/** Downloads a stored mesh, in the file's own coordinates. */
export async function fetchMesh(assetId: string): Promise<Mesh> {
  const response = await fetch(`/api/planning/assets/${assetId}`)
  if (!response.ok) throw new ApiError('not_found', 'A stored model could not be loaded.')
  return decodeMesh(new Uint8Array(await response.arrayBuffer()))
}

export const assetUrl = (assetId: string, download = false) => `/api/planning/assets/${assetId}${download ? '?download=1' : ''}`

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
