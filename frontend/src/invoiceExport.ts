import type { InvoiceResponse } from './types'

export function buildInvoiceExport(result: InvoiceResponse, humanReviewed: boolean) {
  if (!result.invoice_data || result.review_status === 'error')
    throw new Error('Er is geen exporteerbaar extractieresultaat.')
  return {
    schema_version: 'folio.invoice.v1',
    ...result,
    human_reviewed: humanReviewed,
    financial_approval: false,
    payment_executed: false,
  }
}

export function downloadInvoiceJson(result: InvoiceResponse, humanReviewed: boolean) {
  const data = buildInvoiceExport(result, humanReviewed)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const name = (result.invoice_data?.invoice_number ?? 'extractie')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 70)
  link.href = url
  link.download = `folio-invoice-${name}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
