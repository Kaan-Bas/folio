import { describe, expect, it } from 'vitest'
import { validatePdf } from './validation'

describe('PDF validation', () => {
  it('accepts a PDF with a case-insensitive extension', () => {
    expect(
      validatePdf(new File(['%PDF-test'], 'document.PDF', { type: 'application/pdf' }), 10),
    ).toBeNull()
  })
  it('accepts an absent MIME type but rejects a conflicting type', () => {
    expect(validatePdf(new File(['x'], 'document.pdf'), 10)).toBeNull()
    expect(validatePdf(new File(['x'], 'document.pdf', { type: 'image/png' }), 10)).toContain(
      'PDF-bestand',
    )
  })
  it('rejects the wrong extension and empty files', () => {
    expect(validatePdf(new File(['x'], 'document.txt'), 10)).toContain('.pdf')
    expect(validatePdf(new File([], 'document.pdf'), 10)).toContain('leeg')
  })
  it('allows the exact size boundary and rejects one byte above it', () => {
    expect(validatePdf(new File([new Uint8Array(1024 * 1024)], 'doc.pdf'), 1)).toBeNull()
    expect(validatePdf(new File([new Uint8Array(1024 * 1024 + 1)], 'doc.pdf'), 1)).toContain('1 MB')
  })
})
