import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as api from './api'
import { agentCategories, agents, groupAgents } from './agents'
import type { AgentDefinition } from './agents'
import { AgentLibrary } from './components/AgentLibrary'
import { parseRoute, routeHref } from './navigation'
import { openAgent } from './test/navigation'
import type { AgentResponse } from './types'

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  getHealth: vi.fn(),
  uploadDocument: vi.fn(),
  investigateReturn: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.getHealth).mockResolvedValue({
    status: 'ok',
    configured: true,
    max_upload_mb: 10,
    max_question_chars: 2000,
  })
  vi.mocked(api.uploadDocument).mockResolvedValue({
    document_id: 'session-doc',
    filename: 'beleid.pdf',
    page_count: 2,
    text_page_count: 2,
    chunk_count: 3,
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:session'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

async function upload() {
  fireEvent.change(screen.getByLabelText('PDF uploaden'), {
    target: { files: [new File(['%PDF'], 'beleid.pdf', { type: 'application/pdf' })] },
  })
  await screen.findByText('beleid.pdf')
}

describe('Folio navigation', () => {
  it('keeps Document Chat directly accessible outside the agent library', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('link', { name: 'Document Chat' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('region', { name: 'Chat over je PDF' })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'AI Agents' }))
    expect(await screen.findByRole('heading', { level: 1, name: /^AI Agents/ })).toBeVisible()
    expect(screen.getByRole('link', { name: 'AI Agents' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('region', { name: 'Chat over je PDF' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Document Chat' }))
    expect(await screen.findByRole('region', { name: 'Chat over je PDF' })).toBeVisible()
  })

  it('groups every existing agent under its category and leaves chat outside those categories', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'AI Agents' }))
    for (const category of agentCategories) {
      const section = await screen.findByRole('region', { name: category.name })
      const expected = agents.filter((a) => a.category === category.id)
      expect(within(section).getAllByRole('link')).toHaveLength(expected.length)
      for (const agent of expected) {
        expect(within(section).getByRole('link', { name: agent.name })).toHaveAttribute(
          'href',
          `#/agents/${agent.id}`,
        )
      }
      expect(within(section).queryByText('Document Chat')).not.toBeInTheDocument()
    }
  })

  it.each(agents)('opens the existing $name workspace from its card', async (agent) => {
    const user = userEvent.setup()
    render(<App />)
    await openAgent(user, agent.name)
    const regionNames = {
      comparison: 'Document Comparison Agent',
      refund: 'AI Agent voor retouronderzoek',
      invoice: 'Invoice Processing Agent',
      support: 'Customer Support Agent',
    }
    expect(screen.getByRole('region', { name: regionNames[agent.screen] })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    const category = agentCategories.find((c) => c.id === agent.category)!
    expect(
      within(screen.getByRole('navigation', { name: 'Agentcategorieën' })).getByRole('link', {
        name: category.name,
      }),
    ).toHaveAttribute('aria-current', 'location')
    expect(screen.getByRole('link', { name: 'AI Agents' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('link', { name: 'AI Agents' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    await user.click(screen.getByRole('link', { name: 'Terug naar AI Agents' }))
    expect(await screen.findByRole('link', { name: agents[0].name })).toBeVisible()
  })

  it('filters categories from the sidebar and can restore the complete library', async () => {
    const user = userEvent.setup()
    render(<App />)
    const name = 'Finance & Administration'
    await user.click(screen.getByRole('link', { name }))
    expect(await screen.findByRole('link', { name: 'Invoice Processing Agent' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Refund Review Agent' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('link', { name: 'AI Agents' }))
    expect(await screen.findByRole('link', { name: 'Refund Review Agent' })).toBeVisible()
  })

  it('switches agents directly and restores browser back and forward navigation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAgent(user, 'Document Comparison Agent')
    await user.selectOptions(screen.getByLabelText('Agent wisselen'), 'invoice-processing')
    await screen.findByRole('heading', { level: 1, name: /^Invoice Processing Agent/ })
    act(() => window.history.back())
    await screen.findByRole('heading', { level: 1, name: /^Document Comparison Agent/ })
    act(() => window.history.forward())
    await screen.findByRole('heading', { level: 1, name: /^Invoice Processing Agent/ })
    expect(window.location.hash).toBe('#/agents/invoice-processing')
  })

  it('opens an agent through its direct URL', () => {
    window.history.replaceState(null, '', '#/agents/refund-review')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /^Refund Review Agent/ })).toBeVisible()
  })

  it('preserves uploads, chat drafts and agent drafts when navigating between workspaces', async () => {
    const user = userEvent.setup()
    render(<App />)
    await upload()
    await user.type(screen.getByLabelText('Je vraag over de PDF'), 'Mijn conceptvraag')
    await openAgent(user, 'Refund Review Agent')
    await user.type(screen.getByLabelText(/Fictieve order-ID/), 'DEMO-1002')
    await user.clear(screen.getByLabelText('Opdracht'))
    await user.type(screen.getByLabelText('Opdracht'), 'Bewaar deze retourvraag')
    await user.selectOptions(screen.getByLabelText('Agent wisselen'), 'invoice-processing')
    await screen.findByRole('heading', { level: 1, name: /^Invoice Processing Agent/ })
    await user.clear(screen.getByLabelText('Factuuropdracht'))
    await user.type(screen.getByLabelText('Factuuropdracht'), 'Bewaar deze factuurvraag')
    await user.click(screen.getByRole('link', { name: 'Document Chat' }))
    await screen.findByRole('region', { name: 'Chat over je PDF' })
    expect(screen.getByLabelText('Je vraag over de PDF')).toHaveValue('Mijn conceptvraag')
    await openAgent(user, 'Refund Review Agent')
    expect(screen.getByLabelText(/Fictieve order-ID/)).toHaveValue('DEMO-1002')
    expect(screen.getByLabelText('Opdracht')).toHaveValue('Bewaar deze retourvraag')
    await openAgent(user, 'Invoice Processing Agent')
    expect(screen.getByLabelText('Factuuropdracht')).toHaveValue('Bewaar deze factuurvraag')
    expect(api.uploadDocument).toHaveBeenCalledTimes(1)
    expect(screen.getByText('beleid.pdf')).toBeVisible()
  })

  it('preserves both comparison file inputs, the scope and instruction through library navigation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAgent(user, 'Document Comparison Agent')
    const a = new File(['%PDF'], 'oud.pdf', { type: 'application/pdf' })
    const b = new File(['%PDF'], 'nieuw.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Document A'), { target: { files: [a] } })
    fireEvent.change(screen.getByLabelText('Document B'), { target: { files: [b] } })
    await user.selectOptions(screen.getByLabelText('Omvang'), 'broad')
    await user.clear(screen.getByLabelText('Vergelijkingsopdracht'))
    await user.type(screen.getByLabelText('Vergelijkingsopdracht'), 'Vergelijk thuiswerkdagen')
    await user.click(screen.getByRole('link', { name: 'Terug naar AI Agents' }))
    await user.click(await screen.findByRole('link', { name: 'Document Comparison Agent' }))
    await screen.findByRole('heading', { level: 1, name: /^Document Comparison Agent/ })
    expect((screen.getByLabelText('Document A') as HTMLInputElement).files?.[0]).toBe(a)
    expect((screen.getByLabelText('Document B') as HTMLInputElement).files?.[0]).toBe(b)
    expect(screen.getByLabelText('Omvang')).toHaveValue('broad')
    expect(screen.getByLabelText('Vergelijkingsopdracht')).toHaveValue('Vergelijk thuiswerkdagen')
  })

  it('keeps a pending investigation alive when visiting the library', async () => {
    let resolve!: (result: AgentResponse) => void
    vi.mocked(api.investigateReturn).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await upload()
    await openAgent(user, 'Refund Review Agent')
    await user.click(screen.getByRole('button', { name: 'Onderzoek starten' }))
    await user.click(screen.getByRole('link', { name: 'Terug naar AI Agents' }))
    await screen.findByRole('link', { name: 'Refund Review Agent' })
    await act(async () =>
      resolve({
        answer: 'Conceptadvies blijft bewaard.',
        sources: [],
        tool_calls: [],
        status: 'completed',
        error: null,
        concept_advice: true,
        disclaimer: 'Geen definitief besluit.',
      }),
    )
    await user.click(screen.getByRole('link', { name: 'Refund Review Agent' }))
    expect(await screen.findByText('Conceptadvies blijft bewaard.')).toBeVisible()
  })

  it('supports keyboard activation of the collapsible navigation and closes it after choosing a link', async () => {
    const user = userEvent.setup()
    render(<App />)
    const toggle = screen.getByRole('button', { name: 'Navigatie openen' })
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Navigatie sluiten' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await user.click(screen.getByRole('link', { name: 'AI Agents' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Navigatie openen' })).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    )
  })

  it('moves focus with the skip link without changing the current agent route', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAgent(user, 'Invoice Processing Agent')
    await user.click(screen.getByRole('link', { name: 'Naar inhoud' }))
    expect(screen.getByRole('main')).toHaveFocus()
    expect(window.location.hash).toBe('#/agents/invoice-processing')
  })
})

