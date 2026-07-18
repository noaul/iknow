import { FileImage, FileUp, X } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { formatBytes } from '../utils/format'

export interface FilePickerProps {
  id: string
  label: string
  accept: string
  file: File | null
  onFile(file: File | null): void
  hint: string
  error?: string
}

export function FilePicker({
  id,
  label,
  accept,
  file,
  onFile,
  hint,
  error,
}: FilePickerProps) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    onFile(event.dataTransfer.files.item(0))
  }

  return (
    <div className="field-group">
      <div className="field-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {file && (
          <button
            type="button"
            className="icon-button"
            aria-label={`移除${label}`}
            title={`移除${label}`}
            onClick={() => onFile(null)}
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className="drop-zone"
        data-dragging={dragging || undefined}
        data-filled={Boolean(file) || undefined}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          id={id}
          className="visually-hidden"
          type="file"
          accept={accept}
          aria-label={`选择${label}`}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          onChange={(event) => onFile(event.currentTarget.files?.item(0) ?? null)}
        />
        <label className="drop-zone-action" htmlFor={id}>
          <span className="drop-zone-icon" aria-hidden="true">
            {file ? <FileImage size={24} /> : <FileUp size={24} />}
          </span>
          {file ? (
            <span className="file-summary">
              <strong>{file.name}</strong>
              <small>{formatBytes(file.size)}</small>
            </span>
          ) : (
            <span className="file-summary">
              <strong>选择文件或拖放到这里</strong>
              <small id={`${id}-hint`}>{hint}</small>
            </span>
          )}
        </label>
      </div>
      {file && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
