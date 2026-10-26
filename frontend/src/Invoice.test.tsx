import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openAgent } from './test/navigation'
import * as api from './api'
import { downloadInvoiceJson } from './invoiceExport'
import type { InvoiceResponse } from './types'

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  getHealth: vi.fn(),
  uploadDocument: vi.fn(),
  analyzeInvoice: vi.fn(),
}))
vi.mock('./invoiceExport', async (original) => ({
  ...(await original<typeof import('./invoiceExport')>()),
  downloadInvoiceJson: vi.fn(),
}))

const result: InvoiceResponse = {
  document_id: 'doc-1',
  filename: 'invoice.pdf',
  summary: 'De uitgevoerde controles zijn geslaagd.',
  review_status: 'validated',
  error: null,
  disclaimer: 'Technisch conceptresultaat. Geen financiële goedkeuring.',
  tool_call_limit: 7,
  sources: [{ chunk_id: 'q1', page: 2, text: 'Totaalbedrag: 399.30', score: 0 }],
  tool_calls: [
    {
      sequence: 1,
      name: 'extract_invoice_data',
      status: 'success',
      message: 'Factuurgegevens gelezen.',
    },
  ],
  invoice_data: {
    invoice_number: 'INV-DEMO-001',
    supplier_name: 'Nexora Demo Supplies B.V.',
    invoice_date: '2026-10-21',
    due_date: '2026-11-20',
    purchase_order_number: 'PO-DEMO-1001',
    currency: 'EUR',
    line_items: [
      {
        item_code: 'CHAIR-01',
        description: 'Bureaustoel',
        quantity: '2',
        unit_price: '125.00',
        line_total: '250.00',
      },
    ],
    subtotal: '330.00',
    tax_rate: '21',
    tax_amount: '69.30',
    total_amount: '399.30',
  },
  validations: [
    {
      code: 'total_amount',
      stage: 'totals',
      status: 'passed',
      expected: '399.30',
      actual: '399.30',
      message: 'Totaalcontrole uitgevoerd.',
    },
  ],
  discrepancies: [],
}

