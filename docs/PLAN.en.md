# Technical plan — Synapse

*English version — the reference is the French [PLAN.md](PLAN.md).*

A personal dashboard that brings together sport (Garmin), calendar, mail, Cairn
to-dos and shopping, recipe of the day, weather, mood and habits. Constraints:
**100% free**, usable in the browser, then on mobile.

## 1. Decisions

| Question | Decision | Why |
|---|---|---|
| REST microservices? | **No.** A single Next.js app, one "connector" module per source | A single user: separate services would multiply deployments, secrets and hosts to monitor, for no benefit |
| Front end | Next.js (App Router) + TypeScript + Tailwind | Starting choice |
| Database & auth | **The same Supabase project as Cairn** | Same user account, Cairn to-dos readable directly through RLS without writing an API; we stay on a single free project (the free plan allows two) and daily use of Cairn prevents the inactivity pause |
| Fetching data | Scheduled jobs write to the database; the front end reads the database | Instant display, API quotas respected, last known value if a source goes down |
| Scheduled jobs | Supabase `pg_cron` + Edge Functions (TypeScript/Deno); GitHub Actions for Garmin (Python) | Same tools as Cairn; Garmin only has a reliable library in Python |
| Front-end hosting | Vercel Hobby (or Netlify, like Cairn) | Free for non-commercial use |
| Mobile | **PWA** first; Capacitor later if needed | App stores cost money (Apple $99/year, Google $25); a PWA installs for free on the home screen |
| Tests | Vitest, `*.test.ts` files next to the code; Supabase, `fetch` and the clock mocked; GitHub Actions CI (typecheck, lint, tests) | Change the app and know right away if existing behaviour breaks |

## 2. Architecture

```
┌──────────────── Next.js (Vercel Hobby) ────────────────┐
│  React dashboard (PWA)                                 │
│  Server Components: read Supabase with the session     │
│  Route handlers /api/*: Google OAuth, actions          │
│  lib/connectors/{weather,google,garmin,cairn,meals,    │
│                  mood}.ts                              │
└──────────────────────────┬─────────────────────────────┘
                           │ supabase-js (anon key + RLS)
┌──────────────────────────▼─────────────────────────────┐
│ Supabase project shared with Cairn                      │
│  public.*   → Cairn tables (read-only for Synapse)      │
│  synapse.*  → Synapse's own tables                      │
│  Edge Functions synapse-* + pg_cron (Google sync)       │
└──────────────────────────▲─────────────────────────────┘
                           │ service_role key (CI secret)
              ┌────────────┴─────────────┐
              │ GitHub Actions (cron)     │
              │ Garmin sync, every 3 h    │
              └───────────────────────────┘
```

Only the weather and cash expenses are called directly from the Next server
(with caching): the weather needs neither a key nor storage, and the cash
expenses Google Sheet is itself the source of truth.

## 3. Sources

### Weather — Open-Meteo
- Free, no key. Today's forecast and the coming hours, for one or several cities
  (five at most) chosen in the settings (Open-Meteo geocoding).
- 30 min Next cache.

