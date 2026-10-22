import { useState } from 'react'
import type { AgentResponse, AssistantActivity, UploadedDocument } from '../types'
import { Icon } from './Icon'
import { Sources } from './Sources'

interface Props {
  document: UploadedDocument | null
  busy: AssistantActivity
  result: AgentResponse | null
  error: string | null
  pdfUrl: string | null
  onRun: (orderId: string | null, instruction: string) => Promise<boolean>
}

const toolLabels: Record<string, string> = {
  search_policy: 'Retourbeleid doorzoeken',
  get_order_details: 'Fictieve bestelling opzoeken',
  calculate_days_between: 'Kalenderdagen berekenen',
  unknown_tool: 'Onbekende tool',
}
const toolStatuses = {
  success: 'Geslaagd',
  not_found: 'Niet gevonden',
  error: 'Fout',
  blocked: 'Geblokkeerd',
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
    <section className="chat-panel" aria-label="AI Agent voor retouronderzoek">
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
            <section className="agent-result" aria-label="Conceptadvies">
              <div className="agent-result-heading">
                <h3>Conceptadvies</h3>
                <span className={`agent-status ${result.status}`}>
                  {resultStatuses[result.status]}
                </span>
              </div>
              <p className="message-text" role={result.status === 'error' ? 'alert' : undefined}>
                {result.answer}
              </p>
              <Sources sources={result.sources} pdfUrl={pdfUrl} />
            </section>
            <section className="agent-tools" aria-label="Uitgevoerde tools">
              <h3>
                Uitgevoerde tools <span>{result.tool_calls.length} / 5</span>
              </h3>
              {result.tool_calls.length ? (
                <ol>
                  {result.tool_calls.map((call) => (
                    <li key={call.sequence}>
                      <div>
                        <strong>{toolLabels[call.name] ?? 'Tool'}</strong>
                        <span className={`tool-status ${call.status}`}>
                          {toolStatuses[call.status]}
                        </span>
                      </div>
                      <p>{call.message}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="agent-field-hint">Er zijn geen tools uitgevoerd.</p>
              )}
            </section>
          </>
        )}
      </div>
    </section>
  )
}