beforeEach(() => {
  vi.mocked(api.getHealth).mockResolvedValue({
    status: 'ok',
    configured: true,
    max_upload_mb: 10,
    max_question_chars: 2000,
  })
  vi.mocked(api.uploadDocument).mockResolvedValue({
    document_id: 'doc-1',
    filename: 'invoice.pdf',
    page_count: 2,
    text_page_count: 1,
    chunk_count: 2,
  })
  vi.mocked(api.analyzeInvoice).mockResolvedValue(result)
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:invoice'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

async function upload() {
  fireEvent.change(screen.getByLabelText('PDF uploaden'), {
    target: { files: [new File(['%PDF'], 'invoice.pdf', { type: 'application/pdf' })] },
  })
  await screen.findByText('invoice.pdf')
}

async function open() {
  const user = userEvent.setup()
  render(<App />)
  await openAgent(user, 'Invoice Processing Agent')
  return user
}

describe('Invoice Processing', () => {
  it('places collapsible checks below the sources and lets users toggle checks and tools', async () => {
    const user = await open()
    await upload()
    await user.click(screen.getByRole('button', { name: 'Analyseer factuur' }))
    await screen.findByText(result.summary)
    const checksToggle = screen.getByText('Uitgevoerde controles')
    const toolsToggle = screen.getByText('Uitgevoerde tools')
    const sources = screen.getByText('Bronnen uit de factuur')
    expect(
      sources.compareDocumentPosition(checksToggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('Totaalcontrole uitgevoerd.')).not.toBeVisible()
    expect(screen.getByText('Factuurgegevens extraheren')).not.toBeVisible()
    await user.click(checksToggle)
    expect(screen.getByText('Totaalcontrole uitgevoerd.')).toBeVisible()
    await user.click(checksToggle)
    expect(screen.getByText('Totaalcontrole uitgevoerd.')).not.toBeVisible()
    await user.click(toolsToggle)
    expect(screen.getByText('Factuurgegevens extraheren')).toBeVisible()
    await user.click(toolsToggle)
    expect(screen.getByText('Factuurgegevens extraheren')).not.toBeVisible()
  })

  it('uses the existing upload and shows extracted fields, checks, sources and genuine activity', async () => {
    const user = await open()
    expect(screen.getByRole('button', { name: 'Analyseer factuur' })).toBeDisabled()
    await upload()
    await user.click(screen.getByRole('button', { name: 'Analyseer factuur' }))
    expect(await screen.findByText(result.summary)).toBeInTheDocument()
    const conclusion = screen.getByRole('region', { name: 'Conclusie: Factuuronderzoek' })
    expect(conclusion.parentElement?.firstElementChild).toBe(conclusion)
    expect(screen.getByText('INV-DEMO-001')).toBeInTheDocument()
    expect(screen.getByText('Totaalcontrole uitgevoerd.')).toBeInTheDocument()
    expect(screen.getByText('Factuurgegevens extraheren')).toBeInTheDocument()
    expect(screen.queryByText('Fictieve inkooporder ophalen')).not.toBeInTheDocument()
    await user.click(screen.getByText('Bronnen uit de factuur'))
    await user.click(screen.getByText('Pagina 2'))
    expect(screen.getByRole('link', { name: /Open pagina 2/ })).toHaveAttribute(
      'href',
      'blob:invoice#page=2',
    )
    expect(api.analyzeInvoice).toHaveBeenCalledWith(
      'doc-1',
      expect.stringContaining('fictieve factuur'),
      expect.any(AbortSignal),
    )
  })

  it('keeps local human review separate from financial approval and exports canonical data', async () => {
    const user = await open()
    await upload()
    await user.click(screen.getByRole('button', { name: 'Analyseer factuur' }))
    await screen.findByText(result.summary)
    await user.click(screen.getByLabelText('Lokaal als gecontroleerd markeren'))
    await user.click(screen.getByRole('button', { name: 'Exporteer JSON' }))
    expect(downloadInvoiceJson).toHaveBeenCalledWith(result, true)
    await user.click(screen.getByRole('link', { name: 'Document Chat' }))
    await openAgent(user, 'Invoice Processing Agent')
    expect(screen.getByLabelText('Lokaal als gecontroleerd markeren')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Analyseer factuur' }))
    await screen.findByText(result.summary)
    expect(screen.getByLabelText('Lokaal als gecontroleerd markeren')).not.toBeChecked()
  })

  it('shows missing values and discrepancies without substituting zeros', async () => {
    vi.mocked(api.analyzeInvoice).mockResolvedValueOnce({
      ...result,
      review_status: 'insufficient_data',
      invoice_data: { ...result.invoice_data!, due_date: null, tax_rate: null },
      validations: [
        {
          code: 'field.tax_rate',
          stage: 'extraction',
          status: 'missing',
          expected: 'aanwezig',
          actual: null,
          message: 'Btw-percentage ontbreekt.',
        },
      ],
    })
    const user = await open()
    await upload()
    await user.click(screen.getByRole('button', { name: 'Analyseer factuur' }))
    expect(await screen.findByText('Gegevens of controles ontbreken')).toBeInTheDocument()
    expect(screen.getAllByText('Niet beschikbaar').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Btw-percentage ontbreekt.')).toBeInTheDocument()
  })

  it('ignores a late invoice result after the document has been replaced', async () => {
    let resolve!: (value: InvoiceResponse) => void
    vi.mocked(api.analyzeInvoice).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    const user = await open()
    await upload()
    await user.click(screen.getByRole('button', { name: 'Analyseer factuur' }))
    vi.mocked(api.uploadDocument).mockResolvedValueOnce({
      document_id: 'doc-2',
      filename: 'new.pdf',
      page_count: 1,
      text_page_count: 1,
      chunk_count: 1,
    })
    fireEvent.change(screen.getByLabelText('PDF uploaden'), {
      target: { files: [new File(['%PDF'], 'new.pdf', { type: 'application/pdf' })] },
    })
    await screen.findByText('new.pdf')
    await act(async () => {
      resolve(result)
    })
    expect(screen.queryByText(result.summary)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exporteer JSON' })).not.toBeInTheDocument()
  })

  it('shows safe errors and prevents exports when processing has failed', async () => {
    vi.mocked(api.analyzeInvoice).mockResolvedValueOnce({
      ...result,
      review_status: 'error',
      invoice_data: null,
      summary: 'Gebruik een fictieve testfactuur.',
      error: { code: 'not_demo_invoice', message: 'Gebruik een fictieve testfactuur.' },
    })
    const user = await open()
    await upload()
    await user.click(screen.getByRole('button', { name: 'Analyseer factuur' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('fictieve testfactuur')
    expect(screen.getByRole('button', { name: 'Exporteer JSON' })).toBeDisabled()
  })
})