### Calendar & Gmail — Google APIs
- A **Google Cloud project dedicated to Synapse**, with a single "Web" OAuth
  client, also used for sign-in (Supabase Auth's Google provider). Consent
  specific to Synapse: `calendar.readonly` + `gmail.readonly` (+ `drive.file`
  for cash expenses, see below). Cairn's project is left alone; its consent
  screens and quotas stay separate.
- The refresh token stays server-side, encrypted, in a table with no RLS
  policy. This is Cairn's `google_credentials` model, reused as is
  (`supabase/functions/_shared/chiffrement.ts`), but in a separate
  `synapse.google_credentials` table: Cairn only has the `calendar.events`
  scope, and revoking one must not cut off the other.
- Split (phase 3): the code exchange happens in `/api/google/callback` (Next,
  client secret server-side), which encrypts the refresh token and stores it
  via `synapse.save_google_connection()` (SECURITY DEFINER, limited to
  `auth.uid()`): no `service_role` key on Vercel. The Edge Function decrypts
  with the same key. Secrets prefixed with `SYNAPSE_`: the Edge Functions'
  secrets are shared with Cairn.
- ⚠️ In "Test" mode of the consent screen, refresh tokens expire after 7 days.
  Moving the app to **Production without verification** (warning screen at
  sign-in, limit of 100 accounts) removes the expiry. `gmail.readonly` is a
  *restricted* scope: verification is expensive, hence the choice not to
  request it.
- Sync: `synapse-google-sync` Edge Function triggered by `pg_cron` every
  30 min. It stores events from D-1 to D+7 and the headers of the **last 20
  inbox messages** (sender, subject, snippet, date, read/unread). Never the
  full body. The cache is replaced on every run: it never holds more than 20
  rows. No "important" sorting.
- Clicking a message → opens it in Gmail
  (`https://mail.google.com/mail/u/0/#inbox/<id>`).

### To-dos — Cairn
- Direct reads of the `notes`, `checklist_items` and `reminders` tables, with
  the user's session. RLS (`user_id = auth.uid()`) does the work, there is no
  API to write.
- "To-do" widget: unchecked items of non-archived, non-deleted checklists, with
  `due_at` today or overdue first, then pinned notes.
- **Respect Cairn's vault**:
  - `is_encrypted = true` → no readable content without the vault key; Synapse
    only shows a counter ("3 private items"). It never asks for the recovery
    key.
  - `is_private` / `hide_content` → show `code_name` instead of the title, as
    Cairn does.
- Checking an item from Synapse: an `update` of `is_done`, allowed by the same
  RLS policy. "Open in Cairn" button to `NEXT_PUBLIC_CAIRN_URL/note/<id>`.
- Synapse only writes data to Cairn: checking an item, adding ingredients to
  the shopping list. It **never writes** a migration on Cairn tables. If the
  Cairn schema changes, types are regenerated on the Synapse side
  (`supabase gen types typescript`).

### Sport — Garmin
- There is no official API for individuals: the Garmin Connect Developer
  Program is reserved for businesses, by application.
- Choice: the unofficial **`python-garminconnect`** library in a GitHub Actions
  workflow (cron every 3 h). It fetches activities, sleep, Body Battery, steps,
  resting HR and VO2max, then upserts into `synapse.garmin_*` with the
  `service_role` key (GitHub secret).
- The account has no two-factor authentication: email and password are stored
  as GitHub secrets (`GARMIN_EMAIL`, `GARMIN_PASSWORD`), and the job can log in
  on its own.
- Session tokens (Garmin's DI OAuth; the library dropped `garth` in 0.3, and
  no longer reads its old tokens) are still cached between runs, in the GitHub
  Actions cache, encrypted with a secret: Garmin rate-limits repeated logins
  and temporarily blocks an account that logs in every 3 h. The job only logs
  in with the password if the tokens are missing or rejected.
- If two-factor authentication is enabled one day: generate the tokens once
  locally (`Garmin(email, pwd).login("<folder>")`, MFA code typed by hand),
  then store them as a GitHub secret. The job then never touches the password
  again.
- ⚠️ Fragile by nature: Garmin changes its authentication from time to time.
  **Plan B**: automatic Garmin → Strava sync, then the Strava API (official,
  free, OAuth). We lose sleep and Body Battery, but keep activities.
- Cost: private repo = 2000 free minutes/month. 8 runs per day of about 1 min,
  i.e. ~250 min/month.

### Shopping — Cairn checklist
- The shopping list **is a Cairn checklist**, chosen once in Synapse's
  settings (`synapse.settings.cairn_shopping_checklist_id`). No table of its
  own: we benefit from the Cairn app and its Android widget.
- "Shopping" widget: unchecked items of that checklist, sorted by `position`.
  Items can be checked from Synapse (`update` of `is_done`).
- The chosen checklist must not be encrypted by the vault: Synapse can neither
  read nor write encrypted content. The picker therefore only offers
  checklists where `is_encrypted = false`.

### Recipes — home-made
- Tables `synapse.recipes` (title, ingredients, steps, source link) and
  `synapse.meal_plan(date, recipe_id)`.
- Recipe of the day: drawn from your own recipes (avoiding the last 14 days),
  with a one-off import from **TheMealDB** (free) to seed the collection.
- "Add ingredients to shopping" button: inserts one `checklist_items` row per
  ingredient into the chosen Cairn checklist, at the end of the list
  (`position` = max + 1). This is a **data** write, allowed by Cairn's RLS
  policy, not a change to its schema.

### Mood and habits — home-made entry
- No external source: everything is entered from the dashboard, in one click.
- Mood: a score from 1 to 5 per day (😞 → 😄) and an optional word, in
  `synapse.mood_entries` (key `user_id` + `day`). "Mood" widget: today's choice
  and the last 7 days.
- Habits: defined in the settings (`synapse.habits`, at most 10 active),
  checked every day (`synapse.habit_checks`, one row per day done). "Habits"
  widget: today's checkbox, the last 7 days and the current streak (days in a
  row; today not yet checked does not break it). Removing a habit archives it:
  its history stays.
