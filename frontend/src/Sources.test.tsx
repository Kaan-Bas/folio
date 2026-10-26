import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Sources } from './components/Sources'

const sources = [
  { chunk_id: 'p3-c0', page: 3, text: 'Een controleerbare bronpassage.', score: 0.9 },
]

describe('Source sections', () => {
  it('leaves Document Chat sources directly accessible by default', () => {
    render(<Sources sources={sources} pdfUrl="blob:pdf" />)
    expect(screen.getByText('Pagina 3')).toBeVisible()
    expect(screen.getByText('GEBRUIKTE BRONNEN').closest('details')).toBeNull()
  })

  it('collapses the agent section and preserves page links and fragment state when toggled', async () => {
    const user = userEvent.setup()
    render(
      <Sources sources={sources} pdfUrl="blob:pdf" documentName="Bronnen Document A" collapsible />,
    )
    const toggle = screen.getByText('Bronnen Document A')
    expect(screen.getByText('Pagina 3')).not.toBeVisible()
    await user.click(toggle)
    expect(screen.getByText('Pagina 3')).toBeVisible()
    await user.click(screen.getByText('Pagina 3'))
    expect(screen.getByText(sources[0].text)).toBeVisible()
    expect(screen.getByRole('link', { name: /Open pagina 3/ })).toHaveAttribute(
      'href',
      'blob:pdf#page=3',
    )
    await user.click(toggle)
    expect(screen.getByText(sources[0].text)).not.toBeVisible()
    await user.click(toggle)
    expect(screen.getByText(sources[0].text)).toBeVisible()
  })

  it('omits an empty source section for both display modes', () => {
    const { container, rerender } = render(<Sources sources={[]} pdfUrl={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<Sources sources={[]} pdfUrl={null} collapsible />)
    expect(container).toBeEmptyDOMElement()
  })
})
