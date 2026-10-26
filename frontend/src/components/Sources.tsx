import type { Source } from '../types'
import { Icon } from './Icon'

export function Sources({
  sources,
  pdfUrl,
  documentName,
  collapsible = false,
}: {
  sources: Source[]
  pdfUrl: string | null
  documentName?: string
  collapsible?: boolean
}) {
  if (!sources.length) return null
  const label = documentName ?? 'GEBRUIKTE BRONNEN'
  const fragments = sources.map((source) => (
    <details key={source.chunk_id} className="source">
      <summary>
        Pagina {source.page}
        <span>
          Bekijk fragment <span aria-hidden="true">↗</span>
        </span>
      </summary>
      <div className="source-content">
        <blockquote>{source.text}</blockquote>
        {pdfUrl && (
          <a href={`${pdfUrl}#page=${source.page}`} target="_blank" rel="noreferrer">
            Open pagina {source.page} in PDF <Icon name="external" size={13} />
          </a>
        )}
      </div>
    </details>
  ))
  return (
    <div className="sources">
      {collapsible ? (
        <details className="agent-disclosure">
          <summary>
            <span>{label}</span>
            <span className="disclosure-count">{sources.length}</span>
            <Icon name="chevron" size={16} />
          </summary>
          <div className="agent-disclosure-content">{fragments}</div>
        </details>
      ) : (
        <>
          <div className="sources-label">
            <Icon name="file" size={14} /> {label}
          </div>
          {fragments}
        </>
      )}
    </div>
  )
}
