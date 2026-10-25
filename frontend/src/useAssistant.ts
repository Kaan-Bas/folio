import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  analyzeInvoice,
  askQuestion,
  getHealth,
  investigateReturn,
  uploadDocument,
} from './api'
import type {
  AgentResponse,
  InvoiceResponse,
  AssistantActivity,
  ChatMessage,
  HealthResponse,
  UploadedDocument,
} from './types'
import { validatePdf } from './validation'

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Er ging iets mis. Probeer opnieuw.'
}

export function useAssistant() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [document, setDocument] = useState<UploadedDocument | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState<AssistantActivity>(null)
  const [agentResult, setAgentResult] = useState<AgentResponse | null>(null)
  const [invoiceResult, setInvoiceResult] = useState<InvoiceResponse | null>(null)
  const [invoiceReviewed, setInvoiceReviewed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal)
      .then(setHealth)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setConnectionError(messageFrom(failure))
      })
    return () => {
      controller.abort()
      activeRequest.current?.abort()
      generation.current += 1
    }
  }, [])

  async function upload(nextFile: File): Promise<void> {
    const validation = validatePdf(nextFile, health?.max_upload_mb ?? 10)
    if (validation) {
      setError(validation)
      return
    }
    const version = ++generation.current
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setDocument(null)
    setFile(null)
    setMessages([])
    setInvoiceResult(null)
    setInvoiceReviewed(false)
    setAgentResult(null)
    setError(null)
    setBusy('upload')
    try {
      const uploaded = await uploadDocument(nextFile, controller.signal)
      if (generation.current !== version) return
      setDocument(uploaded)
      setFile(nextFile)
      setConnectionError(null)
    } catch (failure) {
      if (generation.current === version && !controller.signal.aborted)
        setError(messageFrom(failure))
    } finally {
      if (generation.current === version) setBusy(null)
    }
  }

  async function ask(question: string): Promise<boolean> {
    const prompt = question.trim()
    if (!document || busy || !prompt) return false
    if (prompt.length > (health?.max_question_chars ?? 2000)) {
      setError('Je vraag is te lang. Gebruik maximaal 2000 tekens.')
      return false
    }
    const version = generation.current
    const controller = new AbortController()
    activeRequest.current = controller
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: prompt }])
    setBusy('answer')
    setError(null)
    try {
      const answer = await askQuestion(document.document_id, prompt, controller.signal)
      if (version !== generation.current) return false
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: answer.answer,
          sources: answer.sources,
          insufficientContext: answer.insufficient_context,
        },
      ])
      return true
    } catch (failure) {
      if (version === generation.current && !controller.signal.aborted) {
        setError(messageFrom(failure))
        if (failure instanceof ApiError && [404, 409].includes(failure.status)) {
          setDocument(null)
          setFile(null)
          setMessages([])
          setAgentResult(null)
          setInvoiceResult(null)
          setInvoiceReviewed(false)
        }
      }
      return false
    } finally {
      if (version === generation.current) setBusy(null)
    }
  }

  async function investigate(orderId: string | null, instruction: string): Promise<boolean> {
    if (!document || busy) return false
    const version = generation.current
    const controller = new AbortController()
    activeRequest.current = controller
    setAgentResult(null)
    setBusy('agent')
    setError(null)
    try {
      const result = await investigateReturn(
        document.document_id,
        instruction,
        orderId,
        controller.signal,
      )
      if (generation.current !== version) return false
      setAgentResult(result)
      if (
        result.error &&
        ['no_document', 'document_replaced', 'upload_superseded'].includes(result.error.code)
      ) {
        setDocument(null)
        setFile(null)
        setMessages([])
        setInvoiceResult(null)
        setInvoiceReviewed(false)
      }
      return result.status === 'completed'
    } catch (failure) {
      if (generation.current === version && !controller.signal.aborted) {
        setError(messageFrom(failure))
      }
      return false
    } finally {
      if (generation.current === version) setBusy(null)
    }
  }

  async function processInvoice(instruction: string): Promise<boolean> {
    if (!document || busy || !instruction.trim()) return false
    const version = generation.current
    const controller = new AbortController()
    activeRequest.current = controller
    setInvoiceResult(null)
    setInvoiceReviewed(false)
    setBusy('invoice')
    setError(null)
    try {
      const result = await analyzeInvoice(
        document.document_id,
        instruction.trim(),
        controller.signal,
      )
      if (generation.current !== version) return false
      setInvoiceResult(result)
      if (result.error && ['no_document', 'document_replaced'].includes(result.error.code)) {
        setDocument(null)
        setFile(null)
        setMessages([])
        setAgentResult(null)
      }
      return result.review_status !== 'error'
    } catch (failure) {
      if (generation.current === version && !controller.signal.aborted)
        setError(messageFrom(failure))
      return false
    } finally {
      if (generation.current === version) setBusy(null)
    }
  }

  return {
    health,
    connectionError,
    document,
    file,
    messages,
    busy,
    error,
    upload,
    ask,
    agentResult,
    investigate,
    invoiceResult,
    invoiceReviewed,
    setInvoiceReviewed,
    processInvoice,
  }
}
