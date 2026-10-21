import { useRef, useState } from 'react'
import type { UploadedDocument } from '../types'
import { Icon } from './Icon'

interface Props {
  document: UploadedDocument | null
  uploading: boolean
  maxMb: number
  onUpload: (file: File) => Promise<void>
}

export function UploadPanel({ document, uploading, maxMb, onUpload }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <aside className="sidebar">
      <div className="section-label">
        WERKRUIMTE <span>01</span>
      </div>
      <h2>Jouw document</h2>
      <p className="muted sidebar-intro">Eén PDF. Alle antwoorden binnen handbereik.</p>
      <input
        ref={input}
        id="pdf-upload"
        className="visually-hidden"
        type="file"
        accept=".pdf,application/pdf"
        aria-label="PDF uploaden"
        disabled={uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) void onUpload(file)
          event.currentTarget.value = ''
        }}
      />
      <button
        type="button"
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        disabled={uploading}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          if (!uploading) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!uploading && event.dataTransfer.files[0]) void onUpload(event.dataTransfer.files[0])
        }}
      >
        <span className={`upload-icon ${uploading ? 'pulsing' : ''}`}>
          <Icon name={uploading ? 'sparkle' : document ? 'plus' : 'upload'} size={23} />
        </span>
        <strong>
          {uploading
            ? 'PDF wordt verwerkt…'
            : document
              ? 'Andere PDF uploaden'
              : 'Voeg een PDF toe'}
        </strong>
        <span>
          {uploading ? 'Tekst lezen en doorzoekbaar maken' : 'Sleep hierheen of klik om te kiezen'}
        </span>
        <span className="file-limit">PDF · maximaal {maxMb} MB</span>
      </button>
      {document && (
        <div className="document-card">
          <div className="document-heading">
            <span className="file-icon">
              <Icon name="file" />
            </span>
            <span className="ready-dot" /> Klaar voor vragen
          </div>
          <strong className="document-name" title={document.filename}>
            {document.filename}
          </strong>
          <div className="document-stats">
            <span>{document.page_count} pagina's</span>
            <span>{document.chunk_count} fragmenten</span>
          </div>
          {document.text_page_count < document.page_count && (
            <p className="muted">
              {document.page_count - document.text_page_count} pagina('s) zonder tekst overgeslagen.
            </p>
          )}
        </div>
      )}
      <div className="workflow">
        <div className="section-label">VAN DOCUMENT NAAR ANTWOORD</div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Upload je PDF</strong>
              <p>De tekst wordt per pagina gelezen.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Stel je vraag</strong>
              <p>We zoeken de relevante fragmenten.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Controleer de bron</strong>
              <p>Elk antwoord verwijst naar je PDF.</p>
            </div>
          </li>
        </ol>
      </div>
      <div className="sidebar-note">
        <Icon name="book" size={17} />
        <p>
          De antwoorden komen uit je document. Ontbreekt de informatie? Dan zegt de assistent dat.
        </p>
      </div>
    </aside>
  )
}
