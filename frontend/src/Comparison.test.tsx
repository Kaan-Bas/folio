import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openAgent } from './test/navigation'
import * as api from './api'
import type { ComparisonPair, ComparisonResponse } from './types'

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  getHealth: vi.fn(),
  uploadComparison: vi.fn(),
  compareDocuments: vi.fn(),
}))

const pair: ComparisonPair = {
  comparison_id: 'pair-id',
  document_a: {
    document_id: 'a-id',
    filename: 'old.pdf',
    page_count: 2,
    text_page_count: 2,
    chunk_count: 2,
  },
  document_b: {
    document_id: 'b-id',
    filename: 'new.pdf',
    page_count: 2,
    text_page_count: 2,
    chunk_count: 2,
  },
}
const report: ComparisonResponse = {
  status: 'completed',
  summary: 'De retourtermijn is verruimd.',
  scope: 'focused',
  all_passages_retrieved: false,
  coverage_note: 'Dit is geen volledige documentvergelijking.',
  tool_call_limit: 12,
  error: null,
  coverage: [pair.document_a, pair.document_b].map((doc) => ({
    document_id: doc.document_id,
    filename: doc.filename,
    total_passages: 2,
    retrieved_passages: 1,
    examined_pages: [1],
  })),
  findings: [
    {
      topic: 'Retourtermijn',
      change_type: 'modified',
      proposed_change_type: 'modified',
      old_situation: '14 dagen.',
      new_situation: '30 dagen.',
      explanation: 'Meer tijd voor de aanvraag.',
      insufficient_evidence: false,
      evidence_note: 'Bronnen uit beide documenten beschikbaar.',
      sources_a: [
        {
          chunk_id: 'p1-c0',
          document_id: 'a-id',
          reference_id: 'a-id:p1-c0',
          filename: 'old.pdf',
          page: 1,
          text: 'Oude termijn: 14 dagen.',
          score: 0.8,
        },
      ],
      sources_b: [
        {
          chunk_id: 'p2-c0',
          document_id: 'b-id',
          reference_id: 'b-id:p2-c0',
          filename: 'new.pdf',
          page: 2,
          text: 'Nieuwe termijn: 30 dagen.',
          score: 0.9,
        },
      ],
    },
  ],
  tool_calls: [
    {
      sequence: 1,
      name: 'search_document',
      document_label: 'A',
      status: 'success',
      message: 'Passage uit A gevonden.',
    },
    {
      sequence: 2,
      name: 'search_document',
      document_label: 'B',
      status: 'success',
      message: 'Passage uit B gevonden.',
    },
  ],
}

