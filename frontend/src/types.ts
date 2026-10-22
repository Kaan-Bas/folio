export interface HealthResponse {
  status: string
  configured: boolean
  max_upload_mb: number
  max_question_chars: number
}

export interface UploadedDocument {
  document_id: string
  filename: string
  page_count: number
  text_page_count: number
  chunk_count: number
}

export interface Source {
  chunk_id: string
  page: number
  text: string
  score: number
}

export interface Answer {
  answer: string
  sources: Source[]
  insufficient_context: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  sources?: Source[]
  insufficientContext?: boolean
}

export type AssistantActivity = 'upload' | 'answer' | 'agent' | null

export interface AgentToolCall {
  sequence: number
  name: string
  status: 'success' | 'not_found' | 'error' | 'blocked'
  message: string
}

export interface AgentResponse {
  answer: string
  sources: Source[]
  tool_calls: AgentToolCall[]
  status: 'completed' | 'insufficient_information' | 'limit_reached' | 'error'
  error: { code: string; message: string } | null
  disclaimer: string
  concept_advice: true
}
