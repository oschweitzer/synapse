'use client'

import { useEffect, useState, type ButtonHTMLAttributes } from 'react'
import { useFormStatus } from 'react-dom'
import { cx } from './cx'
import { Spinner } from './Spinner'

/**
 * Bouton d'envoi d'un `<form action={actionServeur}>` : pendant l'action, tous les boutons du formulaire
 * sont désactivés et seul celui qui a été cliqué affiche un spinner. Le libellé reste en place
 * (opacité nulle, pas de `visibility`) : la largeur du bouton ne change pas et son nom accessible non plus.
 */
export function SubmitButton({
  disabled,
  className,
  children,
  onClick,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  const { pending } = useFormStatus()
  const [clicked, setClicked] = useState(false)

  // Le clic est oublié dès que l'action est terminée.
  useEffect(() => {
    if (!pending) setClicked(false)
  }, [pending])

  const busy = pending && clicked

  return (
    <button
      {...rest}
      type="submit"
      disabled={disabled || pending}
      aria-busy={busy || undefined}
      className={cx('relative', className)}
      onClick={(e) => {
        onClick?.(e)
        // Un clic annulé par l'appelant n'envoie rien : pas d'état occupé.
        if (e.defaultPrevented) return
        // Le navigateur bloque l'envoi si le formulaire est invalide, sauf pour un bouton `formNoValidate`.
        const form = e.currentTarget.form
        if (!e.currentTarget.formNoValidate && form && !form.noValidate && !form.checkValidity()) return
        setClicked(true)
      }}
    >
      <span className={busy ? 'opacity-0' : undefined}>{children}</span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Spinner size="sm" />
        </span>
      )}
    </button>
  )
}
