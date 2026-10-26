import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openAgent } from './test/navigation'
import * as api from './api'
import type { AgentResponse, Answer, UploadedDocument } from './types'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getHealth: vi.fn(),
  uploadDocument: vi.fn(),
  askQuestion: vi.fn(),
  investigateReturn: vi.fn(),
}))

const document: UploadedDocument = {
  document_id: 'first-id',
  filename: 'eerste.pdf',
  page_count: 3,
  text_page_count: 3,
  chunk_count: 5,
}
const answer: Answer = {
  answer: 'De fiets is blauw.',
  insufficient_context: false,
  sources: [{ chunk_id: 'p3-c0', page: 3, text: 'De fiets heeft een blauwe kleur.', score: 0.9 }],
}
const agentAdvice: AgentResponse = {
  answer: 'Conceptadvies: de bestelling valt binnen de retourtermijn.',
  sources: answer.sources,
  tool_calls: [
    {
      sequence: 1,
      name: 'search_policy',
      status: 'success',
      message: 'Beleidsfragmenten gevonden.',
    },
  ],
  status: 'completed',
  error: null,
  concept_advice: true,
  disclaimer: 'Conceptadvies met fictieve gegevens. Geen definitief terugbetalingsbesluit.',
}

async function uploadFile(name = 'eerste.pdf') {
  const file = new File(['%PDF-test'], name, { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('PDF uploaden'), { target: { files: [file] } })
  await screen.findByText(name)
}

beforeEach(() => {
  vi.mocked(api.getHealth).mockResolvedValue({
    status: 'ok',
    configured: true,
    max_upload_mb: 10,
    max_question_chars: 2000,
  })
  vi.mocked(api.uploadDocument).mockResolvedValue(document)
  vi.mocked(api.askQuestion).mockResolvedValue(answer)
  vi.mocked(api.investigateReturn).mockResolvedValue(agentAdvice)
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:local-pdf'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

describe('PDF assistant', () => {
  it('disables chat until upload and renders the answer with inspectable page sources', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByLabelText('Je vraag over de PDF')).toBeDisabled()
    await uploadFile()
    const input = screen.getByLabelText('Je vraag over de PDF')
    await user.type(input, 'Welke kleur heeft de fiets?')
    await user.click(screen.getByRole('button', { name: 'Vraag versturen' }))
    expect(await screen.findByText('De fiets is blauw.')).toBeInTheDocument()
    expect(api.askQuestion).toHaveBeenCalledWith(
      'first-id',
      'Welke kleur heeft de fiets?',
      expect.any(AbortSignal),
    )
    await user.click(screen.getByText('Pagina 3'))
    expect(screen.getByText('De fiets heeft een blauwe kleur.')).toBeVisible()
    expect(screen.getByRole('link', { name: /Open pagina 3/ })).toHaveAttribute(
      'href',
      'blob:local-pdf#page=3',
    )
  })

  it('resets the chat on replacement and ignores a late answer from the old PDF', async () => {
    const user = userEvent.setup()
    let resolveAnswer!: (value: Answer) => void
    vi.mocked(api.askQuestion).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAnswer = resolve
      }),
    )
    render(<App />)
    await uploadFile()
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Oude vraag{Enter}')
    await screen.findByText('Oude vraag', { selector: 'p' })
    vi.mocked(api.uploadDocument).mockResolvedValueOnce({
      ...document,
      document_id: 'second-id',
      filename: 'tweede.pdf',
    })
    await uploadFile('tweede.pdf')
    await act(async () => {
      resolveAnswer(answer)
    })
    expect(screen.queryByText('Oude vraag')).not.toBeInTheDocument()
    expect(screen.queryByText('De fiets is blauw.')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Nieuwe vraag{Enter}')
    await waitFor(() =>
      expect(api.askQuestion).toHaveBeenLastCalledWith(
        'second-id',
        'Nieuwe vraag',
        expect.any(AbortSignal),
      ),
    )
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('shows upload progress and leaves chat disabled on failure', async () => {
    let rejectUpload!: (error: Error) => void
    vi.mocked(api.uploadDocument).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectUpload = reject
      }),
    )
    render(<App />)
    fireEvent.change(screen.getByLabelText('PDF uploaden'), {
      target: { files: [new File(['%PDF'], 'bad.pdf', { type: 'application/pdf' })] },
    })
    expect(screen.getByText('PDF wordt verwerkt…')).toBeInTheDocument()
    await act(async () => {
      rejectUpload(new Error('Geen leesbare tekst gevonden.'))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Geen leesbare tekst')
    expect(screen.getByLabelText('Je vraag over de PDF')).toBeDisabled()
  })

  it('displays insufficient context without invented sources', async () => {
    const user = userEvent.setup()
    vi.mocked(api.askQuestion).mockResolvedValueOnce({
      answer: 'Onvoldoende informatie in de PDF.',
      sources: [],
      insufficient_context: true,
    })
    render(<App />)
    await uploadFile()
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Wat is niet bekend?{Enter}')
    expect(await screen.findByText('Onvoldoende context')).toBeInTheDocument()
    expect(screen.queryByText('GEBRUIKTE BRONNEN')).not.toBeInTheDocument()
  })

  it('preserves the question after an API failure so the user can retry', async () => {
    const user = userEvent.setup()
    vi.mocked(api.askQuestion).mockRejectedValueOnce(
      new Error('De AI-provider is niet bereikbaar.'),
    )
    render(<App />)
    await uploadFile()
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Welke kleur?{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('niet bereikbaar')
    expect(screen.getByLabelText('Je vraag over de PDF')).toHaveValue('Welke kleur?')
    expect(screen.getByRole('button', { name: 'Vraag versturen' })).toBeEnabled()
  })

  it('invalidates the UI when the backend has restarted or replaced the document', async () => {
    const user = userEvent.setup()
    vi.mocked(api.askQuestion).mockRejectedValueOnce(
      new api.ApiError('Upload opnieuw.', 'no_document', 404),
    )
    render(<App />)
    await uploadFile()
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Vraag{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload opnieuw.')
    expect(screen.getByLabelText('Je vraag over de PDF')).toBeDisabled()
  })

  it('rejects invalid files in the browser and explains missing configuration', async () => {
    vi.mocked(api.getHealth).mockResolvedValueOnce({
      status: 'ok',
      configured: false,
      max_upload_mb: 10,
      max_question_chars: 2000,
    })
    render(<App />)
    expect(await screen.findByRole('status')).toHaveTextContent('De LLM is nog niet ingesteld.')
    fireEvent.change(screen.getByLabelText('PDF uploaden'), {
      target: { files: [new File(['x'], 'wrong.txt', { type: 'text/plain' })] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF-bestand')
    expect(api.uploadDocument).not.toHaveBeenCalled()
  })

  it('offers a separate agent mode with validated order input, advice, sources and tool statuses', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAgent(user, 'Retourbeoordeling agent')
    expect(screen.getByRole('button', { name: 'Onderzoek starten' })).toBeDisabled()
    vi.mocked(api.uploadDocument).mockResolvedValueOnce({
      ...document,
      filename: 'refund_policy.pdf',
    })
    await uploadFile('refund_policy.pdf')
    await user.type(screen.getByLabelText(/Fictieve order-ID/), 'demo-1001')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    expect(await screen.findByText(agentAdvice.answer)).toBeInTheDocument()
    const conclusion = screen.getByRole('region', { name: 'Conclusie: Conceptadvies' })
    expect(conclusion.parentElement?.firstElementChild).toBe(conclusion)
    expect(api.investigateReturn).toHaveBeenCalledWith(
      'first-id',
      expect.stringContaining('retourbeleid'),
      'DEMO-1001',
      expect.any(AbortSignal),
    )
    expect(screen.getByText('Retourbeleid doorzoeken')).toBeInTheDocument()
    expect(screen.getByText('Geslaagd')).toBeInTheDocument()
    expect(screen.getByText(agentAdvice.disclaimer)).toBeInTheDocument()
    await user.click(screen.getByText('GEBRUIKTE BRONNEN'))
    await user.click(screen.getByText('Pagina 3'))
    expect(screen.getByRole('link', { name: /Open pagina 3/ })).toHaveAttribute(
      'href',
      'blob:local-pdf#page=3',
    )
    expect(api.askQuestion).not.toHaveBeenCalled()
  })

  it('allows a policy-only agent instruction without an order lookup', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadFile()
    await openAgent(user, 'Retourbeoordeling agent')
    await user.clear(screen.getByLabelText('Opdracht'))
    await user.type(screen.getByLabelText('Opdracht'), 'Wat is de retourtermijn?')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    expect(await screen.findByText(agentAdvice.answer)).toBeInTheDocument()
    expect(api.investigateReturn).toHaveBeenCalledWith(
      'first-id',
      'Wat is de retourtermijn?',
      null,
      expect.any(AbortSignal),
    )
  })

  it('shows partial tool execution when the agent reaches its limit', async () => {
    const user = userEvent.setup()
    vi.mocked(api.investigateReturn).mockResolvedValueOnce({
      ...agentAdvice,
      status: 'limit_reached',
      answer: 'De limiet is bereikt.',
      sources: [],
      error: { code: 'tool_limit', message: 'Maximaal vijf toolaanroepen.' },
      tool_calls: [
        { sequence: 1, name: 'unknown_tool', status: 'blocked', message: 'Niet toegestaan.' },
      ],
    })
    render(<App />)
    await uploadFile()
    await openAgent(user, 'Retourbeoordeling agent')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    expect(await screen.findByText('Toollimiet bereikt')).toBeInTheDocument()
    expect(screen.getByText('Geblokkeerd')).toBeInTheDocument()
    expect(screen.queryByText('GEBRUIKTE BRONNEN')).not.toBeInTheDocument()
  })

  it('discards an agent result arriving after a replacement upload', async () => {
    const user = userEvent.setup()
    let resolveAgent!: (value: AgentResponse) => void
    vi.mocked(api.investigateReturn).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAgent = resolve
      }),
    )
    render(<App />)
    await uploadFile()
    await openAgent(user, 'Retourbeoordeling agent')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    expect(screen.getByRole('link', { name: 'Document Chat' })).toHaveAttribute('href', '#/chat')
    vi.mocked(api.uploadDocument).mockResolvedValueOnce({
      ...document,
      document_id: 'second-id',
      filename: 'nieuw.pdf',
    })
    await uploadFile('nieuw.pdf')
    await act(async () => {
      resolveAgent(agentAdvice)
    })
    expect(screen.queryByText(agentAdvice.answer)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Uitgevoerde tools' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Onderzoek starten' })).toBeEnabled()
  })

  it('preserves document chat messages when switching modes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadFile()
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Welke kleur?{Enter}')
    await screen.findByText(answer.answer)
    await openAgent(user, 'Retourbeoordeling agent')
    await user.click(screen.getByRole('link', { name: 'Document Chat' }))
    expect(screen.getByText(answer.answer)).toBeInTheDocument()
    expect(screen.getByText('Welke kleur?', { selector: 'p' })).toBeInTheDocument()
  })

  it('rejects invalid order IDs before sending an agent request', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadFile()
    await openAgent(user, 'Retourbeoordeling agent')
    await user.type(screen.getByLabelText(/Fictieve order-ID/), 'REAL-123')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('fictieve order-ID')
    expect(api.investigateReturn).not.toHaveBeenCalled()
  })

  it('keeps agent input available after a network failure', async () => {
    const user = userEvent.setup()
    vi.mocked(api.investigateReturn).mockRejectedValueOnce(
      new Error('Kan de backend niet bereiken.'),
    )
    render(<App />)
    await uploadFile()
    await openAgent(user, 'Retourbeoordeling agent')
    await user.type(screen.getByLabelText(/Fictieve order-ID/), 'DEMO-1001')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kan de backend niet bereiken')
    expect(screen.getByLabelText(/Fictieve order-ID/)).toHaveValue('DEMO-1001')
    expect(screen.getByRole('button', { name: 'Onderzoek starten' })).toBeEnabled()
  })

  it('requires a new upload when the agent reports a missing document', async () => {
    const user = userEvent.setup()
    vi.mocked(api.investigateReturn).mockResolvedValueOnce({
      ...agentAdvice,
      status: 'error',
      answer: 'Upload eerst een PDF.',
      sources: [],
      tool_calls: [],
      error: { code: 'no_document', message: 'Upload eerst een PDF.' },
    })
    render(<App />)
    await uploadFile()
    await openAgent(user, 'Retourbeoordeling agent')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload eerst een PDF.')
    expect(screen.getByRole('button', { name: 'Onderzoek starten' })).toBeDisabled()
  })

  it('clears earlier agent advice when document chat discovers a backend restart', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadFile()
    await openAgent(user, 'Retourbeoordeling agent')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    await screen.findByText(agentAdvice.answer)
    await user.click(screen.getByRole('link', { name: 'Document Chat' }))
    vi.mocked(api.askQuestion).mockRejectedValueOnce(
      new api.ApiError('Upload opnieuw.', 'no_document', 404),
    )
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Wat staat er?{Enter}')
    await screen.findByRole('alert')
    await openAgent(user, 'Retourbeoordeling agent')
    expect(screen.queryByText(agentAdvice.answer)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Onderzoek starten' })).toBeDisabled()
  })
})
