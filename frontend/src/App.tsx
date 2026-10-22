import { useEffect, useState } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { AgentPanel } from './components/AgentPanel'
import { Icon } from './components/Icon'
import { UploadPanel } from './components/UploadPanel'
import { useAssistant } from './useAssistant'

export default function App() {
  const assistant = useAssistant()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<'chat' | 'agent'>('chat')

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
      <header className="app-header">
        <a className="brand" href="/" aria-label="Folio startpagina">
          <span className="brand-mark">
            <Icon name="book" size={23} />
          </span>
          <span>
            folio<span className="brand-period">.</span>
          </span>
        </a>
        <span className="header-divider" />
        <span className="header-description">Jouw documenten. Heldere antwoorden.</span>
        <span className="project-badge">PDF KNOWLEDGE ASSISTANT</span>
      </header>
      <main>
        <div className="page-heading">
          <h1>
            Ga in gesprek met je PDF<span>.</span>
          </h1>
          <div className="mode-switch" role="group" aria-label="Assistentmodus">
            <button
              type="button"
              aria-pressed={mode === 'chat'}
              disabled={assistant.busy !== null}
              onClick={() => setMode('chat')}
            >
              Document Chat
            </button>
            <button
              type="button"
              aria-pressed={mode === 'agent'}
              disabled={assistant.busy !== null}
              onClick={() => setMode('agent')}
            >
              AI Agent
            </button>
          </div>
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
        <div className="workspace">
          <UploadPanel
            document={assistant.document}
            uploading={assistant.busy === 'upload'}
            maxMb={assistant.health?.max_upload_mb ?? 10}
            onUpload={assistant.upload}
          />
          {mode === 'chat' ? (
            <ChatPanel
              document={assistant.document}
              messages={assistant.messages}
              busy={assistant.busy}
              pdfUrl={pdfUrl}
              maxQuestionLength={assistant.health?.max_question_chars ?? 2000}
              error={assistant.error}
              onAsk={assistant.ask}
            />
          ) : (
            <AgentPanel
              key={assistant.document?.document_id ?? 'no-document'}
              document={assistant.document}
              busy={assistant.busy}
              result={assistant.agentResult}
              error={assistant.error}
              pdfUrl={pdfUrl}
              onRun={assistant.investigate}
            />
          )}
        </div>
        <footer className="app-footer">
          <span>Gebouwd om informatie begrijpelijk te maken.</span>
          <span>Upload → zoeken → onderbouwd antwoord</span>
        </footer>
      </main>
    </div>
  )
}
