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
  document_label?: 'A' | 'B' | null
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

export interface ComparisonPair {
  comparison_id: string
  document_a: UploadedDocument
  document_b: UploadedDocument
}

export type ComparisonScope = 'focused' | 'broad'
export type ChangeType = 'modified' | 'added' | 'removed' | 'unchanged' | 'uncertain'

export interface ComparisonSource extends Source {
  document_id: string
  filename: string
  reference_id: string
}

export interface ComparisonFinding {
  topic: string
  change_type: ChangeType
  proposed_change_type: ChangeType
  old_situation: string
  new_situation: string
  explanation: string
  sources_a: ComparisonSource[]
  sources_b: ComparisonSource[]
  insufficient_evidence: boolean
  evidence_note: string
}

export interface ComparisonResponse {
  status: 'completed' | 'partial' | 'insufficient_information' | 'limit_reached' | 'error'
  summary: string
  findings: ComparisonFinding[]
  coverage: {
    document_id: string
    filename: string
    total_passages: number
    retrieved_passages: number
    examined_pages: number[]
  }[]
  all_passages_retrieved: boolean
  coverage_note: string
  scope: ComparisonScope
  tool_calls: AgentToolCall[]
  tool_call_limit: number
  error: { code: string; message: string } | null
}
