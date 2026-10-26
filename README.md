# Synapse

*English version: [README.en.md](README.en.md).*

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
| `SYNAPSE_GOOGLE_PICKER_API_KEY` | Clé d'API du Google Picker, pour choisir le fichier des dépenses cash (voir « Dépenses cash ») |
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

### Recettes

Pages **Recettes** (`/recipes`) : saisie et édition (une ligne par ingrédient, quantité comprise ; une ligne par étape ; lien source facultatif), et import ponctuel depuis [TheMealDB](https://www.themealdb.com) pour amorcer la base (recherche par nom en anglais, ou au hasard ; 10 au plus par import, une recette déjà importée est ignorée).

Widget « Recette du jour » : tirée au premier affichage de la journée (fuseau `Europe/Paris`) par `synapse.pick_daily_recipe`, parmi les recettes non servies dans les 14 derniers jours (sinon la moins récente), et enregistrée dans `synapse.meal_plan`. Le bouton « Ajouter les ingrédients aux courses » crée un item Cairn par ingrédient, en fin de la checklist choisie dans **Réglages** (`position` = max + 1). Écriture de données, jamais dans une checklist du coffre.

Mise en place : migration `0004_recipes.sql` (`npm run db:migrate`).

### Humeur et habitudes

Widget « Humeur » : un clic sur 😞 🙁 😐 🙂 😄 enregistre l’humeur du jour (fuseau `Europe/Paris`), un mot facultatif peut s’y ajouter ; les 7 derniers jours s’affichent dessous. Widget « Habitudes » : une case par habitude pour aujourd’hui, les 7 derniers jours et la série en cours (🔥 jours d’affilée, plafonnée à 90+).

Les habitudes se gèrent dans **Réglages** (10 actives au plus). « Retirer » une habitude la masque sans effacer ses jours cochés. Tables `synapse.mood_entries`, `synapse.habits`, `synapse.habit_checks`.

Mise en place : migration `0005_mood_habits.sql` (`npm run db:migrate`).

### Dépenses cash (Google Sheet)

Widget « Dépenses cash » (ajout rapide, total du mois en cours, 5 dernières dépenses) et page **Dépenses** (`/cash` : un mois à la fois, total par catégorie, édition en ligne, suppression après confirmation). Les données vivent dans le Google Sheet « Dépenses Liquide », qui reste la source de vérité et s’édite toujours à la main :

- onglet `Saisies` : `ID | Date | Montant | Catégorie | Remarque`, une ligne par dépense, toutes années confondues (ID masqué, écrit par Synapse ; une ligne ajoutée à la main en reçoit un à la lecture suivante) ;
- onglet `Catégories` : une par ligne, sous l’en-tête ; il alimente la liste déroulante de la feuille et celle du widget (une catégorie créée depuis le widget y est ajoutée) ;
- onglet `Récap` : formules `QUERY` sur `Saisies` (total par catégorie, par année, croisé mois × catégorie).

Synapse lit et écrit le fichier depuis le serveur (route handlers `/api/cash`), avec le refresh token Google : dates en numéro de série, montants en nombre (`RAW`), validation identique à celle de la feuille (date valide, montant > 0, catégorie connue). Lecture en cache Next 3 min, invalidé après chaque écriture. Rien n’est copié en base hormis l’id du fichier (`synapse.settings.cash_sheet_id`).

Mise en place, une seule fois :

1. **Google Cloud** (même projet) : activer *Google Sheets API* et *Google Picker API*. Écran de consentement : ajouter le scope `drive.file` (non sensible : seuls les fichiers choisis dans le Picker). Client OAuth de Synapse : ajouter `<NEXT_PUBLIC_SITE_URL>` (et `http://localhost:3000`) aux **Origines JavaScript autorisées**, pour le jeton du Picker. Créer une **clé d’API** restreinte à la *Google Picker API* et au référent `<NEXT_PUBLIC_SITE_URL>/*`, à mettre dans `SYNAPSE_GOOGLE_PICKER_API_KEY` (Vercel).
2. **Migration** `0006_cash.sql` (`npm run db:migrate`) : colonne `cash_sheet_id`, fonctions `google_refresh_token()` (chiffré de l’appelant, déchiffré par le serveur Next) et `flag_google_reauth()`.
3. **Réglages > Reconnecter Google**, pour accorder `drive.file`, puis **Choisir le fichier** (Google Picker).
4. Au premier branchement, le widget propose **Migrer le fichier** : lecture de l’onglet `2026`, aperçu avec chaque anomalie à valider (une date invalide n’est jamais corrigée d’office : `24.20.2026` → `24.10.2026` proposé), puis création des trois onglets et recopie des lignes en un seul `batchUpdate`. L’onglet `2026` reste intact, en archive. Relancée, la migration ne crée rien si `Saisies` existe. Le contrôle final compare lignes et total à la source (et à sa ligne `TOTAL`). Vérifier ensuite le rendu de l’onglet `Récap`.

### Connexion

On se connecte avec le compte Cairn (email/mot de passe ou Google). Dans Supabase, **Authentication > URL Configuration**, ajouter `<NEXT_PUBLIC_SITE_URL>/auth/callback` (et `http://localhost:3000/auth/callback` en local) aux *Redirect URLs*.

### Déploiement (Vercel Hobby)

Importer le dépôt dans Vercel (preset Next.js), renseigner les variables ci-dessus, puis déployer. Installer ensuite l'appli depuis le navigateur du téléphone (« Ajouter à l'écran d'accueil »).

Les icônes PWA sont régénérables avec `node scripts/generate-icons.mjs`.
