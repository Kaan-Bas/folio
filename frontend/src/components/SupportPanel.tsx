import { useState } from 'react'
import type { UploadedDocument } from '../types'
import type { useCustomerSupport } from '../useCustomerSupport'
import { Icon } from './Icon'
import { Sources } from './Sources'
import { SupportReview } from './SupportReview'
import { ToolActivity } from './ToolActivity'
import { AgentConclusion } from './AgentConclusion'

const statuses = {
  completed: 'Conceptanalyse gereed',
  insufficient_information: 'Informatie ontbreekt',
  limit_reached: 'Toollimiet bereikt',
  error: 'Analyse onderbroken',
}
const priorities = { low: 'Laag', medium: 'Normaal', high: 'Hoog', urgent: 'Urgent' }
const basis = {
  model_suggestion: 'Modelsuggestie',
  configured_guideline: 'Geconfigureerde demoregel',
}

export function SupportPanel({
  model,
  document,
  uploading,
  uploadError,
  pdfUrl,
}: {
  model: ReturnType<typeof useCustomerSupport>
  document: UploadedDocument | null
  uploading: boolean
  uploadError: string | null
  pdfUrl: string | null
}) {
  const [message, setMessage] = useState('')
  const [orderId, setOrderId] = useState('')
  const [productId, setProductId] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const disabled = model.busy || uploading
  const result = model.result,
    analysis = result?.analysis
  function changed() {
    model.clearResult()
    setValidation(null)
  }
  async function submit() {
    const order = orderId.trim().toUpperCase(),
      product = productId.trim().toUpperCase()
    if (order && !/^(ORD|DEMO)-\d{4}$/.test(order)) {
      setValidation('Gebruik een fictieve order-ID zoals ORD-1023 of DEMO-1001.')
      return
    }
    if (product && !/^[A-Z]{2,8}-\d{3,4}$/.test(product)) {
      setValidation('Gebruik een product-ID zoals LAP-204 of DOCK-110.')
      return
    }
    if (disabled || !message.trim()) return
    setValidation(null)
    await model.analyze({
      customer_message: message.trim(),
      order_id: order || null,
      product_id: product || null,
    })
  }
  return (
    <section className="chat-panel" aria-label="Klantenservice agent">
      <div className="chat-toolbar">
        <div>
          <span className={`status-dot ${document ? 'active' : ''}`} />
          {model.busy
            ? 'Ticket onderzoeken'
            : document
              ? 'Kennisbank beschikbaar'
              : 'PDF optioneel voor catalogus en richtlijnen'}
        </div>
        <span className="context-label">CONCEPTADVIES</span>
      </div>
      <div className="agent-content support-content">
        {result && (
          <AgentConclusion
            title="Ticketanalyse"
            status={statuses[result.status]}
            summary={
              analysis?.short_summary ??
              result.error?.message ??
              'De ticketanalyse kon niet worden afgerond.'
            }
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
            Van klantvraag naar conceptantwoord<span>.</span>
          </h2>
          <p>
            Laat relevante informatie ophalen en controleer het voorstel voordat je het gebruikt.
          </p>
        </div>
        <div className="agent-disclaimer">
          <Icon name="headset" size={18} />
          <p>
            {result?.disclaimer ??
              'Uitsluitend fictieve gegevens. Categorie, prioriteit en escalatie zijn voorstellen. De agent verzendt geen berichten en wijzigt geen bestellingen.'}
          </p>
        </div>
        <p className="support-note">
          Upload voor bedrijfsvoorwaarden een kennisbank-PDF. Dit is hetzelfde document als in
          Document Chat; een nieuwe upload vervangt het gedeelde document.
        </p>
        <form
          className="agent-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="support-message">Klantbericht</label>
          <textarea
            id="support-message"
            rows={5}
            maxLength={2000}
            value={message}
            disabled={disabled}
            placeholder="Bijvoorbeeld: Ondersteunt product LAP-204 een tweede externe monitor?"
            onChange={(event) => {
              setMessage(event.target.value)
              changed()
            }}
          />
          <div className="support-input-grid">
            <div>
              <label htmlFor="support-order">Order-ID (optioneel)</label>
              <input
                id="support-order"
                maxLength={9}
                value={orderId}
                disabled={disabled}
                placeholder="ORD-1023"
                onChange={(event) => {
                  setOrderId(event.target.value)
                  changed()
                }}
              />
            </div>
            <div>
              <label htmlFor="support-product">Product-ID (optioneel)</label>
              <input
                id="support-product"
                maxLength={13}
                value={productId}
                disabled={disabled}
                placeholder="LAP-204"
                onChange={(event) => {
                  setProductId(event.target.value)
                  changed()
                }}
              />
            </div>
          </div>
          <div className="agent-form-actions">
            <span>De agent kiest alleen de tools die nodig zijn voor dit ticket.</span>
            <button className="agent-submit" type="submit" disabled={disabled || !message.trim()}>
              <Icon name="sparkle" size={15} />
              {model.busy ? 'Ticket analyseren…' : 'Analyseer ticket'}
            </button>
          </div>
        </form>
        {(validation || model.error || uploadError) && (
          <p role="alert" className="error-banner agent-error">
            {validation || model.error || uploadError}
          </p>
        )}
        {model.busy && (
          <div role="status" className="answer-loading">
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
            Informatie ophalen en een conceptanalyse maken…
          </div>
        )}
        {result && (
          <>
            <section className="agent-result" aria-label="Ticketanalyse">
              <h3>Onderbouwing en beoordeling</h3>
              {analysis && (
                <>
                  <dl className="support-facts">
                    <div>
                      <dt>Categorievoorstel</dt>
                      <dd>{analysis.ticket_category}</dd>
                    </div>
                    <div>
                      <dt>Prioriteitsvoorstel</dt>
                      <dd>{priorities[analysis.suggested_priority]}</dd>
                    </div>
                    <div>
                      <dt>Klantintentie</dt>
                      <dd>{analysis.customer_intent}</dd>
                    </div>
                    <div>
                      <dt>Aanbevolen vervolgstap</dt>
                      <dd>{analysis.recommended_next_action}</dd>
                    </div>
                  </dl>
                  <div className="support-guidance">
                    <h4>Onderbouwing prioriteit</h4>
                    <p>{analysis.priority_reason}</p>
                    <span>
                      {basis[analysis.priority_basis]}
                      {analysis.priority_rule_ids.length
                        ? ` · ${analysis.priority_rule_ids.join(', ')}`
                        : ''}
                    </span>
                    <h4>Escalatievoorstel: {analysis.escalation.recommended ? 'Ja' : 'Nee'}</h4>
                    <p>{analysis.escalation.reason}</p>
                    <span>
                      {basis[analysis.escalation.basis]}
                      {analysis.escalation.rule_ids.length
                        ? ` · ${analysis.escalation.rule_ids.join(', ')}`
                        : ''}
                    </span>
                  </div>
                  {analysis.relevant_information.length > 0 && (
                    <div className="support-information">
                      <h4>Opgehaalde informatie</h4>
                      <ul>
                        {analysis.relevant_information.map((item, i) => (
                          <li key={i}>
                            {item.information}
                            <small>{item.reference_ids.join(' · ')}</small>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.missing_information.length > 0 && (
                    <div className="support-information">
                      <h4>Ontbrekende informatie</h4>
                      <ul>
                        {analysis.missing_information.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <SupportReview analysis={analysis} />
                </>
              )}
              <Sources
                sources={result.sources}
                pdfUrl={pdfUrl}
                documentName={result.sources[0]?.filename ?? 'DOCUMENTBRONNEN'}
                collapsible
              />
              {result.data_references.length > 0 && (
                <section className="support-references" aria-label="Geraadpleegde demogegevens">
                  <h4>Geraadpleegde demogegevens</h4>
                  {result.data_references.map((ref) => (
                    <details key={ref.reference_id}>
                      <summary>{ref.label}</summary>
                      <pre>{JSON.stringify(ref.data, null, 2)}</pre>
                    </details>
                  ))}
                </section>
              )}
            </section>
            <ToolActivity calls={result.tool_calls} maxCalls={result.tool_call_limit} />
          </>
        )}
      </div>
    </section>
  )
}
