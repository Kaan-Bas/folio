import { useState } from 'react'
import { Icon } from './Icon'

export function Composer({
  enabled,
  answering,
  maxLength,
  onAsk,
}: {
  enabled: boolean
  answering: boolean
  maxLength: number
  onAsk: (question: string) => Promise<boolean>
}) {
  const [question, setQuestion] = useState('')
  async function submit() {
    if (!enabled || answering || !question.trim()) return
    if (await onAsk(question)) setQuestion('')
  }

  return (
    <div className="composer-area">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="visually-hidden" htmlFor="question">
          Je vraag over de PDF
        </label>
        <textarea
          id="question"
          rows={2}
          maxLength={maxLength}
          value={question}
          disabled={!enabled || answering}
          placeholder={
            enabled
              ? 'Wat wil je weten over dit document?'
              : 'Upload een PDF om een vraag te stellen…'
          }
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <div className="composer-bottom">
          <span>
            {question.length
              ? `${question.length} / ${maxLength}`
              : 'Enter om te versturen · Shift + Enter voor een nieuwe regel'}
          </span>
          <button
            type="submit"
            className="send-button"
            aria-label="Vraag versturen"
            disabled={!enabled || answering || !question.trim()}
          >
            <Icon name="arrow" size={19} />
          </button>
        </div>
      </form>
      <p className="composer-note">
        AI kan fouten maken. Controleer de bronfragmenten bij het antwoord.
      </p>
    </div>
  )
}
