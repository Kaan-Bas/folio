import type { ChangeType } from '../types'
import type { useComparison } from '../useComparison'
import { Icon } from './Icon'
import { Sources } from './Sources'
import { ToolActivity } from './ToolActivity'

const changeLabels: Record<ChangeType, string> = {
  modified: 'Gewijzigd',
  added: 'Toegevoegd',
  removed: 'Verwijderd',
  unchanged: 'Ongewijzigd',
  uncertain: 'Onzeker',
}
const statuses = {
  completed: 'Rapport afgerond',
  partial: 'Gedeeltelijk onderbouwd',
  insufficient_information: 'Informatie ontbreekt',
  limit_reached: 'Toollimiet bereikt',
  error: 'Vergelijking onderbroken',
}

export function ComparisonPanel({ model: c }: { model: ReturnType<typeof useComparison> }) {
  return (
    <div className="workspace comparison-workspace">
      <aside className="sidebar comparison-sidebar">
        <h2>Twee documenten</h2>
        <p className="muted sidebar-intro">
          A is de oude of oorspronkelijke versie. B is de nieuwe versie.
        </p>
        {([0, 1] as const).map((slot) => (
          <div className="comparison-file" key={slot}>
            <label htmlFor={`comparison-file-${slot}`}>Document {slot === 0 ? 'A' : 'B'}</label>
            <input
              id={`comparison-file-${slot}`}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => {
                c.selectFile(slot, event.currentTarget.files?.[0] ?? null)
              }}
            />
            <span>{c.files[slot]?.name ?? 'Nog geen PDF geselecteerd'}</span>
          </div>
        ))}
        <button
          className="agent-submit"
          type="button"
          disabled={!c.files[0] || !c.files[1] || c.busy !== null}
          onClick={() => {
            void c.upload()
          }}
        >
          {c.busy === 'upload' ? 'Documenten verwerken…' : 'Documenten verwerken'}
        </button>
        {c.pair && (
          <p className="comparison-ready" role="status">
            Beide documenten zijn klaar voor vergelijking.
          </p>
        )}
        <form
          className="agent-form comparison-form"
          onSubmit={(event) => {
            event.preventDefault()
            void c.compare()
          }}
        >
          <label htmlFor="comparison-instruction">Vergelijkingsopdracht</label>
          <textarea
            id="comparison-instruction"
            rows={5}
            maxLength={2000}
            value={c.instruction}
            disabled={c.busy !== null}
            onChange={(event) => c.setInstruction(event.target.value)}
          />
          <label htmlFor="comparison-scope">Omvang</label>
          <select
            id="comparison-scope"
            value={c.scope}
            disabled={c.busy !== null}
            onChange={(event) => c.setScope(event.target.value as 'focused' | 'broad')}
          >
            <option value="focused">Gerichte vergelijking</option>
            <option value="broad">Zo breed mogelijk</option>
          </select>
          <p className="agent-field-hint">
            Een brede opdracht blijft begrensd door het tool- en contextbudget. Volledige
            inhoudelijke dekking is niet gegarandeerd.
          </p>
          <button
            className="agent-submit"
            type="submit"
            disabled={!c.pair || c.busy !== null || !c.instruction.trim()}
          >
            <Icon name="sparkle" size={15} />
            {c.busy === 'compare' ? 'Vergelijken…' : 'Vergelijk documenten'}
          </button>
        </form>
      </aside>
      <section className="chat-panel" aria-label="Document Comparison Agent">
        <div className="chat-toolbar">
          <div>
            <span className={`status-dot ${c.pair ? 'active' : ''}`} />
            {c.busy === 'compare'
              ? 'Documenten onderzoeken'
              : c.pair
                ? 'Twee documentindexen beschikbaar'
                : 'Upload Document A en B'}
          </div>
          <span className="context-label">DOCUMENT COMPARISON</span>
        </div>
        <div className="agent-content comparison-content">
          {c.error && (
            <p role="alert" className="error-banner agent-error">
              {c.error}
            </p>
          )}
          {c.busy && (
            <div role="status" className="answer-loading">
              <span className="loading-dots">
                <i />
                <i />
                <i />
              </span>
              {c.busy === 'upload'
                ? 'PDF-tekst lezen en twee afzonderlijke indexen maken.'
                : 'De agent onderzoekt beide documenten. Het tooloverzicht verschijnt na afronding.'}
            </div>
          )}
          {!c.result && !c.busy && (
            <div className="empty-state comparison-empty">
              <div className="empty-symbol">
                <Icon name="book" size={30} />
              </div>
              <h2>Twee versies, helder vergeleken.</h2>
              <p>
                Vergelijk voorwaarden, afspraken of instructies. Onderzoek wijzigingen met
                controleerbare bronnen uit beide PDF's.
              </p>
              <span className="comparison-empty-note">
                Niet gevonden betekent niet automatisch toegevoegd of verwijderd.
              </span>
            </div>
          )}
          {c.result && (
            <>
              <section aria-label="Vergelijkingsrapport" className="comparison-report">
                <div className="agent-result-heading">
                  <h2>Vergelijkingsrapport</h2>
                  <span className={`agent-status ${c.result.status}`}>
                    {statuses[c.result.status]}
                  </span>
                </div>
                <p
                  className="message-text"
                  role={c.result.status === 'error' ? 'alert' : undefined}
                >
                  {c.result.summary}
                </p>
                <div className="comparison-coverage">
                  <strong>Onderzochte documentinhoud</strong>
                  <p>{c.result.coverage_note}</p>
                  {c.result.coverage.map((doc, index) => (
                    <p key={doc.document_id}>
                      Document {index === 0 ? 'A' : 'B'} · {doc.filename}: {doc.retrieved_passages}{' '}
                      van {doc.total_passages} passages opgehaald. Pagina's:{' '}
                      {doc.examined_pages.join(', ') || 'geen'}.
                    </p>
                  ))}
                </div>
                {c.result.findings.map((finding, index) => (
                  <article className="comparison-finding" key={index}>
                    <div className="agent-result-heading">
                      <h3>{finding.topic}</h3>
                      <span className={`change-type ${finding.change_type}`}>
                        {changeLabels[finding.change_type]}
                      </span>
                    </div>
                    <div className="comparison-sides">
                      <div>
                        <h4>Document A · Oude situatie</h4>
                        <p>{finding.old_situation}</p>
                        <Sources
                          sources={finding.sources_a}
                          pdfUrl={c.pdfUrls[0]}
                          documentName="Bronnen Document A"
                        />
                      </div>
                      <div>
                        <h4>Document B · Nieuwe situatie</h4>
                        <p>{finding.new_situation}</p>
                        <Sources
                          sources={finding.sources_b}
                          pdfUrl={c.pdfUrls[1]}
                          documentName="Bronnen Document B"
                        />
                      </div>
                    </div>
                    <p className="comparison-explanation">{finding.explanation}</p>
                    <p
                      className={`evidence-note ${finding.insufficient_evidence ? 'uncertain' : ''}`}
                    >
                      {finding.evidence_note}
                    </p>
                  </article>
                ))}
              </section>
              <ToolActivity calls={c.result.tool_calls} maxCalls={c.result.tool_call_limit} />
            </>
          )}
        </div>
      </section>
    </div>
  )
}
