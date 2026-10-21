import type { Source } from '../types'
import { Icon } from './Icon'

export function Sources({ sources, pdfUrl }: { sources: Source[]; pdfUrl: string | null }) {
  if (!sources.length) return null
  return (
    <div className="sources">
      <div className="sources-label">
        <Icon name="file" size={14} /> GEBRUIKTE BRONNEN
      </div>
      {sources.map((source) => (
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
      ))}
    </div>
  )
}
