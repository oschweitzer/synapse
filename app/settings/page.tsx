import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listShoppingCandidates } from '@/lib/connectors/cairn'
import { saveShoppingChecklist } from '@/app/actions/cairn'
import { disconnectGoogle, syncGoogleNow } from '@/app/actions/google'
import { readGoogleAccount } from '@/lib/connectors/google'
import { isAdminUser } from '@/lib/admin'
import { listDashboards } from '@/lib/dashboards'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGETS } from '@/lib/dashboard'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { moveCity, removeCity } from '@/app/actions/weather'
import { listLocations, WEATHER_LOCATIONS_MAX } from '@/lib/connectors/weather'
import { addHabit, archiveHabit } from '@/app/actions/mood'
import { HABITS_MAX, listHabits } from '@/lib/connectors/mood'
import { pickerConfig, SCOPE_DRIVE_FILE } from '@/lib/google/oauth'
import { CityAutocomplete } from '@/components/weather/CityAutocomplete'
import { SheetPicker } from '@/components/cash/SheetPicker'
import { UnlinkSheet } from '@/components/cash/UnlinkSheet'
import { IDLE_CHOICES, readLockConfig } from '@/lib/lock/config'
import { CODE_MIN } from '@/lib/lock/code'
import { disableLock, removePasskey, saveLockCode, saveLockIdle } from '@/app/actions/lock'
import { AutoLock } from '@/components/lock/AutoLock'
import { PasskeyEnroll } from '@/components/lock/PasskeyEnroll'
import { SubmitButton } from '@/components/ui/SubmitButton'

const MESSAGES: Record<string, string> = {
  invalid: 'Cette checklist n’est pas utilisable (introuvable ou dans le coffre).',
  save: 'Enregistrement impossible, réessayez.',
}

/** Retours du flux Google (`?google=…`) : [message, est une erreur]. */
const GOOGLE_MESSAGES: Record<string, [string, boolean]> = {
  connected: ['Google connecté. Première synchro lancée.', false],
  disconnected: ['Google déconnecté. Pense à retirer aussi l’accès dans ton compte Google.', false],
  synced: ['Synchro terminée.', false],
  denied: ['Autorisation refusée chez Google.', true],
  state: ['Le retour de Google n’a pas pu être vérifié. Recommence la connexion.', true],
  scopes: ['L’accès à l’agenda et à Gmail est nécessaire : coche les deux autorisations.', true],
  'no-refresh': [
    'Google n’a pas renvoyé de jeton durable. Retire l’accès de Synapse dans ton compte Google, puis recommence.',
    true,
  ],
  config: ['OAuth Google non configuré côté serveur (SYNAPSE_GOOGLE_CLIENT_ID / SYNAPSE_GOOGLE_CLIENT_SECRET).', true],
  'sync-error': ['La synchro a échoué. Détails dans le journal des synchros.', true],
  error: ['Connexion à Google impossible, réessaie.', true],
}

/** Retours des habitudes (`?habits=…`) : [message, est une erreur]. */
const HABIT_MESSAGES: Record<string, [string, boolean]> = {
  added: ['Habitude ajoutée.', false],
  archived: ['Habitude retirée. Ses jours cochés sont conservés.', false],
  name: ['Donne un nom de 80 caractères au plus.', true],
  max: [`${HABITS_MAX} habitudes au plus : retires-en une d’abord.`, true],
  save: ['Enregistrement impossible, réessaie.', true],
}

/** Retours de la météo (`?weather=…`) : [message, est une erreur]. */
const WEATHER_MESSAGES: Record<string, [string, boolean]> = {
  removed: ['Ville retirée.', false],
  moved: ['Ordre enregistré.', false],
  invalid: ['Ville invalide.', true],
  save: ['Enregistrement impossible, réessaie.', true],
}

