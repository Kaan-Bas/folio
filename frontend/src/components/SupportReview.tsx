import { useState } from 'react'
import { supportCategories } from '../types'
import type { SupportAnalysis, SupportCategory, SupportPriority } from '../types'

const priorities: Record<SupportPriority, string> = {
  low: 'Laag',
  medium: 'Normaal',
  high: 'Hoog',
  urgent: 'Urgent',
}

export function SupportReview({ analysis }: { analysis: SupportAnalysis }) {
  const [category, setCategory] = useState(analysis.ticket_category)
  const [priority, setPriority] = useState(analysis.suggested_priority)
  const [response, setResponse] = useState(analysis.suggested_customer_response)
  const [escalate, setEscalate] = useState(analysis.escalation.recommended)
  const [reviewed, setReviewed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  function changed() {
    setReviewed(false)
    setCopied(false)
    setCopyError(null)
  }
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(response.trim())
      setCopied(true)
      setCopyError(null)
    } catch {
      setCopyError('Kopiëren lukt niet. Selecteer en kopieer de tekst handmatig.')
    }
  }
  return (
    <section className="support-review agent-form" aria-label="Menselijke beoordeling">
      <h3>Beoordeel het voorstel</h3>
      <p className="support-note">
        Pas categorie, prioriteit, escalatie en conceptantwoord zo nodig aan. Wijzigingen en de
        reviewmarkering blijven lokaal in dit venster.
      </p>
      <div className="support-input-grid">
        <div>
          <label htmlFor="support-category">Voorgestelde ticketcategorie</label>
          <select
            id="support-category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as SupportCategory)
              changed()
            }}
          >
            {supportCategories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="support-priority">Voorgestelde prioriteit</label>
          <select
            id="support-priority"
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value as SupportPriority)
              changed()
            }}
          >
            {Object.entries(priorities).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="support-checkbox">
        <input
          type="checkbox"
          checked={escalate}
          onChange={(event) => {
            setEscalate(event.target.checked)
            changed()
          }}
        />
        Escalatie voorstellen
      </label>
      <label htmlFor="support-response">Conceptantwoord voor de klant</label>
      <textarea
        id="support-response"
        rows={7}
        maxLength={4000}
        value={response}
        onChange={(event) => {
          setResponse(event.target.value)
          changed()
        }}
      />
      <label className="support-checkbox">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => {
            setReviewed(event.target.checked)
            setCopied(false)
          }}
        />
        Ik heb categorie, prioriteit, escalatie en antwoord gecontroleerd.
      </label>
      <div className="agent-form-actions">
        <span>
          De kopieerknop kopieert alleen het bewerkte klantantwoord. Er wordt niets verzonden.
        </span>
        <button
          className="agent-submit"
          type="button"
          disabled={!reviewed || !response.trim()}
          onClick={() => void copy()}
        >
          Kopieer conceptantwoord
        </button>
      </div>
      {copied && (
        <p role="status" className="support-note">
          Conceptantwoord gekopieerd.
        </p>
      )}
      {copyError && (
        <p role="alert" className="error-banner">
          {copyError}
        </p>
      )}
    </section>
  )
}
