import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentConclusion } from './components/AgentConclusion'

const props = {
  title: 'Factuuronderzoek',
  status: 'Afwijkingen gevonden',
  summary: 'Het totaal wijkt af.',
  tone: 'warning' as const,
}

function showCard(card: HTMLElement) {
  const rect = new DOMRect(0, 0, 400, 200)
  vi.spyOn(card, 'getClientRects').mockReturnValue(
    Object.assign([rect], {
      item: (index: number) => (index === 0 ? rect : null),
    }),
  )
  card.scrollIntoView = vi.fn()
}

describe('Agent conclusion', () => {
  it('brings a new visible conclusion into view once, and again for a changed answer', () => {
    const { rerender } = render(<AgentConclusion {...props} />)
    const card = screen.getByRole('region', { name: 'Conclusie: Factuuronderzoek' })
    showCard(card)
    rerender(<AgentConclusion {...props} />)
    expect(card).toHaveFocus()
    expect(card.scrollIntoView).toHaveBeenCalledTimes(1)
    rerender(<AgentConclusion {...props} />)
    expect(card.scrollIntoView).toHaveBeenCalledTimes(1)
    rerender(<AgentConclusion {...props} summary="Een nieuw conceptresultaat." />)
    expect(card.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('does not steal focus for a hidden retained workspace, but presents the result when shown', () => {
    const { rerender } = render(
      <>
        <button>Andere werkruimte</button>
        <AgentConclusion {...props} />
      </>,
    )
    const button = screen.getByRole('button')
    button.focus()
    rerender(
      <>
        <button>Andere werkruimte</button>
        <AgentConclusion {...props} />
      </>,
    )
    expect(button).toHaveFocus()
    const card = screen.getByRole('region', { name: 'Conclusie: Factuuronderzoek' })
    showCard(card)
    rerender(
      <>
        <button>Andere werkruimte</button>
        <AgentConclusion {...props} />
      </>,
    )
    expect(card).toHaveFocus()
  })

  it('avoids smooth scrolling when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const { rerender } = render(<AgentConclusion {...props} />)
    const card = screen.getByRole('region', { name: 'Conclusie: Factuuronderzoek' })
    showCard(card)
    rerender(<AgentConclusion {...props} />)
    expect(card.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })
})
