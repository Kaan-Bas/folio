import { describe, expect, it, vi } from 'vitest'
import { ApiError, askQuestion, getHealth, investigateReturn, uploadDocument } from './api'

describe('API contract', () => {
  it('uploads multipart without overriding the browser content type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ document_id: 'id' }) })
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    await uploadDocument(file)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/documents$/)
    expect(options.body.get('file')).toBe(file)
    expect(options.headers).toBeUndefined()
  })
  it('sends the current document ID and question as JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ answer: 'ok', sources: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    await askQuestion('current-id', 'Welke kleur?')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      document_id: 'current-id',
      question: 'Welke kleur?',
    })
  })
  it('surfaces the safe backend error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: 'missing_api_key', message: 'Vul de API-sleutel in.' },
        }),
      }),
    )
    await expect(getHealth()).rejects.toMatchObject({
      message: 'Vul de API-sleutel in.',
      code: 'missing_api_key',
      status: 503,
    })
  })
  it('sends agent instructions and optional fictional order ID with the current document', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'completed' }) })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await investigateReturn('current-id', 'Onderzoek retour.', 'DEMO-1001', controller.signal)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/agent$/)
    expect(JSON.parse(options.body)).toEqual({
      document_id: 'current-id',
      instruction: 'Onderzoek retour.',
      order_id: 'DEMO-1001',
    })
    expect(options.signal).toBe(controller.signal)
    await investigateReturn('current-id', 'Wat is de retourtermijn?', null)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).order_id).toBeNull()
  })
  it('explains network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getHealth()).rejects.toThrow('Kan de backend niet bereiken')
  })
  it('preserves cancellations and handles non-JSON errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))
    await expect(getHealth()).rejects.toMatchObject({ name: 'AbortError' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('HTML')
        },
      }),
    )
    await expect(getHealth()).rejects.toBeInstanceOf(ApiError)
  })
})
