import { useEffect, useRef, useState } from 'react'
import { agentCategories, agents, groupAgents } from './agents'
import { AgentLibrary } from './components/AgentLibrary'
import { AppNavigation } from './components/AppNavigation'
import { ChatPanel } from './components/ChatPanel'
import { InvoicePanel } from './components/InvoicePanel'
import { AgentPanel } from './components/AgentPanel'
import { Icon } from './components/Icon'
import { UploadPanel } from './components/UploadPanel'
import { useAssistant } from './useAssistant'
import { useComparison } from './useComparison'
import { ComparisonPanel } from './components/ComparisonPanel'
import { routeHref, useNavigation } from './navigation'
import { useCustomerSupport } from './useCustomerSupport'
import { SupportPanel } from './components/SupportPanel'

export default function App() {
  const assistant = useAssistant()
  const comparison = useComparison(assistant.health?.max_upload_mb ?? 10)
  const support = useCustomerSupport(
    assistant.document?.document_id ?? null,
    assistant.busy === 'upload',
  )
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const route = useNavigation()
  const activeAgent = route.view === 'agent' ? agents.find((a) => a.id === route.agentId) : null
  const category = agentCategories.find((c) => c.id === activeAgent?.category)
  const screen = activeAgent?.screen
  const path = routeHref(route)
  const previousPath = useRef(path)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (previousPath.current !== path) heading.current?.focus({ preventScroll: true })
    previousPath.current = path
  }, [path])

  useEffect(() => {
    if (!assistant.file) {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(assistant.file)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [assistant.file])

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Naar inhoud
      </a>
      <header className="app-header">
        <a className="brand" href="#/chat" aria-label="Folio startpagina">
          <span className="brand-mark">
            <Icon name="book" size={23} />
          </span>
          <span>
            folio<span className="brand-period">.</span>
          </span>
        </a>
        <span className="header-divider" />
        <span className="header-description">Document intelligence & workflow automation</span>
        <span className="project-badge">JOUW DOCUMENTEN. MEER INZICHT.</span>
      </header>
      <div className="app-layout">
        <AppNavigation route={route} />
        <main id="main-content" className="app-main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              {activeAgent && category ? (
                <div className="agent-breadcrumb">
                  <a href="#/agents">
                    <Icon name="back" size={15} />
                    Terug naar AI Agents
                  </a>
                  <span aria-hidden="true">/</span>
                  <a href={routeHref({ view: 'library', category: category.id })}>
                    {category.name}
                  </a>
                </div>
              ) : (
                <p className="page-eyebrow">
                  {route.view === 'chat' ? 'DOCUMENT CHAT' : 'AGENT LIBRARY'}
                </p>
              )}
              <h1 ref={heading} tabIndex={-1}>
                {activeAgent
                  ? activeAgent.name
                  : route.view === 'library'
                    ? 'AI Agents'
                    : 'Ga in gesprek met je PDF'}
                <span>.</span>
              </h1>
            </div>
            {activeAgent && (
              <div className="agent-switcher">
                <label htmlFor="agent-switcher">Agent wisselen</label>
                <select
                  id="agent-switcher"
                  value={activeAgent.id}
                  onChange={(event) => {
                    const next = agents.find((a) => a.id === event.target.value)
                    if (next) window.location.hash = routeHref({ view: 'agent', agentId: next.id })
                  }}
                >
                  {groupAgents().map((group) => (
                    <optgroup key={group.id} label={group.name}>
                      {group.agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
          </div>
          {assistant.connectionError && (
            <div role="alert" className="configuration-banner">
              {assistant.connectionError}
            </div>
          )}
          {assistant.health && !assistant.health.configured && (
            <div role="status" className="configuration-banner">
              De LLM is nog niet ingesteld. Configureer de API-sleutel in de backend en herstart de
              backend om antwoorden te genereren. Embeddings worden lokaal gemaakt.
            </div>
          )}
          {route.view === 'library' && <AgentLibrary category={route.category} />}
          {/* Keep workspaces mounted so navigation preserves drafts and selected files. */}
          <div hidden={screen !== 'comparison'}>
            <ComparisonPanel model={comparison} />
          </div>
          <div
            className="workspace"
            hidden={
              route.view !== 'chat' &&
              screen !== 'refund' &&
              screen !== 'invoice' &&
              screen !== 'support'
            }
          >
            <UploadPanel
              document={assistant.document}
              uploading={assistant.busy === 'upload'}
              maxMb={assistant.health?.max_upload_mb ?? 10}
              onUpload={assistant.upload}
            />
            <div className="workspace-panel" hidden={route.view !== 'chat'}>
              <ChatPanel
                document={assistant.document}
                messages={assistant.messages}
                busy={assistant.busy}
                pdfUrl={pdfUrl}
                maxQuestionLength={assistant.health?.max_question_chars ?? 2000}
                error={assistant.error}
                onAsk={assistant.ask}
              />
            </div>
            <div className="workspace-panel" hidden={screen !== 'invoice'}>
              <InvoicePanel
                document={assistant.document}
                busy={assistant.busy}
                result={assistant.invoiceResult}
                error={assistant.error}
                pdfUrl={pdfUrl}
                reviewed={assistant.invoiceReviewed}
                onReviewed={assistant.setInvoiceReviewed}
                onAnalyze={assistant.processInvoice}
              />
            </div>
            <div className="workspace-panel" hidden={screen !== 'refund'}>
              <AgentPanel
                key={assistant.document?.document_id ?? 'no-document'}
                document={assistant.document}
                busy={assistant.busy}
                result={assistant.agentResult}
                error={assistant.error}
                pdfUrl={pdfUrl}
                onRun={assistant.investigate}
              />
            </div>
            <div className="workspace-panel" hidden={screen !== 'support'}>
              <SupportPanel
                model={support}
                document={assistant.document}
                uploading={assistant.busy === 'upload'}
                uploadError={assistant.error}
                pdfUrl={pdfUrl}
              />
            </div>
          </div>
          <footer className="app-footer">
            <span>Gebouwd om informatie begrijpelijk te maken.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
