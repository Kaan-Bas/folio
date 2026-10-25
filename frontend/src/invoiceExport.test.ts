import { describe, expect, it } from 'vitest'
import { buildInvoiceExport } from './invoiceExport'
import type { InvoiceResponse } from './types'

export const invoiceResult: InvoiceResponse = {
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

describe('invoice JSON export', () => {
  it('preserves canonical decimal strings, nulls, checks and sources without financial approval', () => {
    const result = {
      ...invoiceResult,
      invoice_data: { ...invoiceResult.invoice_data!, due_date: null },
    }
    const exported = JSON.parse(JSON.stringify(buildInvoiceExport(result, true)))
    expect(exported.invoice_data.total_amount).toBe('399.30')
    expect(exported.invoice_data.due_date).toBeNull()
    expect(exported.validations).toEqual(result.validations)
    expect(exported.sources).toEqual(result.sources)
    expect(exported.human_reviewed).toBe(true)
    expect(exported.financial_approval).toBe(false)
    expect(exported.payment_executed).toBe(false)
    expect(result).not.toHaveProperty('human_reviewed')
  })
  it('rejects failed or missing extraction instead of exporting invented data', () => {
    expect(() => buildInvoiceExport({ ...invoiceResult, invoice_data: null }, false)).toThrow()
    expect(() => buildInvoiceExport({ ...invoiceResult, review_status: 'error' }, false)).toThrow()
  })
})
