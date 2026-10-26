import type { AgentToolCall } from '../types'
import { Icon } from './Icon'

const labels: Record<string, string> = {
  search_policy: 'Retourbeleid doorzoeken',
  get_order_details: 'Fictieve bestelling opzoeken',
  calculate_days_between: 'Kalenderdagen berekenen',
  unknown_tool: 'Onbekende tool',
  list_document_sections: 'Documentstructuur bekijken',
  search_document: 'Document doorzoeken',
  get_document_passage: 'Bronpassage controleren',
  extract_invoice_data: 'Factuurgegevens extraheren',
  get_purchase_order: 'Fictieve inkooporder ophalen',
  validate_invoice_totals: 'Factuurbedragen controleren',
  compare_invoice_with_order: 'Factuur met inkooporder vergelijken',
  search_knowledge_base: 'Kennisbank doorzoeken',
  get_product_information: 'Fictieve productinformatie opzoeken',
  get_support_guidelines: 'Supportrichtlijnen raadplegen',
}
const statuses = {
  success: 'Geslaagd',
  not_found: 'Niet gevonden',
  error: 'Fout',
  blocked: 'Geblokkeerd',
}

export function ToolActivity({
  calls,
  maxCalls = 5,
}: {
  calls: AgentToolCall[]
  maxCalls?: number
}) {
  return (
    <section className="agent-tools" aria-label="Uitgevoerde tools">
      <details className="agent-disclosure">
        <summary>
          <span>Uitgevoerde tools</span>
          <span className="disclosure-count">
            {calls.length} / {maxCalls}
          </span>
          <Icon name="chevron" size={16} />
        </summary>
        <div className="agent-disclosure-content">
          {calls.length ? (
            <ol>
              {calls.map((call) => (
                <li key={call.sequence}>
                  <div>
                    <strong>
                      {labels[call.name] ?? 'Tool'}
                      {call.document_label ? ` · Document ${call.document_label}` : ''}
                    </strong>
                    <span className={`tool-status ${call.status}`}>{statuses[call.status]}</span>
                  </div>
                  <p>{call.message}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="agent-field-hint">Er zijn geen tools uitgevoerd.</p>
          )}
        </div>
      </details>
    </section>
  )
}