/** Retours de la zone admin des dashboards (`?dashboards=…`) : [message, est une erreur]. */
const DASHBOARD_MESSAGES: Record<string, [string, boolean]> = {
  created: ['Dashboard créé. Choisis ses widgets ci-dessous.', false],
  saved: ['Dashboard enregistré.', false],
  'order-reset': ['Ordre par défaut rétabli.', false],
  default: ['Dashboard par défaut modifié.', false],
  deleted: ['Dashboard supprimé.', false],
  forbidden: ['Réservé aux administrateurs.', true],
  name: [`Donne un nom de ${DASHBOARD_NAME_MAX} caractères au plus.`, true],
  max: [`${DASHBOARDS_MAX} dashboards au plus : supprime-en un d’abord.`, true],
  sensitive: ['Un dashboard public ne peut pas afficher de widget sensible (marqués ci-dessous).', true],
  'default-delete': ['Le dashboard par défaut ne se supprime pas : désigne-en un autre d’abord.', true],
  invalid: ['Dashboard introuvable.', true],
  save: ['Enregistrement impossible, réessaie.', true],
}

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

const card =
  'hud-card flex flex-col gap-3'
const primaryButton =
  'hud-btn hud-btn--primary'
const secondaryButton =
  'hud-btn hud-btn--ghost'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; dashboards?: string; error?: string; google?: string; habits?: string; weather?: string; lock?: string }>
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const params = await searchParams
  const isAdmin = isAdminUser(data.user)
  const dashboards = isAdmin
    ? await listDashboards(supabase).catch((e) => {
        console.error('[settings] lecture des dashboards', e)
        return null
      })
    : undefined
  const dashboardMessage = params.dashboards ? (DASHBOARD_MESSAGES[params.dashboards] ?? DASHBOARD_MESSAGES.save) : null
  const [candidates, settings, google, habits, cities, lock, passkeys] = await Promise.all([
    listShoppingCandidates(),
    supabase.schema('synapse').from('settings').select('cairn_shopping_checklist_id, cash_sheet_id').maybeSingle(),
    readGoogleAccount().catch((e) => {
      console.error('[settings] lecture du compte Google', e)
      return null
    }),
    listHabits().catch((e) => {
      console.error('[settings] lecture des habitudes', e)
      return null
    }),
    listLocations().catch((e) => {
      console.error('[settings] lecture des villes', e)
      return null
    }),
    readLockConfig(supabase).catch((e) => {
      console.error('[settings] lecture du verrouillage', e)
      return null
    }),
    supabase.schema('synapse').from('lock_passkeys').select('id, label, created_at, last_used_at').order('created_at'),
  ])
  if (settings.error) console.error('[settings] lecture', settings.error)
  const current = (settings.data?.cairn_shopping_checklist_id as string | null | undefined) ?? ''
  const cashSheetId = (settings.data?.cash_sheet_id as string | null | undefined) ?? null
  const picker = pickerConfig()
  const canPick = Boolean(google && !google.needsReauth && google.scopes.includes(SCOPE_DRIVE_FILE))
  const error = params.error ? (MESSAGES[params.error] ?? MESSAGES.save) : null
  const googleMessage = params.google ? (GOOGLE_MESSAGES[params.google] ?? GOOGLE_MESSAGES.error) : null
  const weatherMessage = params.weather ? (WEATHER_MESSAGES[params.weather] ?? WEATHER_MESSAGES.save) : null
  const lockInfo = lockMessage(params.lock)
  const habitMessage = params.habits ? (HABIT_MESSAGES[params.habits] ?? HABIT_MESSAGES.save) : null

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      {lock && <AutoLock idleMinutes={lock.idleMinutes} />}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Réglages</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          Retour au dashboard
        </Link>
      </header>

      <section className={card}>
        <h2 className="font-semibold">Liste de courses</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Checklist Cairn affichée dans le widget « Courses ». Les checklists du coffre ne sont pas proposées :
          Synapse ne peut ni les lire ni les cocher.
        </p>
        <form action={saveShoppingChecklist} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="note_id" className="sr-only">
            Checklist des courses
          </label>
          <select
            id="note_id"
            name="note_id"
            defaultValue={current}
            aria-describedby={error ? 'settings-error' : undefined}
            className="hud-input flex-1"
          >
            <option value="">— Aucune —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <SubmitButton className={primaryButton}>
            Enregistrer
          </SubmitButton>
        </form>
        {candidates.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Aucune checklist non chiffrée dans Cairn.</p>
        )}
        {params.saved && !error && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            Enregistré.
          </p>
        )}
        {error && (
          <p id="settings-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </section>

      {isAdmin && (
        <section id="dashboards" className={`${card} mt-4`}>
          <h2 className="font-semibold">Dashboards (admin)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choisis les widgets de chaque dashboard. Un dashboard <strong>privé</strong> n’est servi qu’une fois le
            verrouillage levé ; un dashboard <strong>public</strong> ne demande que la connexion, et ne peut pas
            afficher de widget sensible. L’ordre se change par glisser-déposer sur le dashboard.
          </p>
          {dashboardMessage && (
            <p
              role={dashboardMessage[1] ? 'alert' : 'status'}
              className={`text-sm ${dashboardMessage[1] ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
            >
              {dashboardMessage[0]}
            </p>
          )}
          {dashboards === null && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Lecture des dashboards impossible.
            </p>
          )}
          {dashboards?.map((dashboard) => (
            <form key={dashboard.id} action={saveDashboard} className="flex flex-col gap-3 border border-slate-200 p-3 dark:border-slate-700">
              <input type="hidden" name="id" value={dashboard.id} />
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Nom
                  <input
                    name="name"
                    required
                    maxLength={DASHBOARD_NAME_MAX}
                    defaultValue={dashboard.name}
                    className="hud-input"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Visibilité
                  <select name="visibility" defaultValue={dashboard.visibility} className="hud-input">
                    <option value="private">Privé (verrouillage)</option>
                    <option value="public">Public (connexion seule)</option>
                  </select>
                </label>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm">Widgets</legend>
                {WIDGETS.map((widget) => (
                  <label key={widget.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="widgets"
                      value={widget.id}
                      defaultChecked={dashboard.widgets.includes(widget.id)}
                      className="mt-1"
                    />
                    <span>
                      {widget.label}
                      {widget.sensitive && <span className="text-amber-600 dark:text-amber-400"> · sensible</span>}
                      <span className="block text-slate-500 dark:text-slate-400">
                        {widget.description} Source : {widget.source}.
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton className={primaryButton}>
                  Enregistrer
                </SubmitButton>
                <SubmitButton formAction={resetDashboardOrder} formNoValidate className={secondaryButton}>
                  Rétablir l’ordre par défaut
                </SubmitButton>
                {dashboard.isDefault ? (
                  <span className="text-sm text-slate-500 dark:text-slate-400">Dashboard par défaut</span>
                ) : (
                  <>
                    <SubmitButton formAction={setDefaultDashboard} formNoValidate className={secondaryButton}>
                      Définir par défaut
                    </SubmitButton>
                    <SubmitButton formAction={deleteDashboard} formNoValidate className={secondaryButton}>
                      Supprimer<span className="sr-only"> « {dashboard.name} »</span>
                    </SubmitButton>
                  </>
                )}
              </div>
            </form>
          ))}
          {dashboards && dashboards.length < DASHBOARDS_MAX && (
            <form action={createDashboard} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Nouveau dashboard
                <input name="name" required maxLength={DASHBOARD_NAME_MAX} className="hud-input" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Visibilité
                <select name="visibility" defaultValue="private" className="hud-input">
                  <option value="private">Privé (verrouillage)</option>
                  <option value="public">Public (connexion seule)</option>
                </select>
              </label>
              <SubmitButton className={primaryButton}>
                Créer
              </SubmitButton>
            </form>
          )}
        </section>
      )}

      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Météo</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Villes affichées dans le widget « Météo » ({WEATHER_LOCATIONS_MAX} au plus). Sans ville, c’est Paris.
        </p>
        {cities === null ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Lecture des villes impossible.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cities.map((city, i) => (
              <li key={city.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{city.label}</span>
                {city.id !== 'default' && (
                  <span className="flex gap-3">
                    {([-1, 1] as const).map((direction) => {
                      const disabled = direction === -1 ? i === 0 : i === cities.length - 1
                      return (
                        <form key={direction} action={moveCity}>
                          <input type="hidden" name="id" value={city.id} />
                          <input type="hidden" name="direction" value={direction} />
                          <SubmitButton
                            disabled={disabled}
                            className="text-sm text-slate-500 underline disabled:no-underline disabled:opacity-40 dark:text-slate-400"
                          >
                            {direction === -1 ? 'Monter' : 'Descendre'}
                            <span className="sr-only"> « {city.label} »</span>
                          </SubmitButton>
                        </form>
                      )
                    })}
                    <form action={removeCity}>
                      <input type="hidden" name="id" value={city.id} />
                      <SubmitButton className="text-sm text-slate-500 underline dark:text-slate-400">
                        Retirer<span className="sr-only"> « {city.label} »</span>
                      </SubmitButton>
                    </form>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <CityAutocomplete
          full={cities !== null && cities.filter((c) => c.id !== 'default').length >= WEATHER_LOCATIONS_MAX}
          max={WEATHER_LOCATIONS_MAX}
        />
        {weatherMessage && (
          <p
            role={weatherMessage[1] ? 'alert' : 'status'}
            className={`text-sm ${weatherMessage[1] ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
          >
            {weatherMessage[0]}
          </p>
        )}
      </section>

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
        {lockInfo && (
          <p role={lockInfo[1] ? 'alert' : 'status'} className={`text-sm ${lockInfo[1] ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
            {lockInfo[0]}
          </p>
        )}
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Habitudes</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Cochées chaque jour dans le widget « Habitudes » ({HABITS_MAX} au plus). Retirer une habitude la masque
          du dashboard sans effacer son historique.
        </p>
        {habits === null ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Lecture des habitudes impossible.
          </p>
        ) : habits.length === 0 ? (
          <p className="text-sm">Aucune habitude pour l’instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {habits.map((habit) => (
              <li key={habit.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{habit.name}</span>
                <form action={archiveHabit}>
                  <input type="hidden" name="id" value={habit.id} />
                  <SubmitButton className="text-sm text-slate-500 underline dark:text-slate-400">
                    Retirer<span className="sr-only"> « {habit.name} »</span>
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        {(habits === null || habits.length < HABITS_MAX) && (
          <form action={addHabit} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="habit-name" className="sr-only">
              Nouvelle habitude
            </label>
            <input
              id="habit-name"
              name="name"
              required
              maxLength={80}
              placeholder="Méditer, lire 20 min…"
              className="hud-input flex-1"
            />
            <SubmitButton className={primaryButton}>
              Ajouter
            </SubmitButton>
          </form>
        )}
        {habitMessage && (
          <p
            role={habitMessage[1] ? 'alert' : 'status'}
            className={`text-sm ${habitMessage[1] ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
          >
            {habitMessage[0]}
          </p>
        )}
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Google (agenda et mails)</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Lecture seule : évènements de la veille à J+7 et en-têtes des 20 derniers mails de la boîte de réception,
          synchronisés toutes les 30 min. Le corps des mails n’est jamais lu. Pour les dépenses cash, accès au seul
          fichier choisi plus bas, en lecture et écriture.
        </p>
        {google ? (
          <p className="text-sm">
            {google.needsReauth ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Google a refusé l’accès{google.email && <> de {google.email}</>} : reconnexion nécessaire.
              </span>
            ) : (
              <>Connecté{google.email && <> en tant que {google.email}</>}.</>
            )}
          </p>
        ) : (
          <p className="text-sm">Non connecté.</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/api/google/connect" className={primaryButton}>
            {google ? 'Reconnecter Google' : 'Connecter Google'}
          </a>
          {google && !google.needsReauth && (
            <form action={syncGoogleNow}>
              <SubmitButton className={`${secondaryButton} w-full`}>
                Synchroniser maintenant
              </SubmitButton>
            </form>
          )}
          {google && (
            <form action={disconnectGoogle}>
              <SubmitButton className={`${secondaryButton} w-full`}>
                Déconnecter
              </SubmitButton>
            </form>
          )}
        </div>
        {googleMessage && (
          <p
            role={googleMessage[1] ? 'alert' : 'status'}
            className={`text-sm ${googleMessage[1] ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
          >
            {googleMessage[0]}
          </p>
        )}
      </section>

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
              ? 'Reconnecte Google (ci-dessus) et accepte l’accès aux fichiers choisis pour choisir le fichier.'
              : 'Connecte Google (ci-dessus) pour choisir le fichier.'}
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
    </main>
  )
}
