import type { Answer, HealthResponse, UploadedDocument } from './types'

// The only frontend environment setting is a public URL, never an API key.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, options)
  } catch (error) {
    // DOMException can come from a different realm and need not extend this realm's Error.
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError'
    )
      throw error
    throw new ApiError(
      'Kan de backend niet bereiken. Start FastAPI op poort 8000 en controleer de API-URL.',
      'network_error',
      0,
    )
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? 'De aanvraag kon niet worden verwerkt. Probeer opnieuw.',
      body?.error?.code ?? 'unknown_error',
      response.status,
    )
  }
  if (!body)
    throw new ApiError(
      'De backend gaf een onleesbaar antwoord.',
      'invalid_response',
      response.status,
    )
  return body as T
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request('/api/health', { signal })
}

export function uploadDocument(file: File, signal?: AbortSignal): Promise<UploadedDocument> {
  const body = new FormData()
  body.append('file', file)
  // The browser adds the multipart boundary to Content-Type.
  return request('/api/documents', { method: 'POST', body, signal })
}

export function askQuestion(
  documentId: string,
  question: string,
  signal?: AbortSignal,
): Promise<Answer> {
  return request('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_id: documentId, question }),
    signal,
  })
}
