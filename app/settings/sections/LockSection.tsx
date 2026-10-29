import { createClient } from '@/lib/supabase/server'
import { IDLE_CHOICES, readLockConfig } from '@/lib/lock/config'
import { CODE_MIN } from '@/lib/lock/code'
import { disableLock, removePasskey, saveLockCode, saveLockIdle } from '@/app/actions/lock'
import { PasskeyEnroll } from '@/components/lock/PasskeyEnroll'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { card, primaryButton, secondaryButton } from './styles'

/** Retours du verrouillage (`?lock=…`) : [message, est une erreur]. */
function lockMessage(code: string | undefined): [string, boolean] | null {
  if (!code) return null
  if (code.startsWith('throttled-')) return [`Trop d’essais. Réessaie dans ${Number(code.slice(10)) || 60} s.`, true]
  const messages: Record<string, [string, boolean]> = {
    enabled: ['Verrouillage activé. Le dashboard se verrouille après inactivité.', false],
    changed: ['Code modifié. Les autres appareils devront le ressaisir.', false],
    disabled: ['Verrouillage désactivé.', false],
    idle: ['Délai enregistré.', false],
    revoked: ['Empreinte retirée.', false],
    short: [`Le code doit faire ${CODE_MIN} caractères au moins.`, true],
    mismatch: ['Les deux saisies du code ne correspondent pas.', true],
    current: ['Code actuel incorrect.', true],
    save: ['Enregistrement impossible, réessaie.', true],
  }
  return messages[code] ?? messages.save
}

/** Section « Verrouillage » : code, délai d'inactivité et empreintes. */
export async function LockSection({ code }: { code?: string }) {
  const supabase = await createClient()
  const [lockRead, passkeys] = await Promise.all([
    readLockConfig(supabase).catch((e) => {
      console.error('[settings] lecture du verrouillage', e)
      return 'error' as const
    }),
    supabase.schema('synapse').from('lock_passkeys').select('id, label, created_at, last_used_at').order('created_at'),
  ])

  const lockUnreadable = lockRead === 'error'
  const lock = lockRead === 'error' ? null : lockRead

  // Lecture en échec : on ne propose pas d'activer un verrouillage qui existe peut-être déjà.
  if (lockUnreadable) {
    return (
      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Verrouillage</h2>
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Lecture du verrouillage impossible, recharge la page.
        </p>
        <SectionMessage message={lockMessage(code)} />
      </section>
    )
  }

  return (
    <section className={`${card} mt-4`}>
      <h2 className="font-semibold">Verrouillage</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Second facteur : un code à saisir pour ouvrir le dashboard, même connecté à Google. Sur mobile, l’empreinte
        (ou le déverrouillage de l’appareil) peut le remplacer ; elle ne quitte jamais le téléphone.
      </p>
      <form action={saveLockCode} className="flex flex-col gap-3">
        {lock && (
          <input name="current" type="password" autoComplete="off" required placeholder="Code actuel" aria-label="Code actuel" className="hud-input" />
        )}
        <input name="code" type="password" autoComplete="new-password" required minLength={CODE_MIN} placeholder={lock ? 'Nouveau code' : 'Choisis un code'} aria-label={lock ? 'Nouveau code' : 'Code'} className="hud-input" />
        <input name="confirm" type="password" autoComplete="new-password" required minLength={CODE_MIN} placeholder="Confirme le code" aria-label="Confirmer le code" className="hud-input" />
        <p className="text-sm text-slate-500 dark:text-slate-400">{CODE_MIN} caractères au moins (chiffres ou phrase de passe).</p>
        <SubmitButton className={`${primaryButton} sm:self-start`}>
          {lock ? 'Changer le code' : 'Activer le verrouillage'}
        </SubmitButton>
      </form>
      {lock && (
        <>
          <form action={saveLockIdle} className="flex flex-col gap-3 sm:flex-row">
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
          {passkeys.error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Lecture des appareils impossible.
            </p>
          ) : passkeys.data.length === 0 ? (
            <p className="text-sm">Aucun appareil enregistré.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {passkeys.data.map((p) => (
                <li key={p.id as string} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">
                    {p.label as string}
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}
                      · {p.last_used_at ? `utilisée le ${new Date(p.last_used_at as string).toLocaleDateString('fr-FR')}` : 'jamais utilisée'}
                    </span>
                  </span>
                  <form action={removePasskey}>
                    <input type="hidden" name="id" value={p.id as string} />
                    <SubmitButton className="text-sm text-slate-500 underline dark:text-slate-400">
                      Retirer<span className="sr-only"> « {p.label as string} »</span>
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <PasskeyEnroll />

          <form action={disableLock} className="flex flex-col gap-3 sm:flex-row">
            <input name="current" type="password" autoComplete="off" required placeholder="Code actuel" aria-label="Code actuel pour désactiver" className="hud-input flex-1" />
            <SubmitButton className={secondaryButton}>
              Désactiver le verrouillage
            </SubmitButton>
          </form>
        </>
      )}
      <SectionMessage message={lockMessage(code)} />
    </section>
  )
}
