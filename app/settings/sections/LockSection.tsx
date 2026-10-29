import { createClient } from '@/lib/supabase/server'
import { readLockConfig } from '@/lib/lock/config'
import { CODE_MIN } from '@/lib/lock/code'
import { LockForms } from '@/components/settings/LockForms'
import { card } from './styles'

/** Section « Verrouillage » : code, délai d'inactivité et empreintes. */
export async function LockSection() {
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
      <LockForms
        codeMin={CODE_MIN}
        lock={lock ? { idleMinutes: lock.idleMinutes } : null}
        passkeys={
          passkeys.error
            ? null
            : passkeys.data.map((p) => ({
                id: p.id as string,
                label: p.label as string,
                used: p.last_used_at ? `utilisée le ${new Date(p.last_used_at as string).toLocaleDateString('fr-FR')}` : 'jamais utilisée',
              }))
        }
      />
    </section>
  )
}
