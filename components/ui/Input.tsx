import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'
import { cx } from './cx'

export function Input({
  label,
  hint,
  error,
  mono,
  size = 'md',
  className,
  id,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string
  hint?: string
  error?: string
  /** Chiffres tabulaires : montants, dates. */
  mono?: boolean
  size?: 'sm' | 'md'
}) {
  const auto = useId()
  const fieldId = id ?? auto
  const hintId = `${fieldId}-hint`
  const message = error ?? hint

  return (
    <div className={cx('hud-field', error && 'hud-field--error', className)}>
      {label && (
        <label className="hud-label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? hintId : undefined}
        {...rest}
        className={cx('hud-input', mono && 'hud-input--mono', size === 'sm' && 'hud-input--sm')}
      />
      {/* Toujours monté pour qu'une nouvelle erreur soit annoncée. */}
      <span id={hintId} className="hud-field__hint" role={error ? 'alert' : undefined} aria-live="polite" hidden={!message}>
        {message}
      </span>
    </div>
  )
}
