import { useState } from 'react'
import { downloadInvoiceJson } from '../invoiceExport'
import type { AssistantActivity, InvoiceResponse, UploadedDocument } from '../types'
import { Sources } from './Sources'
import { ToolActivity } from './ToolActivity'
import { Icon } from './Icon'

interface Props {
  document: UploadedDocument | null
  busy: AssistantActivity
  result: InvoiceResponse | null
  error: string | null
  pdfUrl: string | null
  reviewed: boolean
  onReviewed: (value: boolean) => void
  onAnalyze: (instruction: string) => Promise<boolean>
}
const reviewLabels = {
  validated: 'Uitgevoerde controles geslaagd',
  discrepancy_found: 'Afwijkingen gevonden',
  insufficient_data: 'Gegevens of controles ontbreken',
  error: 'Onderzoek onderbroken',
}
const checkLabels = { passed: 'Geslaagd', failed: 'Afwijking', missing: 'Ontbreekt' }
const show = (value: string | null | undefined) => value ?? 'Niet beschikbaar'

export function InvoicePanel({
  document,
  busy,
  result,
  error,
  pdfUrl,
  reviewed,
  onReviewed,
  onAnalyze,
}: Props) {
  const [instruction, setInstruction] = useState(
    'Analyseer deze fictieve factuur, controleer de berekeningen en vergelijk deze met de bijbehorende inkooporder.',
  )
  const data = result?.invoice_data
  const canExport = !!data && result?.review_status !== 'error'
  return (
    <section className="chat-panel" aria-label="Invoice Processing Agent">
      <div className="chat-toolbar">
        <div>
          <span className={`status-dot ${document ? 'active' : ''}`} />
          {busy === 'invoice'
            ? 'Factuur onderzoeken'
            : document
              ? 'Document beschikbaar'
              : 'Upload een fictieve factuur'}
        </div>
        <span className="context-label">ALLEEN LEZEN</span>
      </div>
      <div className="agent-content invoice-content">
        <div className="agent-intro">
          <h2>
            Van factuur naar controle<span>.</span>
          </h2>
          <p>Extraheer gegevens, controleer bedragen en vergelijk fictieve inkooporders.</p>
        </div>
        <div className="agent-disclaimer">
          <Icon name="book" size={17} />
          <p>
            {result?.disclaimer ??
              'Uitsluitend fictieve testfacturen met het label FICTIEVE TESTFACTUUR. Geen financiële goedkeuring of betalingsactie.'}
          </p>
        </div>
        <form
          className="agent-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onAnalyze(instruction.trim())
          }}
        >
          <label htmlFor="invoice-instruction">Factuuropdracht</label>
          <textarea
            id="invoice-instruction"
            rows={3}
            maxLength={2000}
            value={instruction}
            disabled={busy !== null}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <div className="agent-form-actions">
            <span>Voor alleen het factuurnummer is extractie voldoende.</span>
            <button
              className="agent-submit"
              type="submit"
              disabled={!document || busy !== null || !instruction.trim()}
            >
              <Icon name="sparkle" size={15} />
              {busy === 'invoice' ? 'Factuur analyseren…' : 'Analyseer factuur'}
            </button>
          </div>
        </form>
        {error && (
          <p className="error-banner agent-error" role="alert">
            {error}
          </p>
        )}
        {busy === 'invoice' && (
          <div className="answer-loading" role="status">
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
            De agent voert de gekozen tools uit. Het overzicht verschijnt na afronding.
          </div>
        )}
        {result && (
          <>
            <section className="agent-result" aria-label="Factuurresultaat">
              <div className="agent-result-heading">
                <h3>Factuuronderzoek</h3>
                <span className={`invoice-status ${result.review_status}`}>
                  {reviewLabels[result.review_status]}
                </span>
              </div>
              <p
                className="message-text"
                role={result.review_status === 'error' ? 'alert' : undefined}
              >
                {result.summary}
              </p>
              {data && (
                <>
                  <dl className="invoice-fields">
                    {[
                      ['Factuurnummer', data.invoice_number],
                      ['Leverancier', data.supplier_name],
                      ['Factuurdatum', data.invoice_date],
                      ['Vervaldatum', data.due_date],
                      ['Inkooporder', data.purchase_order_number],
                      ['Valuta', data.currency],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{show(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="invoice-table-scroll">
                    <table className="invoice-table">
                      <caption>Geëxtraheerde factuurregels</caption>
                      <thead>
                        <tr>
                          <th>Product of dienst</th>
                          <th>Aantal</th>
                          <th>Eenheidsprijs</th>
                          <th>Regelbedrag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.line_items.map((line, index) => (
                          <tr key={index}>
                            <td>
                              {show(line.description)}
                              {line.item_code && <small>{line.item_code}</small>}
                            </td>
                            <td>{show(line.quantity)}</td>
                            <td>{show(line.unit_price)}</td>
                            <td>{show(line.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="invoice-fields invoice-totals">
                    {[
                      ['Subtotaal', data.subtotal],
                      ['Btw-percentage', data.tax_rate],
                      ['Btw-bedrag', data.tax_amount],
                      ['Totaalbedrag', data.total_amount],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{show(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              <section className="invoice-checks" aria-label="Validatieresultaten">
                <h3>Uitgevoerde controles</h3>
                {result.validations.length ? (
                  <ul>
                    {result.validations.map((check) => (
                      <li key={check.code}>
                        <div>
                          <strong>{check.message}</strong>
                          <span
                            className={`tool-status ${check.status === 'passed' ? 'success' : 'error'}`}
                          >
                            {checkLabels[check.status]}
                          </span>
                        </div>
                        {(check.expected !== null || check.actual !== null) && (
                          <p>
                            Verwacht: {show(check.expected)} · Aangetroffen: {show(check.actual)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="agent-field-hint">
                    Er zijn nog geen reken- of inkoopordercontroles uitgevoerd.
                  </p>
                )}
              </section>
              <Sources
                sources={result.sources}
                pdfUrl={pdfUrl}
                documentName="BRONNEN UIT DE FACTUUR"
              />
            </section>
            <ToolActivity calls={result.tool_calls} maxCalls={result.tool_call_limit} />
            <div className="invoice-review">
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={!canExport}
                  onChange={(event) => onReviewed(event.target.checked)}
                />{' '}
                Lokaal als gecontroleerd markeren
              </label>
              <p>
                Deze markering blijft alleen in dit browservenster en geeft geen financiële
                goedkeuring.
              </p>
              <button
                className="agent-submit"
                type="button"
                disabled={!canExport}
                onClick={() => downloadInvoiceJson(result, reviewed)}
              >
                Exporteer JSON
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
