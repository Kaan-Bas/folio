import { useEffect, useRef, useState } from 'react'
import { compareDocuments, uploadComparison } from './api'
import type { ComparisonPair, ComparisonResponse, ComparisonScope } from './types'
import { validatePdf } from './validation'

export function useComparison(maxMb: number) {
  const [files, setFiles] = useState<[File | null, File | null]>([null, null])
  const [pdfUrls, setPdfUrls] = useState<[string | null, string | null]>([null, null])
  const [pair, setPair] = useState<ComparisonPair | null>(null)
  const [result, setResult] = useState<ComparisonResponse | null>(null)
  const [instruction, setInstruction] = useState(
    'Vergelijk de belangrijkste voorwaarden en leg uit wat er is gewijzigd.',
  )
  const [scope, setScope] = useState<ComparisonScope>('focused')
  const [busy, setBusy] = useState<'upload' | 'compare' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const version = useRef(0)
  const active = useRef<AbortController | null>(null)

  useEffect(() => {
    const urls = files.map((file) => (file ? URL.createObjectURL(file) : null)) as [
      string | null,
      string | null,
    ]
    setPdfUrls(urls)
    return () =>
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
  }, [files])
  useEffect(
    () => () => {
      active.current?.abort()
      version.current += 1
    },
    [],
  )

  function selectFile(slot: 0 | 1, file: File | null) {
    version.current += 1
    active.current?.abort()
    setBusy(null)
    setPair(null)
    setResult(null)
    const validation = file ? validatePdf(file, maxMb) : null
    setError(validation)
    setFiles((old) => {
      const next: [File | null, File | null] = [...old]
      next[slot] = validation ? null : file
      return next
    })
  }

  async function upload() {
    if (!files[0] || !files[1] || busy) return
    const validation = validatePdf(files[0], maxMb) || validatePdf(files[1], maxMb)
    if (validation) {
      setError(validation)
      return
    }
    const current = ++version.current
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setPair(null)
    setResult(null)
    setError(null)
    setBusy('upload')
    try {
      const uploaded = await uploadComparison(files[0], files[1], controller.signal)
      if (version.current === current) setPair(uploaded)
    } catch (failure) {
      if (version.current === current && !controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'De documenten konden niet worden verwerkt.',
        )
    } finally {
      if (version.current === current) setBusy(null)
    }
  }

  async function compare() {
    if (!pair || busy || !instruction.trim()) return
    const current = ++version.current
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setResult(null)
    setError(null)
    setBusy('compare')
    try {
      const response = await compareDocuments(pair, instruction.trim(), scope, controller.signal)
      if (version.current !== current) return
      setResult(response)
      if (
        response.error &&
        ['no_comparison', 'comparison_replaced', 'document_mismatch'].includes(response.error.code)
      )
        setPair(null)
    } catch (failure) {
      if (version.current === current && !controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'De vergelijking kon niet worden afgerond.',
        )
    } finally {
      if (version.current === current) setBusy(null)
    }
  }
  return {
    files,
    pdfUrls,
    pair,
    result,
    instruction,
    setInstruction,
    scope,
    setScope,
    busy,
    error,
    selectFile,
    upload,
    compare,
  }
}