describe('agent registration and routes', () => {
  it('automatically includes a newly registered agent in the correct library category', () => {
    const extra: AgentDefinition = {
      id: 'example-agent',
      name: 'Example Agent',
      description: 'Alleen voor deze registratietest.',
      category: 'general-productivity',
      icon: 'file',
      screen: 'comparison',
    }
    const available = [...agents, extra]
    render(<AgentLibrary available={available} />)
    const group = screen.getByRole('region', { name: 'General & Productivity' })
    expect(within(group).getByRole('link', { name: extra.name })).toHaveAttribute(
      'href',
      '#/agents/example-agent',
    )
    expect(groupAgents(available).map((c) => c.displayOrder)).toEqual([1, 2, 3])
    expect(agents).toHaveLength(4)
  })

  it.each([
    '',
    '#/chat',
    '#/agents/unknown',
    '#/agents/category/unknown',
    '#/agents/../../anything',
  ])('falls back to Document Chat for %s', (hash) => {
    expect(parseRoute(hash)).toEqual({ view: 'chat' })
  })

  it('roundtrips every registered agent and category through a direct URL', () => {
    for (const agent of agents) {
      const route = { view: 'agent' as const, agentId: agent.id }
      expect(parseRoute(routeHref(route))).toEqual(route)
    }
    for (const category of agentCategories) {
      const route = { view: 'library' as const, category: category.id }
      expect(parseRoute(routeHref(route))).toEqual(route)
    }
  })
})
