'use client'

import { useActionState } from 'react'
import { disableLock, removePasskey, saveLockCode, saveLockIdle } from '@/app/actions/lock'
import { IDLE_CHOICES } from '@/lib/lock/config'
import { PasskeyEnroll } from '@/components/lock/PasskeyEnroll'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { useLastSubmitted } from '@/components/settings/useLastSubmitted'
import { secondaryButton, primaryButton } from '@/app/settings/sections/styles'

/** Retours des actions du verrouillage : [message, est une erreur]. `codeMin` vient du serveur (`lib/lock/code` importe `node:crypto`). */
function lockMessage(code: string, codeMin: number): [string, boolean] {
  if (code.startsWith('throttled-')) return [`Trop d’essais. Réessaie dans ${Number(code.slice(10)) || 60} s.`, true]
  const messages: Record<string, [string, boolean]> = {
    enabled: ['Verrouillage activé. Le dashboard se verrouille après inactivité.', false],
    changed: ['Code modifié. Les autres appareils devront le ressaisir.', false],
    disabled: ['Verrouillage désactivé.', false],
    idle: ['Délai enregistré.', false],
    revoked: ['Empreinte retirée.', false],
    short: [`Le code doit faire ${codeMin} caractères au moins.`, true],
    mismatch: ['Les deux saisies du code ne correspondent pas.', true],
    current: ['Code actuel incorrect.', true],
    save: ['Enregistrement impossible, réessaie.', true],
  }
  return messages[code] ?? messages.save
}

/**
 * Formulaires de la section « Verrouillage » et son message : code, délai, « Verrouiller maintenant »,
 * empreintes et désactivation. Les actions tournent sans navigation ; la section est revalidée par chaque action.
 * Toujours rendu, verrouillage activé ou non : son état (le message) survit au passage de l'un à l'autre.
 * `passkeys` est `null` quand la lecture a échoué ; `used` est le texte « utilisée le … » calculé côté serveur
 * (une date formatée côté client casserait l'hydratation).
 */
export function LockForms({
  codeMin,
  lock,
  passkeys,
}: {
  codeMin: number
  lock: { idleMinutes: number } | null
  passkeys: { id: string; label: string; used: string }[] | null
}) {
  // Les actions serveur sont passées telles quelles : une fonction enveloppante ferait rendre `javascript:throw…`
  // comme `action` du formulaire, et l'envoi ne marcherait plus sans JavaScript.
  const [codeState, codeAction] = useActionState(saveLockCode, null)
  const [idleState, idleAction] = useActionState(saveLockIdle, null)
  const [disableState, disableAction] = useActionState(disableLock, null)
  const [removeState, removeAction] = useActionState(removePasskey, null)
  const [state, setLast] = useLastSubmitted({ code: codeState, idle: idleState, disable: disableState, remove: removeState })

  return (
    <>
      {/* La clé remonte les champs quand on passe du premier réglage au changement de code (et inversement). */}
      <form key={lock ? 'change' : 'setup'} action={codeAction} onSubmit={() => setLast('code')} className="flex flex-col gap-3">
        {lock && (
          <input name="current" type="password" autoComplete="off" required placeholder="Code actuel" aria-label="Code actuel" className="hud-input" />
        )}
        <input name="code" type="password" autoComplete="new-password" required minLength={codeMin} placeholder={lock ? 'Nouveau code' : 'Choisis un code'} aria-label={lock ? 'Nouveau code' : 'Code'} className="hud-input" />
        <input name="confirm" type="password" autoComplete="new-password" required minLength={codeMin} placeholder="Confirme le code" aria-label="Confirmer le code" className="hud-input" />
        <p className="text-sm text-slate-500 dark:text-slate-400">{codeMin} caractères au moins (chiffres ou phrase de passe).</p>
        <SubmitButton className={`${primaryButton} sm:self-start`}>
          {lock ? 'Changer le code' : 'Activer le verrouillage'}
        </SubmitButton>
      </form>
      {lock && (
        <>
          {/* Clé sur le délai : React 19 remet le champ à sa valeur par défaut après l'action, qui doit suivre la config revalidée. */}
          <form key={lock.idleMinutes} action={idleAction} onSubmit={() => setLast('idle')} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="idle_minutes" className="sr-only">
              Verrouiller après
            </label>
            <select id="idle_minutes" name="idle_minutes" defaultValue={lock.idleMinutes} className="hud-input flex-1">
              {IDLE_CHOICES.map((c) => (
                <option key={c.minutes} value={c.minutes}>
                  {c.minutes === 0 ? c.label : `Verrouiller après ${c.label} d’inactivité`}
                </option>
              ))}
            </select>
            <SubmitButton className={secondaryButton}>
              Enregistrer le délai
            </SubmitButton>
          </form>
          <form action="/api/lock/lock" method="post">
            <button type="submit" className={secondaryButton}>
              Verrouiller maintenant
            </button>
          </form>

          <h3 className="mt-2 text-sm font-semibold">Empreintes</h3>
          {passkeys === null ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Lecture des appareils impossible.
            </p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm">Aucun appareil enregistré.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {passkeys.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">
                    {p.label}
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}
                      · {p.used}
                    </span>
                  </span>
                  <form action={removeAction} onSubmit={() => setLast('remove')}>
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton className="text-sm text-slate-500 underline dark:text-slate-400">
                      Retirer<span className="sr-only"> « {p.label} »</span>
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <PasskeyEnroll />

          <form action={disableAction} onSubmit={() => setLast('disable')} className="flex flex-col gap-3 sm:flex-row">
            <input name="current" type="password" autoComplete="off" required placeholder="Code actuel" aria-label="Code actuel pour désactiver" className="hud-input flex-1" />
            <SubmitButton className={secondaryButton}>
              Désactiver le verrouillage
            </SubmitButton>
          </form>
        </>
      )}
      <SectionMessage key={state?.at ?? 'none'} message={state ? lockMessage(state.code, codeMin) : null} />
    </>
  )
}
