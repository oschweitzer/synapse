import { createClient } from '@/lib/supabase/server'
import { readGoogleAccount } from '@/lib/connectors/google'
import { pickerConfig, SCOPE_DRIVE_FILE } from '@/lib/google/oauth'
import { SheetPicker } from '@/components/cash/SheetPicker'
import { UnlinkSheet } from '@/components/cash/UnlinkSheet'
import { card } from './styles'

/** Section « Dépenses cash » : Google Sheet du widget « Dépenses cash ». */
export async function CashSection() {
  const supabase = await createClient()
  const [google, settings] = await Promise.all([
    readGoogleAccount().catch((e) => {
      console.error('[settings] lecture du compte Google', e)
      return null
    }),
    supabase.schema('synapse').from('settings').select('cash_sheet_id').maybeSingle(),
  ])
  if (settings.error) console.error('[settings] lecture', settings.error)
  const cashSheetId = (settings.data?.cash_sheet_id as string | null | undefined) ?? null
  const picker = pickerConfig()
  const canPick = Boolean(google && !google.needsReauth && google.scopes.includes(SCOPE_DRIVE_FILE))

  return (
    <section className={`${card} mt-4`}>
      <h2 className="font-semibold">Dépenses cash</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Google Sheet lu et modifié par le widget « Dépenses cash ». Il reste la source de vérité : on peut
        toujours l’éditer à la main. Synapse n’a accès qu’au fichier choisi ici (scope « drive.file »).
      </p>
      {cashSheetId ? (
        <p className="text-sm">
          Fichier :{' '}
          <a
            href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(cashSheetId)}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            ouvrir dans Google Sheets
          </a>
        </p>
      ) : (
        <p className="text-sm">Aucun fichier choisi.</p>
      )}
      {!canPick ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {google
            ? 'Reconnecte Google dans la section « Google (agenda et mails) » et accepte l’accès aux fichiers choisis pour choisir le fichier.'
            : 'Connecte Google dans la section « Google (agenda et mails) » pour choisir le fichier.'}
        </p>
      ) : !picker ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Google Picker non configuré côté serveur (SYNAPSE_GOOGLE_PICKER_API_KEY).
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        {canPick && picker && (
          <SheetPicker {...picker} loginHint={google?.email} label={cashSheetId ? 'Changer de fichier' : 'Choisir le fichier'} />
        )}
        {cashSheetId && <UnlinkSheet />}
      </div>
    </section>
  )
}
