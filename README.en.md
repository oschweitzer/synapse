# Synapse

*English version — the reference is the French [README.md](README.md).*

A dashboard for running everyday life.

## Planned blocks

- **Calendar & tasks** — today's appointments, to-dos, priorities
- **Habits & health** — habits, sleep, sport, mood
- **Finances** — budget, spending this month
- **Daily info** — weather, news, important mail, homelab

## Stack

Next.js (PWA) + Supabase (project shared with Cairn), sync jobs via `pg_cron`/Edge Functions and GitHub Actions. 100% free.
Details, sources and phases: [docs/PLAN.en.md](docs/PLAN.en.md).

## Getting started

```bash
cp .env.example .env.local   # fill in the variables (see below)
npm install
npm run dev                  # http://localhost:3000
```

Scripts: `npm run build`, `npm run lint`, `npm run typecheck`.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project **shared with Cairn** (Settings > API) |
| `ALLOWED_EMAILS` | Allowlist: authorised Google emails, comma-separated (empty: everyone denied) |
| `NEXT_PUBLIC_SITE_URL` | Public URL of Synapse (Google OAuth redirect: `<url>/api/google/callback`) |
| `SYNAPSE_GOOGLE_CLIENT_ID` / `SYNAPSE_GOOGLE_CLIENT_SECRET` | Synapse's Google OAuth client (see "Calendar and mail") |
| `SYNAPSE_GOOGLE_TOKEN_KEY` | Encryption key for the Google refresh token, 64 hex characters, the same as in the Edge Functions secrets |
| `SYNAPSE_GOOGLE_PICKER_API_KEY` | Google Picker API key, to choose the cash expenses file (see "Cash expenses") |
| `NEXT_PUBLIC_CAIRN_URL` | Cairn web URL, for "Open in Cairn" links (used from phase 2) |
| `DATABASE_URL` | Local only: Postgres connection for migrations (Supabase > Connect > *Session pooler*) |
| `SUPABASE_PROJECT_REF` | Local only: project id, to generate types |

### Database (`synapse` schema)

The Supabase project is shared with Cairn, whose repo owns the migration history through the Supabase CLI. **Never run `supabase db push` from Synapse.** Synapse has its own mechanism, limited to the `synapse` schema:

- migrations live in `db/migrations/NNNN_name.sql`, applied in order, each in a transaction;
- they are tracked in `synapse.schema_migrations` (with a checksum: an applied migration must never be edited, write a new one);
- the script rejects any migration that touches `public.*` (Cairn tables).

```bash
npm run db:status    # applied / pending migrations
npm run db:migrate   # apply pending migrations
npm run db:types     # regenerate lib/types/{synapse,cairn}.ts (after `supabase login`)
```

Once, after the first migration: add `synapse` under Supabase **Settings > API > Exposed schemas** (otherwise the API answers "The schema must be one of the following").

### Weather

Open-Meteo forecasts (free, no key), fetched server-side and cached for 30 min. Without a setting, the location is Paris. To change it (in Supabase > SQL Editor):

```sql
insert into synapse.settings (user_id, weather_label, weather_latitude, weather_longitude)
values ('<account uuid>', 'Strasbourg', 48.5734, 7.7521)
on conflict (user_id) do update set
  weather_label = excluded.weather_label,
  weather_latitude = excluded.weather_latitude,
  weather_longitude = excluded.weather_longitude;
```

### To-dos and shopping (Cairn)

The "À faire" (to-do) and "Courses" (shopping) widgets read the Cairn tables (`notes`, `checklist_items`, `reminders`) directly with the user's session: Cairn's RLS does the filtering. Synapse only writes data there (checking an item), never schema.