- The "day" is the Europe/Paris date, computed on the Next server.
- A `(habit_id, user_id)` foreign key guarantees that you can only check your
  own habits, on top of RLS.

### Cash expenses — Google Sheet
- The "Dépenses Liquide" Google Sheet stays the source of truth, editable by
  hand. Target format: `Saisies` tab (`ID | Date | Montant | Catégorie |
  Remarque`, raw data only), `Catégories` (feeds the sheet's dropdown and the
  widget's list), `Récap` (`QUERY` formulas over `Saisies`, unaffected by
  additions and deletions).
- Access: `drive.file` scope (non-sensitive) added to Synapse's Google
  consent. The file is chosen once with the **Google Picker**; its id goes in
  `synapse.settings.cash_sheet_id`. The Picker's token is requested in the
  browser (Google Identity Services, `drive.file` only): the server's refresh
  token, which also reads Gmail, never leaves it.
- Reads and writes go through the `/api/cash` route handlers, on the Next
  server: the refresh token ciphertext is read by
  `synapse.google_refresh_token()` (SECURITY DEFINER, the caller's row only),
  then decrypted with `SYNAPSE_GOOGLE_TOKEN_KEY`. Still no `service_role` key
  on Vercel.
- Editing or deleting finds the row **by ID** (UUID in column A, hidden): the
  sheet may have changed since it was displayed. Dates as serial numbers,
  amounts as numbers (`valueInputOption=RAW`). 3 min Next cache, invalidated
  after each write.
- One-time migration from the `2026` tab: a preview where each anomaly has to
  be confirmed, then a single `spreadsheets.batchUpdate`; the source tab stays
  as an archive.

### Widget order — drag and drop
- Each user reorders the dashboard widgets (handle at the top right: mouse, touch, or
  keyboard with space then arrows, via `@dnd-kit`). The order is a list of ids
  per dashboard (`synapse.dashboard_widgets`, `saveWidgetOrder` Server Action), so it is the
  same on every device.
- Unknown ids, or ids absent from the dashboard, are ignored; choosing the widgets is
  admin-only (see below). **Settings** offers "Restore the default order" per dashboard.
- Sizes (4 or 8 columns) do not change; the `01…` numbering follows the position (CSS counter).

### Multiple dashboards — chosen widgets, public or private
- Each user has dashboards (`synapse.dashboards`: name, `visibility`, `is_default`) and, for
  each, the ordered list of its widgets (`synapse.dashboard_widgets`, order = `position`).
  The catalog (`WIDGETS` in `lib/dashboard.ts`) carries label, description, source and a
  "sensitive" flag. Migration `0010` carries the existing setup over: a default "Principal"
  dashboard, private (it used to be behind the lock), with every widget in the `widget_order`
  order (that column is now unused, to be dropped by a later migration). A user with no
  dashboard gets one on first access (`ensure_default_dashboard`).
- Admin area in **Settings**: create, rename, delete a dashboard (10 at most, the default one
  cannot be deleted), choose its visibility and widgets, set the default, restore the catalog
  order. Admin = `ADMIN_EMAILS`, otherwise every `ALLOWED_EMAILS` account (single-user app).
  The right is re-checked in every Server Action (`app/actions/dashboards.ts`), not just
  hidden. Dashboards belong to each user (RLS); a dashboard's widgets are set by its owner
  when they are an admin.
- Navigation: tabs in the dashboard header (`/?d=<id>`), the default one on `/`.
- Visibility: `private` = served only once the lock is lifted; `public` = Supabase session
  alone (no shareable link: separate ticket). The middleware lets a locked `GET /` through and
  the page refuses a private dashboard (`lib/lock/page.ts`, error = closed) before reading any
  data; Server Actions and `/api/*` routes stay closed while locked (so a public dashboard's
  widget actions too). A public dashboard rejects sensitive widgets (mails, Garmin, cash,
  mood), checked server-side.
- Without the lock enabled, private and public behave the same.

### Lock — local second factor
- Optional, per user. A `synapse.lock` row (code hash, `idle_minutes`, `epoch`, failure
  counter) = lock enabled; `synapse.lock_passkeys` lists the fingerprints (WebAuthn, platform
  authenticator, mandatory user verification).
- The code is hashed with `scrypt` after an HMAC with `SYNAPSE_LOCK_SECRET` (no
  `service_role` key: RLS is enough). The middleware requires a signed cookie (`httpOnly`,
  sliding expiry, bound to the user and the `epoch`) for every page, Server Action and
  `/api/*` route; exempt: `/unlock` (GET), `/api/lock/verify|lock|passkey/auth-*`, `/auth/*`.
  A read error or a missing secret = stays locked.
- Attempts: exponential delay from the 3rd failure (atomic `register_lock_failure` RPC),
  Supabase sign-out on the 10th.
- Auto-lock: 1, 5 or 15 min, or browser close; client side (`AutoLock`, inactivity and
  return from background) and server side (cookie expiry).
- Defaults chosen: code of 6 characters minimum (PIN or passphrase), lock covers the whole
  app, 5 min of inactivity.

### Homelab — postponed
- No source chosen for now (Uptime Kuma… remains possible). To be picked up in
  a dedicated ticket.

## 4. `synapse` schema

A dedicated Postgres schema, added to the Supabase API "Exposed schemas". RLS
`user_id = auth.uid()` on every table, as in Cairn.

| Table | Contents |
|---|---|
| `weather_locations` | weather cities (name, latitude, longitude, position) |
| `settings` | widget order, id of the Cairn shopping checklist, id of the cash expenses Google Sheet |
| `google_accounts` / `google_credentials` | connection state / encrypted refresh token (no policy) |
| `calendar_events` | event cache (Google id, start, end, title, location) |
| `mail_headers` | the last 20 received messages (id, sender, subject, snippet, date, read) |
| `garmin_daily` | one row per day: sleep, Body Battery, steps, resting HR |
| `garmin_activities` | one row per activity: type, duration, distance, HR, elevation gain |
| `recipes`, `meal_plan` | recipes (shopping lives in Cairn) |
| `mood_entries` | today's mood (1 to 5) and optional word |
| `habits` / `habit_checks` | tracked habits / checked days |
| `sync_runs` | job log (source, start, end, status, error) → "sync status" widget |

**Migrations — watch out.** The Supabase project already has a migration
history, the one from the Cairn repo. Running `supabase db push` from Synapse
would see those migrations as "unknown remote" ones and refuse to proceed.
Decision (phase 1): the `synapse` schema migrations live in `db/migrations/`
and are applied by `scripts/migrate.mjs` (Node + the `postgres` package on
`DATABASE_URL`, without depending on `psql`), with its own tracking table
`synapse.schema_migrations`. The Supabase CLI stays reserved for Cairn.

### Design system

Decision: the UI applies the *Synapse* design system (ship's console, dark only).
Tokens live in `app/tokens.css`, `hud-*` classes in `app/hud.css`, components in
`components/ui/`. The legacy Tailwind palettes (`slate`, `red`…) are aliased to the
tokens: existing screens follow without a rewrite, and new ones use the tokens directly.

## 5. Target layout

```
synapse/
  app/
    (dashboard)/page.tsx        widget grid
    api/google/connect|callback OAuth route handlers
    api/cash/                   cash expenses (Google Sheet)
    manifest.ts                 PWA manifest
  components/widgets/           Weather, Agenda, Mail, Todo, Sport, Meal, Shopping, Mood
  lib/
    supabase/{server,client}.ts
    connectors/                 one file per source, same interface
    types/{cairn,synapse}.ts    generated types
  db/migrations/                synapse schema
  supabase/functions/           synapse-google-sync (deployed to the shared project)
  jobs/garmin/sync.py           + requirements.txt
  .github/workflows/garmin-sync.yml
```

Common connector interface, so that the dashboard depends on no particular
source:

```ts
type Connector<T> = {
  id: 'weather' | 'google' | 'garmin' | 'cairn' | 'meals' | 'mood' | 'habits' | 'cash'
  read(userId: string): Promise<{ data: T; syncedAt: Date | null; error?: string }>
}
```

## 6. Phases

| Phase | Content | Deliverable |
|---|---|---|
| 1 | Next.js, Supabase sign-in (same account as Cairn), `synapse` schema + migration script, widget grid, PWA, **weather widget** | Dashboard online with the weather |
| 2 | **Cairn widgets**: today's to-dos, pinned notes, private counter, **shopping** (choosing the checklist, checking items) | Tasks and shopping without changing anything on the Cairn side |
| 3 | Google OAuth + sync Edge Function + `pg_cron` → **calendar** and **last 20 messages** | Day and inbox |
| 4 | **Garmin** workflow + sleep / activity / 7-day trend widgets | Sport |
| 5 | **Recipes**: collection, recipe of the day, ingredients → Cairn shopping checklist | Cooking |
| 6 | **Mood and habits**: quick daily entry; finances and homelab postponed | Well-being |
| 7 | **Cash expenses**: Google Sheet chosen with the Picker, file migration, CRUD from the dashboard | Finances |
| 8 | **Mind maps**: free-form maps (boxes, text, links) on React Flow, saved in `synapse.mindmaps` | Ideas and diagrams |

## 7. Free-tier limits to watch

| Service | Limit | Expected usage |
|---|---|---|
| Supabase free | 500 MB database, 500k Edge Function invocations/month, pause after 7 days of inactivity | A few MB; ~1500 invocations/month; no pause thanks to `pg_cron` and Cairn |
| Vercel Hobby | Non-commercial use, 100 GB bandwidth | One user |
| GitHub Actions | 2000 min/month (private) | ~250 min |
| Google APIs | Very generous Calendar/Gmail quotas; Sheets: 300 reads/min per project | Negligible |
| Open-Meteo | 10,000 calls/day (non-commercial) | ~50 |

## 8. Settled choices

- Mail: the last 20 inbox messages, with no notion of "important".
- Shopping: a Cairn checklist (not encrypted), no Synapse table.
- Garmin: no two-factor authentication for now; password login as a CI secret,
  tokens cached.
- Mood and habits: entered in Synapse only; homelab postponed.
- Cash expenses: the Google Sheet is the source of truth, Synapse keeps
  nothing of it in the database.
