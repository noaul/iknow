import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

export interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange(value: string): void
  autoComplete?: string
  error?: string
  hint?: string
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'off',
  error,
  hint,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-control">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-${error ? 'error' : 'hint'}`}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? '隐藏口令' : '显示口令'}
          title={visible ? '隐藏口令' : '显示口令'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