beforeEach(() => {
  vi.mocked(api.getHealth).mockResolvedValue({
    status: 'ok',
    configured: true,
    max_upload_mb: 10,
    max_question_chars: 2000,
  })
  vi.mocked(api.uploadComparison).mockResolvedValue(pair)
  vi.mocked(api.compareDocuments).mockResolvedValue(report)
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

async function openComparison() {
  const user = userEvent.setup()
  render(<App />)
  await openAgent(user, 'Document Comparison Agent')
  return user
}

function select(slot: 'A' | 'B', name: string, type = 'application/pdf') {
  fireEvent.change(screen.getByLabelText(`Document ${slot}`), {
    target: {
      files: [new File(['%PDF-test'], name, { type })],
    },
  })
}

async function uploadBoth(user: ReturnType<typeof userEvent.setup>) {
  select('A', 'old.pdf')
  select('B', 'new.pdf')
  await user.click(screen.getByRole('button', { name: 'Documenten verwerken' }))
  await screen.findByText('Beide documenten zijn klaar voor vergelijking.')
}

describe('Document Comparison', () => {
  it('requires two valid PDF uploads and renders evidence for the correct original files', async () => {
    const user = await openComparison()
    expect(screen.getByRole('button', { name: 'Vergelijk documenten' })).toBeDisabled()
    select('A', 'old.pdf')
    expect(screen.getByRole('button', { name: 'Documenten verwerken' })).toBeDisabled()
    select('B', 'new.pdf')
    await user.click(screen.getByRole('button', { name: 'Documenten verwerken' }))
    await screen.findByText('Beide documenten zijn klaar voor vergelijking.')
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    expect(await screen.findByText(report.summary)).toBeInTheDocument()
    const conclusion = screen.getByRole('region', { name: 'Conclusie: Vergelijkingsrapport' })
    expect(conclusion.parentElement?.firstElementChild).toBe(conclusion)
    expect(screen.getByText('Gewijzigd')).toBeInTheDocument()
    expect(screen.getByText(report.coverage_note)).toBeInTheDocument()
    expect(screen.getByText('Document doorzoeken · Document A')).toBeInTheDocument()
    expect(screen.getByText('Document doorzoeken · Document B')).toBeInTheDocument()
    expect(screen.queryByText('Documentstructuur bekijken')).not.toBeInTheDocument()
    await user.click(screen.getByText('Bronnen Document A'))
    await user.click(screen.getByText('Bronnen Document B'))
    await user.click(screen.getByText('Pagina 1'))
    await user.click(screen.getByText('Pagina 2'))
    expect(screen.getByRole('link', { name: /Open pagina 1/ })).toHaveAttribute(
      'href',
      'blob:old.pdf#page=1',
    )
    expect(screen.getByRole('link', { name: /Open pagina 2/ })).toHaveAttribute(
      'href',
      'blob:new.pdf#page=2',
    )
    expect(api.compareDocuments).toHaveBeenCalledWith(
      pair,
      expect.any(String),
      'focused',
      expect.any(AbortSignal),
    )
  })

  it('rejects invalid files and does not send an upload', async () => {
    const user = await openComparison()
    select('A', 'wrong.txt', 'text/plain')
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF-bestand')
    expect(screen.getByRole('button', { name: 'Documenten verwerken' })).toBeDisabled()
    expect(api.uploadComparison).not.toHaveBeenCalled()
    await user.click(screen.getByRole('link', { name: 'Document Chat' }))
    expect(screen.getByLabelText('Je vraag over de PDF')).toBeDisabled()
  })

  it('passes broad scope without claiming full coverage and displays uncertain findings', async () => {
    vi.mocked(api.compareDocuments).mockResolvedValueOnce({
      ...report,
      status: 'partial',
      findings: [
        {
          ...report.findings[0],
          change_type: 'uncertain',
          proposed_change_type: 'added',
          insufficient_evidence: true,
          sources_a: [],
          evidence_note: 'Onvoldoende bewijs; afwezigheid is niet vastgesteld.',
        },
      ],
    })
    const user = await openComparison()
    await uploadBoth(user)
    await user.selectOptions(screen.getByLabelText('Omvang'), 'broad')
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    expect(await screen.findByText('Onzeker')).toBeInTheDocument()
    expect(
      screen.getByText('Onvoldoende bewijs; afwezigheid is niet vastgesteld.'),
    ).toBeInTheDocument()
    expect(api.compareDocuments).toHaveBeenCalledWith(
      pair,
      expect.any(String),
      'broad',
      expect.any(AbortSignal),
    )
  })

  it('clears the previous report and pair when either file changes', async () => {
    const user = await openComparison()
    await uploadBoth(user)
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    await screen.findByText(report.summary)
    select('B', 'replacement.pdf')
    expect(screen.queryByText(report.summary)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vergelijk documenten' })).toBeDisabled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:new.pdf')
  })

  it('ignores a late report after a replacement file is selected', async () => {
    let resolveReport!: (value: ComparisonResponse) => void
    vi.mocked(api.compareDocuments).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReport = resolve
      }),
    )
    const user = await openComparison()
    await uploadBoth(user)
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    expect(screen.getByRole('link', { name: 'Document Chat' })).toHaveAttribute('href', '#/chat')
    select('A', 'replacement.pdf')
    await act(async () => {
      resolveReport(report)
    })
    expect(screen.queryByText(report.summary)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vergelijk documenten' })).toBeDisabled()
  })

  it('shows partial activity for quota or tool-budget failures', async () => {
    vi.mocked(api.compareDocuments).mockResolvedValueOnce({
      ...report,
      status: 'limit_reached',
      findings: [],
      summary: 'Het toolbudget is bereikt.',
      error: { code: 'tool_limit', message: 'Toollimiet bereikt.' },
    })
    const user = await openComparison()
    await uploadBoth(user)
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    expect(await screen.findByText('Het toolbudget is bereikt.')).toBeInTheDocument()
    expect(screen.getByText('Document doorzoeken · Document A')).toBeInTheDocument()
    expect(screen.queryByText('Gewijzigd')).not.toBeInTheDocument()
  })

  it('keeps comparison state when switching to other features and back', async () => {
    const user = await openComparison()
    await uploadBoth(user)
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    await screen.findByText(report.summary)
    await openAgent(user, 'Refund Review Agent')
    expect(screen.getByRole('button', { name: 'Onderzoek starten' })).toBeDisabled()
    await openAgent(user, 'Document Comparison Agent')
    expect(screen.getByText(report.summary)).toBeInTheDocument()
  })

  it('handles backend errors without losing the instruction and requires reupload for stale pairs', async () => {
    const user = await openComparison()
    await uploadBoth(user)
    vi.mocked(api.compareDocuments).mockRejectedValueOnce(new Error('Backend niet bereikbaar.'))
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Backend niet bereikbaar')
    expect(screen.getByLabelText('Vergelijkingsopdracht')).not.toHaveValue('')
    vi.mocked(api.compareDocuments).mockResolvedValueOnce({
      ...report,
      status: 'error',
      findings: [],
      summary: 'Upload beide documenten opnieuw.',
      error: { code: 'comparison_replaced', message: 'Vervangen.' },
    })
    await user.click(screen.getByRole('button', { name: 'Vergelijk documenten' }))
    expect(await screen.findByText('Upload beide documenten opnieuw.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vergelijk documenten' })).toBeDisabled()
  })
})