- **To-do**: unchecked items of non-archived, non-deleted checklists; those whose due date (`due_at`, otherwise the first reminder) is today or overdue come first (`Europe/Paris` time zone). Then pinned notes.
- **Vault**: encrypted content is never read, only counted ("3 private items"); a private or hidden note shows its code name, without the text of its items.
- **Shopping**: the checklist is chosen in **Settings** (`/settings`), among non-encrypted checklists. Its items are not repeated in the to-do widget.
- "Open in Cairn" links use `NEXT_PUBLIC_CAIRN_URL` (without this variable, no link).

### Calendar and mail (Google)

"Agenda" widget (today, then the next 7 days) and "Mails" widget (headers of the last 20 inbox messages, click → Gmail). The dashboard reads a cache (`synapse.calendar_events`, `synapse.mail_headers`) filled every 30 min by the `synapse-google-sync` Edge Function, triggered by `pg_cron`. Each run leaves a row in `synapse.sync_runs`. Read-only: `calendar.readonly` + `gmail.readonly`, never a message body.

The refresh token is encrypted (AES-GCM) by `/api/google/callback`, then stored in `synapse.google_credentials` (RLS with no policy: unreadable from the client). If Google rejects it, a "Reconnect Google" banner appears on the dashboard.

One-time setup:

