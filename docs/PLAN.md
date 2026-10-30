# Plan technique — Synapse

*Version anglaise : [PLAN.en.md](PLAN.en.md).*

Dashboard perso qui réunit sport (Garmin), agenda, mails, to-do et courses Cairn,
recette du jour, météo, humeur et habitudes. Contraintes : **100 % gratuit**,
utilisable dans le navigateur, puis sur mobile.

## 1. Décisions

| Question | Décision | Pourquoi |
|---|---|---|
| Microservices REST ? | **Non.** Une seule appli Next.js, un module « connecteur » par source | Un seul utilisateur : des services séparés multiplieraient les déploiements, les secrets et les hébergements à surveiller, sans rien apporter |
| Front | Next.js (App Router) + TypeScript + Tailwind | Choix de départ |
| Base & auth | **Le même projet Supabase que Cairn** | Même compte utilisateur, les to-do Cairn sont lisibles directement via RLS, sans API à écrire ; on reste à un seul projet free (le plan gratuit en autorise deux) et l'usage quotidien de Cairn évite la mise en pause pour inactivité |
| Récupération des données | Jobs planifiés qui écrivent en base ; le front lit la base | Affichage instantané, quotas des API respectés, dernière valeur connue si une source tombe |
| Jobs planifiés | Supabase `pg_cron` + Edge Functions (TypeScript/Deno) ; GitHub Actions pour Garmin (Python) | Mêmes outils que Cairn ; Garmin n'a de lib fiable qu'en Python |
| Hébergement front | Vercel Hobby (ou Netlify, comme Cairn) | Gratuit pour un usage non commercial |
| Mobile | **PWA** d'abord ; Capacitor plus tard si besoin | Les stores sont payants (Apple 99 $/an, Google 25 $) ; une PWA s'installe gratuitement sur l'écran d'accueil |
| Tests | Vitest, fichiers `*.test.ts` à côté du code ; Supabase, `fetch` et l'horloge simulés ; e2e Playwright (`e2e/*.spec.ts`) contre une Supabase locale, API externes (Google, Open-Meteo, TheMealDB) simulées : la connexion, les recettes, les courses, les to-do, l'humeur, les habitudes, Cash, les cartes mentales, les dashboards, le verrouillage, les réglages et la météo ont chacun un parcours navigateur ; CI GitHub Actions (typecheck, lint, tests, e2e) | Modifier l'app en sachant tout de suite si un comportement existant casse |

## 2. Architecture

```
┌──────────────── Next.js (Vercel Hobby) ────────────────┐
│  Dashboard React (PWA)                                 │
│  Server Components : lecture Supabase avec la session  │
│  Route handlers /api/* : OAuth Google, actions         │
│  lib/connectors/{weather,google,garmin,cairn,meals,    │
│                  mood}.ts                              │
└──────────────────────────┬─────────────────────────────┘
                           │ supabase-js (clé anon + RLS)
┌──────────────────────────▼─────────────────────────────┐
│ Projet Supabase partagé avec Cairn                      │
│  public.*   → tables Cairn (lecture seule pour Synapse) │
│  synapse.*  → tables propres à Synapse                  │
│  Edge Functions synapse-* + pg_cron (sync Google)       │
└──────────────────────────▲─────────────────────────────┘
                           │ clé service_role (secret CI)
              ┌────────────┴─────────────┐
              │ GitHub Actions (cron)     │
              │ sync Garmin, toutes les 3h│
              └───────────────────────────┘
```

Seules la météo et les dépenses cash sont appelées en direct depuis le serveur
Next (avec mise en cache) : la météo ne demande ni clé ni stockage, et le Google
Sheet des dépenses est lui-même la source de vérité.

## 3. Sources

### Météo — Open-Meteo
- Gratuit, sans clé. Prévisions du jour et des heures à venir, pour une ou
  plusieurs villes (cinq au plus) choisies dans les réglages (géocodage Open-Meteo).
- Cache Next de 30 min.

