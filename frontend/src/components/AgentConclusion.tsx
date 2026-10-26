import { useEffect, useId, useRef } from 'react'

export function AgentConclusion({
  title,
  status,
  summary,
  tone,
}: {
  title: string
  status: string
  summary: string
  tone: 'success' | 'warning' | 'error'
}) {
  const card = useRef<HTMLElement>(null)
  const presented = useRef<string | null>(null)
  const summaryId = useId()
  const resultKey = `${status}:${summary}`

  useEffect(() => {
    // Workspaces stay mounted during navigation; never focus a hidden agent.
    const element = card.current
    if (!element?.getClientRects().length || presented.current === resultKey) return
    element.focus({ preventScroll: true })
    element.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
    presented.current = resultKey
  })

  return (
    <section
      ref={card}
      className={`agent-conclusion ${tone}`}
      aria-label={`Conclusie: ${title}`}
      aria-describedby={summaryId}
      tabIndex={-1}
    >
      <div className="agent-conclusion-heading">
        <h2>{title}</h2>
        <span className="agent-conclusion-status">{status}</span>
      </div>
      <p id={summaryId} className="message-text" role={tone === 'error' ? 'alert' : undefined}>
        {summary}
      </p>
    </section>
  )
}
