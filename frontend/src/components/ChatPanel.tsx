import { useEffect, useRef } from 'react'
import type { AssistantActivity, ChatMessage, UploadedDocument } from '../types'
import { Composer } from './Composer'
import { Icon } from './Icon'
import { Sources } from './Sources'

const suggestions = [
  'Wat is het doel van dit document?',
  'Welke conclusies worden genoemd?',
  'Welke aanbevelingen staan er in de tekst?',
]

interface Props {
  document: UploadedDocument | null
  messages: ChatMessage[]
  busy: AssistantActivity
  pdfUrl: string | null
  maxQuestionLength: number
  error: string | null
  onAsk: (question: string) => Promise<boolean>
}

export function ChatPanel({
  document,
  messages,
  busy,
  pdfUrl,
  maxQuestionLength,
  error,
  onAsk,
}: Props) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [messages, busy])

  return (
    <section className="chat-panel" aria-label="Chat over je PDF">
      <div className="chat-toolbar">
        <div>
          <span className={`status-dot ${document ? 'active' : ''}`} />
          {busy === 'upload'
            ? 'Document verwerken'
            : document
              ? 'Verbonden met je document'
              : 'Wacht op een document'}
        </div>
        <span className="context-label">PDF ASSISTENT</span>
      </div>
      <div className="conversation" role="log" aria-label="Gesprek" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-symbol">
              <Icon name="sparkle" size={31} />
            </div>
            <div className="eyebrow">MINDER ZOEKEN, MEER BEGRIJPEN</div>
            <h2>
              {document
                ? 'Je document, uitgelegd.'
                : 'Een goed antwoord begint\nbij jouw document.'}
            </h2>
            <p>
              {document
                ? 'Je PDF is klaar. Stel een gerichte vraag en ontdek wat erin staat, met de bron erbij.'
                : 'Upload een PDF en stel je vraag. Krijg een helder antwoord, met verwijzingen naar de juiste pagina’s.'}
            </p>
            <div className="suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={!document || busy !== null}
                  onClick={() => {
                    void onAsk(suggestion)
                  }}
                >
                  {suggestion}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            {!document && <span className="empty-hint">Begin met een PDF in het linkerpaneel</span>}
          </div>
        )}
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <div className="message-author">
              {message.role === 'assistant' && <Icon name="sparkle" size={15} />}
              {message.role === 'user' ? 'JIJ' : 'FOLIO'}
              {message.insufficientContext && (
                <span className="insufficient-badge">Onvoldoende context</span>
              )}
            </div>
            <p className="message-text">{message.text}</p>
            {message.sources && <Sources sources={message.sources} pdfUrl={pdfUrl} />}
          </article>
        ))}
        {busy === 'answer' && (
          <div className="answer-loading" role="status">
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
            Relevante fragmenten zoeken en antwoord formuleren…
          </div>
        )}
        <div ref={end} />
      </div>
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      <Composer
        key={document?.document_id ?? 'no-document'}
        enabled={!!document && busy !== 'upload'}
        answering={busy === 'answer'}
        maxLength={maxQuestionLength}
        onAsk={onAsk}
      />
    </section>
  )
}