### Agenda & Gmail — Google APIs
- Un **projet Google Cloud dédié à Synapse**, avec un client OAuth « Web »
  unique, qui sert aussi à la connexion (provider Google de Supabase Auth).
  Consentement propre à Synapse : `calendar.readonly` + `gmail.readonly`
  (+ `drive.file` pour les dépenses cash, voir plus bas). Le projet de Cairn
  n'est pas touché ; ses écrans de consentement et ses quotas restent séparés.
- Le refresh token reste côté serveur, chiffré, dans une table sans politique
  RLS. C'est le modèle `google_credentials` de Cairn, à reprendre tel quel
  (`supabase/functions/_shared/chiffrement.ts`), mais dans une table
  `synapse.google_credentials` distincte : Cairn n'a que le scope
  `calendar.events`, et révoquer l'un ne doit pas couper l'autre.
- Répartition (phase 3) : l'échange du code se fait dans `/api/google/callback`
  (Next, secret client côté serveur), qui chiffre le refresh token et l'enregistre
  via `synapse.save_google_connection()` (SECURITY DEFINER, limitée à
  `auth.uid()`) : pas de clé `service_role` sur Vercel. L'Edge Function, elle,
  déchiffre avec la même clé. Secrets préfixés `SYNAPSE_` : ceux des Edge
  Functions sont partagés avec Cairn.
