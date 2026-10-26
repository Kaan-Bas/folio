import { useEffect, useRef, useState } from 'react'
import { analyzeSupport } from './api'
import type { SupportRequest, SupportResponse } from './types'

export function useCustomerSupport(documentId: string | null, uploading: boolean) {
  const [result, setResult] = useState<SupportResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const active = useRef<AbortController | null>(null)

  useEffect(() => {
    ++generation.current
    active.current?.abort()
    setResult(null)
    setError(null)
    setBusy(false)
    return () => {
      ++generation.current
      active.current?.abort()
    }
  }, [documentId, uploading])

  function clearResult() {
    setResult(null)
    setError(null)
  }

  async function analyze(ticket: Omit<SupportRequest, 'document_id'>) {
    if (busy || uploading) return
    const current = ++generation.current
    const controller = new AbortController()
    active.current?.abort()
    active.current = controller
    clearResult()
    setBusy(true)
    try {
      const next = await analyzeSupport({ ...ticket, document_id: documentId }, controller.signal)
      if (current === generation.current) setResult(next)
    } catch (failure) {
      if (current === generation.current && !controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'Het ticket kon niet worden geanalyseerd.',
        )
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  return { result, busy, error, clearResult, analyze }
}
