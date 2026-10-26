import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as api from './api'
import type { SupportResponse } from './types'
import { openAgent } from './test/navigation'
import { supportResult } from './test/supportFixture'

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  getHealth: vi.fn(),
  uploadDocument: vi.fn(),
  analyzeSupport: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.getHealth).mockResolvedValue({
    status: 'ok',
    configured: true,
    max_upload_mb: 10,
    max_question_chars: 2000,
  })
  vi.mocked(api.uploadDocument).mockResolvedValue({
    document_id: 'support-doc',
    filename: 'kennisbank.pdf',
    page_count: 3,
    text_page_count: 3,
    chunk_count: 5,
  })
  vi.mocked(api.analyzeSupport).mockResolvedValue(supportResult)
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:support-pdf'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

async function open() {
  const user = userEvent.setup()
  render(<App />)
  await openAgent(user, 'Klantenservice agent')
  return user
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText('Klantbericht'),
    'Ondersteunt LAP-204 twee externe monitoren?',
  )
}

async function upload() {
  fireEvent.change(screen.getByLabelText('PDF uploaden'), {
    target: { files: [new File(['%PDF'], 'kennisbank.pdf', { type: 'application/pdf' })] },
  })
  await screen.findByText('kennisbank.pdf')
}

describe('Klantenservice agent', () => {
  it('is registered next to Refund Review without an additional main navigation entry', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'AI Agents' }))
    const category = await screen.findByRole('region', { name: 'E-commerce & klantenservice' })
    expect(within(category).getByRole('link', { name: 'Klantenservice agent' })).toBeVisible()
    expect(within(category).getByRole('link', { name: 'Retourbeoordeling agent' })).toBeVisible()
    expect(
      within(screen.getByRole('list', { name: 'Hoofdonderdelen' })).getAllByRole('listitem'),
    ).toHaveLength(2)
  })

  it('analyzes without a PDF, displays proposals and only genuinely executed tools', async () => {
    const user = await open()
    expect(screen.getByRole('button', { name: 'Analyseer ticket' })).toBeDisabled()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    expect(await screen.findByText(supportResult.analysis!.short_summary)).toBeVisible()
    const conclusion = screen.getByRole('region', { name: 'Conclusie: Ticketanalyse' })
    expect(conclusion.parentElement?.firstElementChild).toBe(conclusion)
    expect(api.analyzeSupport).toHaveBeenCalledWith(
      {
        customer_message: 'Ondersteunt LAP-204 twee externe monitoren?',
        document_id: null,
        order_id: null,
        product_id: null,
      },
      expect.any(AbortSignal),
    )
    await user.click(screen.getByText('Uitgevoerde tools'))
    expect(screen.getByText('Fictieve productinformatie opzoeken')).toBeVisible()
    expect(screen.queryByText('Fictieve bestelling opzoeken')).not.toBeInTheDocument()
    expect(screen.getByText('Controleer aansluitingen en kabels.')).toBeVisible()
    expect(screen.getByLabelText('Voorgestelde ticketcategorie')).toHaveValue('Product Information')
    expect(screen.getByRole('button', { name: 'Kopieer conceptantwoord' })).toBeDisabled()
  })

  it('copies the edited response after human review and resets review on another edit', async () => {
    const user = await open()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    await screen.findByText(supportResult.analysis!.short_summary)
    await user.selectOptions(screen.getByLabelText('Voorgestelde ticketcategorie'), 'Other')
    await user.selectOptions(screen.getByLabelText('Voorgestelde prioriteit'), 'low')
    await user.click(screen.getByLabelText('Escalatie voorstellen'))
    await user.clear(screen.getByLabelText('Conceptantwoord voor de klant'))
    await user.type(
      screen.getByLabelText('Conceptantwoord voor de klant'),
      'Mijn gecontroleerde antwoord.',
    )
    await user.click(
      screen.getByLabelText('Ik heb categorie, prioriteit, escalatie en antwoord gecontroleerd.'),
    )
    await user.click(screen.getByRole('button', { name: 'Kopieer conceptantwoord' }))
    expect(copy).toHaveBeenCalledWith('Mijn gecontroleerde antwoord.')
    expect(await screen.findByText('Conceptantwoord gekopieerd.')).toBeVisible()
    expect(api.analyzeSupport).toHaveBeenCalledTimes(1)
    await user.selectOptions(screen.getByLabelText('Voorgestelde prioriteit'), 'urgent')
    expect(screen.getByRole('button', { name: 'Kopieer conceptantwoord' })).toBeDisabled()
    expect(
      screen.getByLabelText('Ik heb categorie, prioriteit, escalatie en antwoord gecontroleerd.'),
    ).not.toBeChecked()
  })

  it('shows a manual copying instruction if clipboard access fails', async () => {
    const user = await open()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'))
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    await screen.findByText(supportResult.analysis!.short_summary)
    await user.click(
      screen.getByLabelText('Ik heb categorie, prioriteit, escalatie en antwoord gecontroleerd.'),
    )
    await user.click(screen.getByRole('button', { name: 'Kopieer conceptantwoord' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Selecteer en kopieer de tekst handmatig',
    )
  })

  it('passes optional normalized IDs and validates malformed IDs without an API call', async () => {
    const user = await open()
    await fill(user)
    await user.type(screen.getByLabelText('Order-ID (optioneel)'), 'REAL-12')
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('fictieve order-ID')
    expect(api.analyzeSupport).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Order-ID (optioneel)'))
    await user.type(screen.getByLabelText('Order-ID (optioneel)'), 'ord-1023')
    await user.type(screen.getByLabelText('Product-ID (optioneel)'), 'lap-204')
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    expect(await screen.findByText(supportResult.analysis!.short_summary)).toBeVisible()
    expect(api.analyzeSupport).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 'ORD-1023', product_id: 'LAP-204' }),
      expect.any(AbortSignal),
    )
  })

  it('uses the shared PDF and preserves named physical-page sources', async () => {
    vi.mocked(api.analyzeSupport).mockResolvedValueOnce({
      ...supportResult,
      document_id: 'support-doc',
      sources: [
        {
          chunk_id: 'p3-c0',
          reference_id: 'support-doc:p3-c0',
          document_id: 'support-doc',
          filename: 'kennisbank.pdf',
          page: 3,
          text: 'Geopende producten worden beoordeeld.',
          score: 0.8,
        },
      ],
    })
    const user = await open()
    await upload()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    await screen.findByText(supportResult.analysis!.short_summary)
    await user.click(screen.getByText('kennisbank.pdf', { selector: 'span' }))
    await user.click(screen.getByText('Pagina 3'))
    expect(screen.getByRole('link', { name: /Open pagina 3/ })).toHaveAttribute(
      'href',
      'blob:support-pdf#page=3',
    )
    expect(api.analyzeSupport).toHaveBeenCalledWith(
      expect.objectContaining({ document_id: 'support-doc' }),
      expect.any(AbortSignal),
    )
  })

  it('keeps input and local review through library navigation but clears an obsolete result when input changes', async () => {
    const user = await open()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    await screen.findByText(supportResult.analysis!.short_summary)
    await user.type(screen.getByLabelText('Conceptantwoord voor de klant'), ' Extra toelichting.')
    await user.click(
      screen.getByLabelText('Ik heb categorie, prioriteit, escalatie en antwoord gecontroleerd.'),
    )
    await user.click(screen.getByRole('link', { name: 'Terug naar AI Agents' }))
    await user.click(await screen.findByRole('link', { name: 'Klantenservice agent' }))
    await screen.findByRole('heading', { level: 1, name: /^Klantenservice/ })
    expect(screen.getByLabelText('Conceptantwoord voor de klant')).toHaveValue(
      supportResult.analysis!.suggested_customer_response + ' Extra toelichting.',
    )
    expect(
      screen.getByLabelText('Ik heb categorie, prioriteit, escalatie en antwoord gecontroleerd.'),
    ).toBeChecked()
    await user.type(screen.getByLabelText('Klantbericht'), ' Andere vraag.')
    expect(screen.queryByRole('region', { name: 'Ticketanalyse' })).not.toBeInTheDocument()
  })

  it('ignores a late analysis after a new PDF upload', async () => {
    let resolve!: (result: SupportResponse) => void
    vi.mocked(api.analyzeSupport).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const user = await open()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    await upload()
    await act(async () => resolve(supportResult))
    expect(screen.queryByRole('region', { name: 'Ticketanalyse' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyseer ticket' })).toBeEnabled()
  })

  it('shows missing information and guideline provenance without hiding the draft', async () => {
    vi.mocked(api.analyzeSupport).mockResolvedValueOnce({
      ...supportResult,
      status: 'insufficient_information',
      analysis: {
        ...supportResult.analysis!,
        missing_information: ['Verwachte leverdatum is onbekend.'],
        suggested_priority: 'high',
        priority_basis: 'configured_guideline',
        priority_rule_ids: ['delivery-conflict'],
      },
    })
    const user = await open()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    expect(await screen.findByText('Informatie ontbreekt')).toBeVisible()
    expect(screen.getByText('Verwachte leverdatum is onbekend.')).toBeVisible()
    expect(screen.getByText('Geconfigureerde demoregel · delivery-conflict')).toBeVisible()
    expect(screen.getByLabelText('Conceptantwoord voor de klant')).toBeVisible()
  })

  it('shows safe provider errors with actual partial tool activity', async () => {
    vi.mocked(api.analyzeSupport).mockResolvedValueOnce({
      ...supportResult,
      status: 'error',
      analysis: null,
      error: { code: 'provider_rate_limit', message: 'De gebruikslimiet is bereikt.' },
    })
    const user = await open()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('gebruikslimiet')
    await user.click(screen.getByText('Uitgevoerde tools'))
    expect(screen.getByText('Fictieve productinformatie opzoeken')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Kopieer conceptantwoord' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the original customer message after a network error', async () => {
    vi.mocked(api.analyzeSupport).mockRejectedValueOnce(new Error('Backend niet bereikbaar.'))
    const user = await open()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Analyseer ticket' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Backend niet bereikbaar')
    expect(screen.getByLabelText('Klantbericht')).toHaveValue(
      'Ondersteunt LAP-204 twee externe monitoren?',
    )
  })
})