1. **Google Cloud** (Cairn's project): enable the *Google Calendar API* and *Gmail API*. Create an OAuth client of type **"Web application"** dedicated to Synapse, with the redirect URI `<NEXT_PUBLIC_SITE_URL>/api/google/callback` (and `http://localhost:3000/api/google/callback` locally). Consent screen: add the `calendar.readonly` and `gmail.readonly` scopes, then **publish to Production without requesting verification**. In Test mode, refresh tokens expire after 7 days. The consent screen is shared by the whole Google Cloud project: Cairn moves to Production too.
2. **Secrets.** Generate two values: `openssl rand -hex 32` for the encryption key, and once more for the pg_cron secret. On Vercel, set `SYNAPSE_GOOGLE_CLIENT_ID`, `SYNAPSE_GOOGLE_CLIENT_SECRET` and `SYNAPSE_GOOGLE_TOKEN_KEY`. In the Supabase project:
   ```bash
   supabase secrets set --project-ref <ref> \
     SYNAPSE_GOOGLE_CLIENT_ID=… SYNAPSE_GOOGLE_CLIENT_SECRET=… \
     SYNAPSE_GOOGLE_TOKEN_KEY=<same key as Vercel> SYNAPSE_CRON_SECRET=<pg_cron secret>
   ```
   The names are prefixed with `SYNAPSE_` because the project, and therefore its secrets, are shared with Cairn (`GOOGLE_TOKEN_KEY`, `GOOGLE_CLIENT_ID_WEB`…).
3. **Edge Function**, from this repo (it deploys only this function, nothing of Cairn's):
   ```bash
   supabase functions deploy synapse-google-sync --project-ref <ref>
   ```
   `supabase/config.toml` declares it without JWT verification: pg_cron has no session, and the function checks the secret or the session itself.
4. **Migration** `0002_google.sql` (`npm run db:migrate`): tables, functions, `pg_cron` / `pg_net` extensions and the every-30-min schedule.
5. **Vault** (Supabase > SQL Editor). The URL and secret used by pg_cron are read there on each run:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'synapse_functions_url');
   select vault.create_secret('<pg_cron secret>', 'synapse_cron_secret');
   ```
6. In Synapse, **Settings > Connect Google**. A first sync starts right away; the "Sync now" button starts another.

Monitoring runs: `select * from synapse.sync_runs order by started_at desc limit 10;` and, on the pg_cron side, `select * from cron.job_run_details order by start_time desc limit 10;`. "Disconnect" erases the token and the cache; access can also be revoked at Google (myaccount.google.com/permissions).

### Sport (Garmin)

"Sommeil" (sleep: night, stages, Body Battery), "Activités" (the last 5, click → Garmin Connect) and "7 derniers jours" (last 7 days: steps, resting HR) widgets. They read `synapse.garmin_daily` and `synapse.garmin_activities`, filled every 3 h by the `garmin-sync` GitHub Actions workflow (`jobs/garmin/sync.py`, unofficial library [`garminconnect`](https://github.com/cyberjunky/python-garminconnect)). Each run re-reads the last 3 days and leaves a row in `synapse.sync_runs`.

Session tokens: the job keeps them between runs in the Actions cache, encrypted (AES-256, `GARMIN_TOKEN_KEY`). It logs in with the password again only if they are missing or rejected, since Garmin blocks an account that logs in too often. The cache is rewritten only when the tokens change.

One-time setup:

1. **Migration** `0003_garmin.sql`: `npm run db:migrate`.
2. **GitHub secrets** (Settings > Secrets and variables > Actions):

   | Secret | Value |
   |---|---|
   | `GARMIN_EMAIL` / `GARMIN_PASSWORD` | Garmin Connect account (without two-factor authentication) |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (Settings > API); never goes to Vercel |
   | `SYNAPSE_USER_ID` | uuid of the Cairn/Synapse account (Authentication > Users) |
   | `GARMIN_TOKEN_KEY` | encryption of cached tokens: `openssl rand -hex 32` |

3. **First run**: Actions > *Garmin sync* > *Run workflow*, with `days` = 30 to seed the history.

If the sync fails (`select * from synapse.sync_runs where source = 'garmin' order by started_at desc limit 5;`): "Garmin limite les connexions" (rate limited) clears itself on the next run; "Connexion Garmin refusée" (login refused) means checking the password. Changing `GARMIN_TOKEN_KEY` forces a password login. Parsing tests: `cd jobs/garmin && python -m unittest test_sync.py`.

### Recipes

**Recipes** pages (`/recipes`): create and edit (one line per ingredient, quantity included; one line per step; optional source link), and a one-off import from [TheMealDB](https://www.themealdb.com) to seed the collection (search by English name, or random; at most 10 per import, an already imported recipe is skipped).

"Recette du jour" (recipe of the day) widget: picked on the first display of the day (`Europe/Paris` time zone) by `synapse.pick_daily_recipe`, among recipes not served in the last 14 days (otherwise the least recent one), and stored in `synapse.meal_plan`. The "Add ingredients to shopping" button creates one Cairn item per ingredient at the end of the checklist chosen in **Settings** (`position` = max + 1). A data write, never into a vault checklist.

Setup: migration `0004_recipes.sql` (`npm run db:migrate`).

### Mood and habits

"Humeur" (mood) widget: one click on 😞 🙁 😐 🙂 😄 records today's mood (`Europe/Paris` time zone), and an optional word can be added; the last 7 days are shown below. "Habitudes" (habits) widget: one checkbox per habit for today, the last 7 days and the current streak (🔥 days in a row, capped at 90+).

Habits are managed in **Settings** (at most 10 active). "Remove" hides a habit without erasing its checked days. Tables `synapse.mood_entries`, `synapse.habits`, `synapse.habit_checks`.

Setup: migration `0005_mood_habits.sql` (`npm run db:migrate`).

### Cash expenses (Google Sheet)

"Dépenses cash" widget (quick add, current month total, last 5 expenses) and **Dépenses** page (`/cash`: one month at a time, total per category, inline editing, deletion after confirmation). The data lives in the "Dépenses Liquide" Google Sheet, which stays the source of truth and can always be edited by hand:

- `Saisies` tab: `ID | Date | Montant | Catégorie | Remarque`, one row per expense, all years together (hidden ID, written by Synapse; a row added by hand gets one on the next read);
- `Catégories` tab: one per row, below the header; it feeds the sheet's dropdown and the widget's list (a category created from the widget is added to it);
- `Récap` tab: `QUERY` formulas over `Saisies` (total per category, per year, month × category pivot).

Synapse reads and writes the file from the server (`/api/cash` route handlers), with the Google refresh token: dates as serial numbers, amounts as numbers (`RAW`), the same validation as the sheet (valid date, amount > 0, known category). Reads are cached by Next for 3 min, invalidated after each write. Nothing is copied to the database except the file id (`synapse.settings.cash_sheet_id`).

One-time setup:

1. **Google Cloud** (same project): enable the *Google Sheets API* and *Google Picker API*. Consent screen: add the `drive.file` scope (non-sensitive: only the files chosen in the Picker). Synapse's OAuth client: add `<NEXT_PUBLIC_SITE_URL>` (and `http://localhost:3000`) to the **Authorized JavaScript origins**, for the Picker's token. Create an **API key** restricted to the *Google Picker API* and to the `<NEXT_PUBLIC_SITE_URL>/*` referrer, and put it in `SYNAPSE_GOOGLE_PICKER_API_KEY` (Vercel).
2. **Migration** `0006_cash.sql` (`npm run db:migrate`): `cash_sheet_id` column, `google_refresh_token()` (the caller's ciphertext, decrypted by the Next server) and `flag_google_reauth()` functions.
3. **Settings > Reconnect Google**, to grant `drive.file`, then **Choisir le fichier** (Google Picker).
4. On first connection, the widget offers **Migrer le fichier**: it reads the `2026` tab, shows a preview where each anomaly has to be confirmed (an invalid date is never fixed silently: `24.20.2026` → `24.10.2026` suggested), then creates the three tabs and copies the rows in a single `batchUpdate`. The `2026` tab is left untouched, as an archive. Run again, the migration creates nothing if `Saisies` exists. The final check compares the row count and total with the source (and its `TOTAL` row). Then check how the `Récap` tab renders.

### Sign-in

Sign-in is Google only (`openid email profile`, no access to Google data), through Supabase Auth: the session is the Cairn account's, provided the Google address is the Cairn account's (Supabase links the Google identity to the existing account with the same verified address; check in *Authentication > Users* after the first sign-in that `auth.uid()` is the Cairn account's uuid). An account outside `ALLOWED_EMAILS` is signed out immediately ("Accès refusé"). Enable the *Google* provider in Supabase (the "Web" OAuth client of Cairn's Google Cloud project, whose authorised redirect URIs include `https://<project-ref>.supabase.co/auth/v1/callback`). In Supabase, **Authentication > URL Configuration**, add `<NEXT_PUBLIC_SITE_URL>/auth/callback` (and `http://localhost:3000/auth/callback` locally) to the *Redirect URLs*.

### Design system

"Ship's console" interface: dark only, cyan accent (data) and amber (attention), cut corners. Reference: the *Synapse* design system (tokens, components, usage rules).

- `app/tokens.css`: tokens (colours, spacing, bevels), copied from the design system's `tokens.json`.
- `app/hud.css`: `hud-*` classes (panel, button, badge, input, gauge, sparkline, mail…).
- `components/ui/`: React components ported from the design system (`Panel`, `Button`, `Badge`, `Input`, `Stat`, `Gauge`, `Sparkline`, `Icon`), same props and classes.
- `tailwind.config.ts` exposes the tokens (`ink-*`, `hull-*`, `cyan-*`, `amber-*`…); the `slate`, `red`, `green`, `amber` and `sky` palettes are aliased to the tokens there so existing screens pick up the style without being rewritten. For a new screen, use the tokens and `components/ui/`.
- Fonts (Chakra Petch, IBM Plex Sans, JetBrains Mono) are loaded by `next/font/google` in `app/layout.tsx`.
- A widget fits 4 or 8 columns of the `.hud-dash` grid (see `WidgetShell`).

### Deployment (Vercel Hobby)

Import the repository into Vercel (Next.js preset), set the variables above, then deploy. Then install the app from the phone's browser ("Add to Home Screen").

The PWA icons can be regenerated with `node scripts/generate-icons.mjs`.