- ⚠️ En mode « Test » de l'écran de consentement, les refresh tokens expirent
  après 7 jours. Passer l'application en **Production sans vérification**
  (écran d'avertissement à la connexion, limite de 100 comptes) supprime
  l'expiration. `gmail.readonly` est un scope *restreint* : la vérification
  coûte cher, d'où ce choix de ne pas la demander.
- Sync : Edge Function `synapse-google-sync` déclenchée par `pg_cron` toutes
  les 30 min. Elle stocke les évènements de J-1 à J+7 et les en-têtes des
  **20 derniers mails de la boîte de réception** (expéditeur, sujet, extrait,
  date, lu/non lu). Jamais le corps complet. Le cache est remplacé à chaque
  passage : il ne contient jamais plus de 20 lignes. Pas de tri « important ».
- Clic sur un mail → ouverture dans Gmail
  (`https://mail.google.com/mail/u/0/#inbox/<id>`).

### To-do — Cairn
- Lecture directe des tables `notes`, `checklist_items` et `reminders`, avec la
  session de l'utilisateur. RLS (`user_id = auth.uid()`) fait le travail, il
  n'y a aucune API à écrire.
- Widget « À faire » : items non cochés de checklists non archivées et non
  supprimées, avec `due_at` aujourd'hui ou en retard en tête, puis les notes
  épinglées.
- **Respecter le coffre de Cairn** :
  - `is_encrypted = true` → pas de contenu lisible sans la clé du coffre ;
    Synapse n'affiche qu'un compteur (« 3 éléments privés »). Il ne demande
    jamais la clé de récupération.
  - `is_private` / `hide_content` → afficher `code_name` à la place du titre,
    comme le fait Cairn.
- Cocher un item depuis Synapse : un `update` de `is_done`, autorisé
  par la même politique RLS. Bouton « Ouvrir dans Cairn » vers
  `NEXT_PUBLIC_CAIRN_URL/note/<id>`.
- Synapse n'écrit dans Cairn que des données : cocher un item, ajouter des
  ingrédients aux courses. Il **n'écrit jamais** de migration sur les tables
  Cairn. Si le schéma
  Cairn bouge, les types sont regénérés côté Synapse
  (`supabase gen types typescript`).

### Sport — Garmin
- Il n'existe pas d'API officielle pour un particulier : le Garmin Connect
  Developer Program est réservé aux entreprises, sur dossier.
- Choix : la lib non officielle **`python-garminconnect`** dans un workflow
  GitHub Actions (cron toutes les 3 h). Elle récupère activités, sommeil, Body
  Battery, pas, FC au repos et VO2max, puis fait un upsert dans
  `synapse.garmin_*` avec la clé `service_role` (secret GitHub).
- Le compte n'a pas de double authentification : email et mot de passe sont
  stockés en secrets GitHub (`GARMIN_EMAIL`, `GARMIN_PASSWORD`), et le job peut
  se connecter seul.
- Les jetons de session (DI OAuth de Garmin ; la lib a abandonné `garth` en
  0.3, qui ne lit plus ses anciens jetons) sont quand même mis en
  cache entre deux exécutions, dans le cache GitHub Actions et chiffrés avec un
  secret : Garmin limite les connexions répétées et bloque temporairement un
  compte qui se reconnecte toutes les 3 h. Le job ne se reconnecte avec le mot
  de passe que si les jetons sont absents ou refusés.
- Si la double authentification est activée un jour : générer les jetons une
  fois en local (`Garmin(email, mdp).login("<dossier>")`, code MFA saisi à la
  main), puis les déposer en secret GitHub. Le job ne
  touche alors plus jamais au mot de passe.
- ⚠️ Fragile par nature : Garmin change son authentification de temps en
  temps. **Plan B** : synchro automatique Garmin → Strava, puis l'API Strava
  (officielle, gratuite, OAuth). On y perd sommeil et Body Battery, mais les
  activités restent.
- Coût : dépôt privé = 2000 min/mois gratuites. 8 passages par jour d'environ
  1 min, soit ~250 min/mois.

### Courses — checklist Cairn
- La liste de courses **est une checklist Cairn**, choisie une fois dans les
  réglages de Synapse (`synapse.settings.cairn_shopping_checklist_id`). Pas de table
  propre : on profite de l'appli Cairn et de son widget Android.
- Widget « Courses » : items non cochés de cette checklist, triés par
  `position`. On peut cocher depuis Synapse (`update` de `is_done`).
- La checklist choisie ne doit pas être chiffrée par le coffre : Synapse ne
  sait ni lire ni écrire un contenu chiffré. Le sélecteur ne propose donc que
  les checklists où `is_encrypted = false`.

### Recettes — maison
- Tables `synapse.recipes` (titre, ingrédients, étapes, lien source) et
  `synapse.meal_plan(date, recipe_id)`.
- Recette du jour : tirage dans ses propres recettes (en évitant les 14
  derniers jours), avec un import ponctuel depuis **TheMealDB** (gratuit) pour
  amorcer la base.
- Bouton « ajouter les ingrédients aux courses » : insère un
  `checklist_items` par ingrédient dans la checklist Cairn choisie, en fin de
  liste (`position` = max + 1). C'est une écriture de **données**, autorisée par
  la politique RLS de Cairn, et non une modification de son schéma.

### Humeur et habitudes — saisie maison
- Pas de source externe : tout se saisit depuis le dashboard, en un clic.
- Humeur : une note de 1 à 5 par jour (😞 → 😄) et un mot facultatif, dans
  `synapse.mood_entries` (clé `user_id` + `day`). Widget « Humeur » : le choix du
  jour et les 7 derniers jours.
- Habitudes : définies dans les réglages (`synapse.habits`, 10 actives au plus),
  cochées chaque jour (`synapse.habit_checks`, une ligne par jour fait). Widget
  « Habitudes » : case du jour, 7 derniers jours et série en cours (jours
  d'affilée ; aujourd'hui pas encore coché ne la casse pas). Retirer une
  habitude l'archive : son historique reste.
- Le « jour » est la date Europe/Paris, calculée côté serveur Next.
- Une clé étrangère `(habit_id, user_id)` garantit qu'on ne coche que ses
  propres habitudes, en plus de la RLS.

### Dépenses cash — Google Sheet
- Le Google Sheet « Dépenses Liquide » reste la source de vérité, éditable à la
  main. Format cible : onglet `Saisies` (`ID | Date | Montant | Catégorie |
  Remarque`, données brutes uniquement), `Catégories` (alimente la liste
  déroulante de la feuille et celle du widget), `Récap` (formules `QUERY` sur
  `Saisies`, insensibles aux ajouts et suppressions).
- Accès : scope `drive.file` (non sensible) ajouté au consentement Google de
  Synapse. Le fichier se choisit une fois avec le **Google Picker** ; son id va
  dans `synapse.settings.cash_sheet_id`. Le jeton du Picker est demandé dans le
  navigateur (Google Identity Services, `drive.file` seul) : le refresh token
  du serveur, qui lit aussi Gmail, n'en sort jamais.
- Lecture et écriture par les route handlers `/api/cash`, côté serveur Next :
  le chiffré du refresh token est lu par `synapse.google_refresh_token()`
  (SECURITY DEFINER, ligne de l'appelant seulement), déchiffré avec
  `SYNAPSE_GOOGLE_TOKEN_KEY`. Toujours pas de clé `service_role` sur Vercel.
- Modifier ou supprimer retrouve la ligne **par ID** (UUID en colonne A,
  masquée) : la feuille a pu bouger depuis l'affichage. Dates en numéro de
  série, montants en nombre (`valueInputOption=RAW`). Cache Next de 3 min,
  invalidé après chaque écriture.
- Migration unique depuis l'onglet `2026` : aperçu avec chaque anomalie à
  valider, puis un seul `spreadsheets.batchUpdate` ; l'onglet source reste en
  archive.

### Ordre des widgets — glisser-déposer
- Chaque utilisateur réordonne les widgets du dashboard (poignée en haut à droite : souris,
  tactile, ou clavier avec espace puis flèches, via `@dnd-kit`). L'ordre est une liste d'ids
  par dashboard (`synapse.dashboard_widgets`, Server Action `saveWidgetOrder`), donc la même sur
  tous les appareils.
- Les ids inconnus ou absents du dashboard sont ignorés ; le choix des widgets est réservé à
  l'admin (voir plus bas). **Réglages** propose « Rétablir l'ordre par défaut » par dashboard.
- L'admin peut aussi changer l'ordre dans **Réglages → Dashboards** avec les boutons monter/descendre
  de chaque widget (clavier et tactile) ; l'ordre est celui de la liste des widgets du dashboard, enregistré avec le
  formulaire (`saveDashboard`), dans la même table `synapse.dashboard_widgets`, donc le même que sur
  le dashboard.
- Les tailles (4 ou 8 colonnes) ne changent pas ; la numérotation `01…` suit la position
  (compteur CSS).

### Dashboards multiples — widgets au choix, publics ou privés
- Chaque utilisateur a des dashboards (`synapse.dashboards` : nom, `visibility`, `is_default`) et,
  pour chacun, la liste ordonnée de ses widgets (`synapse.dashboard_widgets`, ordre = `position`).
  Le catalogue (`WIDGETS` dans `lib/dashboard.ts`) porte libellé, description, source et drapeau
  « sensible ». La migration `0010` reprend l'existant : un dashboard « Principal » par défaut,
  privé (il était derrière le verrou), avec tous les widgets dans l'ordre de `widget_order`
  (colonne devenue inutilisée, à supprimer par une migration ultérieure). Un utilisateur sans
  dashboard reçoit le sien au premier accès (`ensure_default_dashboard`).
- Zone admin dans **Réglages** : créer, renommer, supprimer un dashboard (10 au plus, le dashboard
  par défaut ne se supprime pas), choisir sa visibilité et ses widgets (liste compacte des widgets du dashboard avec « Retirer », et un sélecteur « Ajouter un widget » : recherche, regroupement par source, sélection multiple, ajout en fin de liste, widgets sensibles désactivés sur un dashboard public), désigner le défaut,
  rétablir l'ordre du catalogue. Administrateur = `ADMIN_EMAILS`, sinon tout compte de
  `ALLOWED_EMAILS` (application mono-utilisateur). Le droit est revérifié dans chaque Server
  Action (`app/actions/dashboards.ts`), pas seulement masqué. Les dashboards sont propres à
  chaque utilisateur (RLS) ; les widgets d'un dashboard sont réglés par son propriétaire admin.
- Navigation : onglets dans l'en-tête du dashboard (`/?d=<id>`), le défaut sur `/`.
- Visibilité : `private` = servi seulement une fois le verrouillage levé ; `public` = session
  Supabase seule (pas de lien partageable : ticket à part). Le middleware laisse passer `GET /`
  verrouillé et la page refuse un dashboard privé (`lib/lock/page.ts`, erreur = fermé) avant de
  lire la moindre donnée ; Server Actions et routes `/api/*` restent fermées verrouillé (donc
  les actions des widgets d'un dashboard public aussi). Un dashboard public refuse les widgets
  sensibles (mails, Garmin, cash, humeur), contrôle côté serveur.
- Sans verrouillage activé, privé et public se comportent pareil.

### Verrouillage — second facteur local
- Optionnel, par utilisateur. Une ligne `synapse.lock` (hash du code, `idle_minutes`, `epoch`,
  compteur d'échecs) = verrouillage activé ; `synapse.lock_passkeys` liste les empreintes
  (WebAuthn, authentificateur de plateforme, vérification utilisateur obligatoire).
- Le code est haché par `scrypt` après un HMAC avec `SYNAPSE_LOCK_SECRET` (aucune clé
  `service_role` : la RLS suffit). Le middleware exige un cookie signé (`httpOnly`, expiration
  glissante, lié à l'utilisateur et à l'`epoch`) pour toute page, Server Action et route
  `/api/*` ; exemptés : `/unlock` (GET), `/api/lock/verify|lock|passkey/auth-*`, `/auth/*`.
  Erreur de lecture ou secret absent = reste verrouillé.
- Essais : temporisation exponentielle dès le 3ᵉ échec (RPC atomique
  `register_lock_failure`), déconnexion Supabase au 10ᵉ.
- Auto-verrouillage : 1, 5 ou 15 min, ou fermeture du navigateur ; côté client
  (`AutoLock`, inactivité + retour d'arrière-plan) et côté serveur (expiration du cookie).
- Choix par défaut : code de 6 caractères au moins (PIN ou phrase de passe), verrou sur
  toute l'application, 5 min d'inactivité.

### Homelab — reporté
- Pas de source retenue pour l'instant (Uptime Kuma… reste possible). À
  reprendre dans un ticket dédié.

## 4. Schéma `synapse`

Schéma Postgres dédié, ajouté aux « Exposed schemas » de l'API Supabase. RLS
`user_id = auth.uid()` sur chaque table, comme dans Cairn.

| Table | Contenu |
|---|---|
| `weather_locations` | villes de la météo (nom, latitude, longitude, position) |
| `settings` | ordre des widgets, id de la checklist Cairn des courses, id du Google Sheet des dépenses cash |
| `google_accounts` / `google_credentials` | état de connexion / refresh token chiffré (sans politique) |
| `calendar_events` | cache des évènements (id Google, début, fin, titre, lieu) |
| `mail_headers` | les 20 derniers mails reçus (id, expéditeur, sujet, extrait, date, lu) |
| `garmin_daily` | une ligne par jour : sommeil, Body Battery, pas, FC repos |
| `garmin_activities` | une ligne par activité : type, durée, distance, FC, dénivelé |
| `recipes`, `meal_plan` | recettes (les courses sont dans Cairn) |
| `mood_entries` | humeur du jour (1 à 5) et mot facultatif |
| `habits` / `habit_checks` | habitudes suivies / jours cochés |
| `sync_runs` | journal des jobs (source, début, fin, statut, erreur) → widget « état des syncs » |

**Migrations — point d'attention.** Le projet Supabase a déjà un historique de
migrations, celui du repo Cairn. Lancer `supabase db push` depuis Synapse
verrait ces migrations comme « distantes inconnues » et refuserait d'avancer.
Décision (phase 1) : les migrations du schéma `synapse` vivent dans
`db/migrations/` et sont appliquées par `scripts/migrate.mjs` (Node + paquet
`postgres` sur `DATABASE_URL`, sans dépendre de `psql`), avec sa propre table de
suivi `synapse.schema_migrations`. Le CLI Supabase reste réservé à Cairn.

### Design system

Décision : l'interface applique le design system *Synapse* (poste de pilotage, sombre
uniquement). Tokens dans `app/tokens.css`, classes `hud-*` dans `app/hud.css`,
composants dans `components/ui/`. Les palettes Tailwind historiques (`slate`, `red`…)
sont aliasées sur les tokens : les écrans existants suivent sans réécriture, et les
nouveaux utilisent directement les tokens.

## 5. Arborescence cible

```
synapse/
  app/
    (dashboard)/page.tsx        grille de widgets
    api/google/connect|callback route handlers OAuth
    api/cash/                   dépenses cash (Google Sheet)
    manifest.ts                 manifeste PWA
  components/widgets/           Weather, Agenda, Mail, Todo, Sport, Meal, Shopping, Mood
  lib/
    supabase/{server,client}.ts
    connectors/                 un fichier par source, même interface
    types/{cairn,synapse}.ts    types générés
  db/migrations/                schéma synapse
  supabase/functions/           synapse-google-sync (déployée dans le projet partagé)
  jobs/garmin/sync.py           + requirements.txt
  .github/workflows/garmin-sync.yml
```

Interface commune d'un connecteur, pour que le dashboard ne dépende d'aucune
source en particulier :

```ts
type Connector<T> = {
  id: 'weather' | 'google' | 'garmin' | 'cairn' | 'meals' | 'mood' | 'habits' | 'cash'
  read(userId: string): Promise<{ data: T; syncedAt: Date | null; error?: string }>
}
```

## 6. Étapes

| Phase | Contenu | Livrable |
|---|---|---|
| 1 | Next.js, connexion Supabase (même compte que Cairn), schéma `synapse` + script de migration, grille de widgets, PWA, **widget météo** | Dashboard en ligne avec la météo |
| 2 | **Widgets Cairn** : to-do du jour, épinglés, compteur privé, **courses** (choix de la checklist, cocher) | Tâches et courses sans rien changer côté Cairn |
| 3 | OAuth Google + Edge Function de sync + `pg_cron` → **agenda** et **20 derniers mails** | Journée et boîte de réception |
| 4 | Workflow **Garmin** + widgets sommeil / activité / tendance sur 7 jours | Sport |
| 5 | **Recettes** : base, recette du jour, ingrédients → checklist Cairn des courses | Cuisine |
| 6 | **Humeur et habitudes** : saisie rapide quotidienne ; finances et homelab reportés | Bien-être |
| 7 | **Dépenses cash** : Google Sheet choisi avec le Picker, migration du fichier, CRUD depuis le dashboard | Finances |
| 8 | **Mind maps** : cartes libres (boîtes, textes, liens) sur React Flow, enregistrées dans `synapse.mindmaps` | Idées et schémas |

## 7. Plafonds gratuits à surveiller

| Service | Plafond | Usage prévu |
|---|---|---|
| Supabase free | 500 Mo de base, 500 k invocations d'Edge Functions/mois, pause après 7 jours d'inactivité | Quelques Mo ; ~1500 invocations/mois ; pas de pause grâce à `pg_cron` et Cairn |
| Vercel Hobby | Usage non commercial, 100 Go de bande passante | Un utilisateur |
| GitHub Actions | 2000 min/mois (privé) | ~250 min |
| Google APIs | Quotas Calendar/Gmail très larges ; Sheets : 300 lectures/min par projet | Négligeable |
| Open-Meteo | 10 000 appels/jour (non commercial) | ~50 |

## 8. Choix arrêtés

- Mails : les 20 derniers de la boîte de réception, sans notion d'« important ».
- Courses : une checklist Cairn (non chiffrée), pas de table Synapse.
- Garmin : pas de double authentification pour l'instant ; connexion par
  mot de passe en secret CI, jetons mis en cache.
- Humeur et habitudes : saisies dans Synapse uniquement ; homelab reporté.
- Dépenses cash : le Google Sheet est la source de vérité, Synapse n'en garde
  rien en base.
