# Synapse

Dashboard de pilotage du quotidien.

## Blocs prévus

- **Agenda & tâches** — rendez-vous du jour, to-do, priorités
- **Habitudes & santé** — habitudes, sommeil, sport, humeur
- **Finances** — budget, dépenses du mois
- **Infos du jour** — météo, actus, mails importants, homelab

## Stack

Next.js (PWA) + Supabase (projet partagé avec Cairn), jobs de sync via `pg_cron`/Edge Functions et GitHub Actions. 100 % gratuit.
Détails, sources et étapes : [docs/PLAN.md](docs/PLAN.md).

## Démarrage

```bash
cp .env.example .env.local   # renseigner les variables (voir ci-dessous)
npm install
npm run dev                  # http://localhost:3000
```

Scripts : `npm run build`, `npm run lint`, `npm run typecheck`.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projet Supabase **partagé avec Cairn** (Settings > API) |
| `NEXT_PUBLIC_SITE_URL` | URL publique de Synapse (redirection OAuth Google : `<url>/api/google/callback`) |
| `SYNAPSE_GOOGLE_CLIENT_ID` / `SYNAPSE_GOOGLE_CLIENT_SECRET` | Client OAuth Google de Synapse (voir « Agenda et mails ») |
| `SYNAPSE_GOOGLE_TOKEN_KEY` | Clé de chiffrement du refresh token Google, 64 caractères hexadécimaux, la même que dans les secrets des Edge Functions |
| `NEXT_PUBLIC_CAIRN_URL` | URL web de Cairn, liens « Ouvrir dans Cairn » (utilisée dès la phase 2) |
| `DATABASE_URL` | Local uniquement : connexion Postgres pour les migrations (Supabase > Connect > *Session pooler*) |
| `SUPABASE_PROJECT_REF` | Local uniquement : id du projet, pour générer les types |

### Base de données (schéma `synapse`)

Le projet Supabase est partagé avec Cairn, dont le repo gère l'historique des migrations via le CLI Supabase. **Ne jamais lancer `supabase db push` depuis Synapse.** Synapse a son propre mécanisme, limité au schéma `synapse` :

- les migrations sont dans `db/migrations/NNNN_nom.sql`, appliquées dans l'ordre, chacune dans une transaction ;
- leur suivi est dans `synapse.schema_migrations` (avec une empreinte : une migration déjà appliquée ne doit plus être modifiée, on en écrit une nouvelle) ;
- le script refuse toute migration qui touche à `public.*` (tables Cairn).

```bash
npm run db:status    # migrations appliquées / en attente
npm run db:migrate   # applique les migrations en attente
npm run db:types     # régénère lib/types/{synapse,cairn}.ts (après `supabase login`)
```

