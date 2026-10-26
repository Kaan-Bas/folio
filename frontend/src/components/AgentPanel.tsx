import { useState } from 'react'
import type { AgentResponse, AssistantActivity, UploadedDocument } from '../types'
import { Icon } from './Icon'
import { Sources } from './Sources'
import { ToolActivity } from './ToolActivity'
import { AgentConclusion } from './AgentConclusion'

interface Props {
  document: UploadedDocument | null
  busy: AssistantActivity
  result: AgentResponse | null
  error: string | null
  pdfUrl: string | null
  onRun: (orderId: string | null, instruction: string) => Promise<boolean>
}

const resultStatuses = {
  completed: 'Onderzoek afgerond',
  insufficient_information: 'Informatie ontbreekt',
  limit_reached: 'Toollimiet bereikt',
  error: 'Onderzoek onderbroken',
}

export function AgentPanel({ document, busy, result, error, pdfUrl, onRun }: Props) {
  const [orderId, setOrderId] = useState('')
  const [instruction, setInstruction] = useState(
    'Onderzoek of deze fictieve bestelling volgens het geüploade retourbeleid in aanmerking komt voor retour. Geef een onderbouwd conceptadvies.',
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const disabled = !document || busy !== null

  async function submit() {
    const normalizedId = orderId.trim().toUpperCase()
    if (normalizedId && !/^DEMO-\d{4}$/.test(normalizedId)) {
      setValidationError('Gebruik een fictieve order-ID zoals DEMO-1001, of laat het veld leeg.')
      return
    }
    if (disabled || !instruction.trim()) return
    setValidationError(null)
    await onRun(normalizedId || null, instruction.trim())
  }

  return (
    <section className="chat-panel" aria-label="Retourbeoordeling agent">
      <div className="chat-toolbar">
        <div>
          <span className={`status-dot ${document ? 'active' : ''}`} />
          {busy === 'agent'
            ? 'Retourverzoek onderzoeken'
            : document
              ? 'Beleid beschikbaar'
              : 'Upload eerst een retourbeleid'}
        </div>
        <span className="context-label">ALLEEN LEZEN</span>
      </div>
      <div className="agent-content">
        {result && (
          <AgentConclusion
            title="Conceptadvies"
            status={resultStatuses[result.status]}
            summary={result.answer}
            tone={
              result.status === 'error'
                ? 'error'
                : result.status === 'completed'
                  ? 'success'
                  : 'warning'
            }
          />
        )}
        <div className="agent-intro">
          <h2>
            Onderzoek een retourverzoek<span>.</span>
          </h2>
          <p>
            De agent kiest de benodigde tools, raadpleegt je document en onderzoekt fictieve
            bestelgegevens.
          </p>
        </div>
        <div className="agent-disclaimer">
          <Icon name="book" size={17} />
          <p>
            {result?.disclaimer ??
              'Uitsluitend conceptadvies met fictieve gegevens. Geen definitief terugbetalingsbesluit; de agent wijzigt niets en voert geen terugbetalingen uit.'}
          </p>
        </div>
        <form
          className="agent-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="agent-order">
            Fictieve order-ID <span>(optioneel)</span>
          </label>
          <input
            id="agent-order"
            value={orderId}
            disabled={disabled}
            maxLength={9}
            placeholder="DEMO-1001"
            autoComplete="off"
            aria-describedby="agent-order-hint"
            onChange={(event) => setOrderId(event.target.value)}
          />
          <p id="agent-order-hint" className="agent-field-hint">
            Voorbeelden: DEMO-1001, DEMO-1002 en DEMO-1003. Laat leeg voor een vraag over alleen het
            beleid.
          </p>
          <label htmlFor="agent-instruction">Opdracht</label>
          <textarea
            id="agent-instruction"
            rows={3}
            value={instruction}
            disabled={disabled}
            maxLength={2000}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <div className="agent-form-actions">
            <span>Upload refund_policy.pdf als beleidsbron</span>
            <button
              type="submit"
              className="agent-submit"
              disabled={disabled || !instruction.trim()}
            >
              <Icon name="sparkle" size={15} />{' '}
              {busy === 'agent' ? 'Bezig met onderzoeken…' : 'Onderzoek starten'}
            </button>
          </div>
        </form>
        {(validationError || error) && (
          <p role="alert" className="error-banner agent-error">
            {validationError || error}
          </p>
        )}
        {busy === 'agent' && (
          <div role="status" className="answer-loading">
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
            De agent onderzoekt je opdracht. Uitgevoerde tools verschijnen na afronding.
          </div>
        )}
        {result && (
          <>
            {result.sources.length > 0 && (
              <section className="agent-result" aria-label="Bronnen bij het conceptadvies">
                <Sources sources={result.sources} pdfUrl={pdfUrl} collapsible />
              </section>
            )}
            <ToolActivity calls={result.tool_calls} />
          </>
        )}
      </div>
    </section>
  )
}