Une seule fois, après la première migration : ajouter `synapse` dans Supabase **Settings > API > Exposed schemas** (sinon l'API renvoie « The schema must be one of the following »).

### Météo

Prévisions Open-Meteo (gratuit, sans clé), appelées côté serveur et mises en cache 30 min. Sans réglage, la position est Paris. Pour en changer (dans Supabase > SQL Editor) :

```sql
insert into synapse.settings (user_id, weather_label, weather_latitude, weather_longitude)
values ('<uuid du compte>', 'Strasbourg', 48.5734, 7.7521)
on conflict (user_id) do update set
  weather_label = excluded.weather_label,
  weather_latitude = excluded.weather_latitude,
  weather_longitude = excluded.weather_longitude;
```

### To-do et courses (Cairn)

Les widgets « À faire » et « Courses » lisent directement les tables Cairn (`notes`, `checklist_items`, `reminders`) avec la session : la RLS de Cairn fait le filtrage. Synapse n'y écrit que des données (cocher un item), jamais de schéma.

- **À faire** : items non cochés des checklists non archivées et non supprimées ; ceux dont l'échéance (`due_at`, sinon le premier rappel) tombe aujourd'hui ou est dépassée passent en tête (fuseau `Europe/Paris`). Puis les notes épinglées.
- **Coffre** : un contenu chiffré n'est jamais lu, seulement compté (« 3 éléments privés ») ; une note privée ou masquée apparaît sous son nom de code, sans le texte de ses items.
- **Courses** : la checklist se choisit dans **Réglages** (`/settings`), parmi les checklists non chiffrées. Ses items ne sont pas repris dans « À faire ».
- Les liens « Ouvrir dans Cairn » utilisent `NEXT_PUBLIC_CAIRN_URL` (sans cette variable, pas de lien).

### Agenda et mails (Google)

Widgets « Agenda » (aujourd’hui, puis les 7 jours suivants) et « Mails » (en-têtes des 20 derniers mails de la boîte de réception, clic → Gmail). Le dashboard lit un cache (`synapse.calendar_events`, `synapse.mail_headers`) rempli toutes les 30 min par l’Edge Function `synapse-google-sync`, déclenchée par `pg_cron`. Chaque passage laisse une ligne dans `synapse.sync_runs`. Lecture seule : `calendar.readonly` + `gmail.readonly`, jamais le corps d’un mail.

Le refresh token est chiffré (AES-GCM) par `/api/google/callback`, puis stocké dans `synapse.google_credentials` (RLS sans politique : illisible côté client). Si Google le refuse, un bandeau « Reconnecter Google » apparaît sur le dashboard.

Mise en place, une seule fois :

1. **Google Cloud** (projet de Cairn) : activer *Google Calendar API* et *Gmail API*. Créer un client OAuth **« Application Web »** propre à Synapse, avec comme URI de redirection `<NEXT_PUBLIC_SITE_URL>/api/google/callback` (et `http://localhost:3000/api/google/callback` en local). Écran de consentement : ajouter les scopes `calendar.readonly` et `gmail.readonly`, puis **publier en Production sans demander la vérification**. En mode Test, les refresh tokens expirent au bout de 7 jours. L’écran de consentement est commun à tout le projet Google Cloud : Cairn passe lui aussi en Production.
2. **Secrets.** Générer deux valeurs : `openssl rand -hex 32` pour la clé de chiffrement, et une seconde fois pour le secret de pg_cron. Sur Vercel, renseigner `SYNAPSE_GOOGLE_CLIENT_ID`, `SYNAPSE_GOOGLE_CLIENT_SECRET` et `SYNAPSE_GOOGLE_TOKEN_KEY`. Dans le projet Supabase :
   ```bash
   supabase secrets set --project-ref <ref> \
     SYNAPSE_GOOGLE_CLIENT_ID=… SYNAPSE_GOOGLE_CLIENT_SECRET=… \
     SYNAPSE_GOOGLE_TOKEN_KEY=<même clé que Vercel> SYNAPSE_CRON_SECRET=<secret pg_cron>
   ```
   Les noms sont préfixés `SYNAPSE_` parce que le projet, et donc ses secrets, sont partagés avec Cairn (`GOOGLE_TOKEN_KEY`, `GOOGLE_CLIENT_ID_WEB`…).
3. **Edge Function**, depuis ce repo (ça ne déploie que cette fonction, rien d’autre de Cairn) :
   ```bash
   supabase functions deploy synapse-google-sync --project-ref <ref>
   ```
   `supabase/config.toml` la déclare sans vérification JWT : pg_cron n’a pas de session, et la fonction vérifie elle-même le secret ou la session.
4. **Migration** `0002_google.sql` (`npm run db:migrate`) : tables, fonctions, extensions `pg_cron` / `pg_net` et planification toutes les 30 min.
5. **Vault** (Supabase > SQL Editor). L’URL et le secret appelés par pg_cron y sont lus à chaque passage :
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'synapse_functions_url');
   select vault.create_secret('<secret pg_cron>', 'synapse_cron_secret');
   ```
6. Dans Synapse, **Réglages > Connecter Google**. Une première synchro part tout de suite ; le bouton « Synchroniser maintenant » en relance une.

Suivre les passages : `select * from synapse.sync_runs order by started_at desc limit 10;` et, côté pg_cron, `select * from cron.job_run_details order by start_time desc limit 10;`. « Déconnecter » efface le jeton et le cache ; l’autorisation se retire aussi chez Google (myaccount.google.com/permissions).

### Sport (Garmin)

Widgets « Sommeil » (nuit, phases, Body Battery), « Activités » (les 5 dernières, clic → Garmin Connect) et « 7 derniers jours » (pas, FC au repos). Ils lisent `synapse.garmin_daily` et `synapse.garmin_activities`, remplies toutes les 3 h par le workflow GitHub Actions `garmin-sync` (`jobs/garmin/sync.py`, lib non officielle [`garminconnect`](https://github.com/cyberjunky/python-garminconnect)). Chaque passage relit les 3 derniers jours et laisse une ligne dans `synapse.sync_runs`.

Jetons de session : le job les garde d’un passage à l’autre dans le cache Actions, chiffrés (AES-256, `GARMIN_TOKEN_KEY`). Il ne se reconnecte avec le mot de passe que s’ils sont absents ou refusés, Garmin bloquant un compte qui se reconnecte trop souvent. Le cache est réécrit seulement quand les jetons changent.

Mise en place, une seule fois :

1. **Migration** `0003_garmin.sql` : `npm run db:migrate`.
2. **Secrets GitHub** (Settings > Secrets and variables > Actions) :

   | Secret | Valeur |
   |---|---|
   | `GARMIN_EMAIL` / `GARMIN_PASSWORD` | compte Garmin Connect (sans double authentification) |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` (Settings > API) ; ne va jamais sur Vercel |
   | `SYNAPSE_USER_ID` | uuid du compte Cairn/Synapse (Authentication > Users) |
   | `GARMIN_TOKEN_KEY` | chiffrement des jetons en cache : `openssl rand -hex 32` |

3. **Premier passage** : Actions > *Garmin sync* > *Run workflow*, avec `days` = 30 pour amorcer l’historique.

Si la synchro échoue (`select * from synapse.sync_runs where source = 'garmin' order by started_at desc limit 5;`) : « Garmin limite les connexions » se résout seul au passage suivant ; « Connexion Garmin refusée » demande de vérifier le mot de passe. Changer `GARMIN_TOKEN_KEY` force une reconnexion par mot de passe. Tests du parsing : `cd jobs/garmin && python -m unittest test_sync.py`.

### Connexion

On se connecte avec le compte Cairn (email/mot de passe ou Google). Dans Supabase, **Authentication > URL Configuration**, ajouter `<NEXT_PUBLIC_SITE_URL>/auth/callback` (et `http://localhost:3000/auth/callback` en local) aux *Redirect URLs*.

### Déploiement (Vercel Hobby)

Importer le dépôt dans Vercel (preset Next.js), renseigner les variables ci-dessus, puis déployer. Installer ensuite l'appli depuis le navigateur du téléphone (« Ajouter à l'écran d'accueil »).

Les icônes PWA sont régénérables avec `node scripts/generate-icons.mjs`.
