# Plan technique — Synapse

Dashboard perso qui réunit sport (Garmin), agenda, mails, to-do Cairn, courses,
recette du jour et météo. Contraintes : **100 % gratuit**, utilisable dans le
navigateur, puis sur mobile.

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

## 2. Architecture

```
┌──────────────── Next.js (Vercel Hobby) ────────────────┐
│  Dashboard React (PWA)                                 │
│  Server Components : lecture Supabase avec la session  │
│  Route handlers /api/* : OAuth Google, actions         │
│  lib/connectors/{weather,google,garmin,cairn,meals}.ts │
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

Seule la météo est appelée en direct depuis le serveur Next (avec mise en cache
`revalidate`), parce qu'elle ne demande ni clé ni stockage.

## 3. Sources

### Météo — Open-Meteo
- Gratuit, sans clé. Prévisions du jour et des heures à venir, pour une position
  fixe en configuration.
- Cache Next de 30 min.

### Agenda & Gmail — Google APIs
- Un client OAuth « Web » dans le **projet Google Cloud de Cairn**, avec un
  second consentement propre à Synapse : `calendar.readonly` +
  `gmail.readonly`.
- Le refresh token reste côté serveur, chiffré, dans une table sans politique
  RLS. C'est le modèle `google_credentials` de Cairn, à reprendre tel quel
  (`supabase/functions/_shared/chiffrement.ts`), mais dans une table
  `synapse.google_credentials` distincte : Cairn n'a que le scope
  `calendar.events`, et révoquer l'un ne doit pas couper l'autre.
- ⚠️ En mode « Test » de l'écran de consentement, les refresh tokens expirent
  après 7 jours. Passer l'application en **Production sans vérification**
  (écran d'avertissement à la connexion, limite de 100 comptes) supprime
  l'expiration. `gmail.readonly` est un scope *restreint* : la vérification
  coûte cher, d'où ce choix de ne pas la demander.
- Sync : Edge Function `synapse-google-sync` déclenchée par `pg_cron` toutes
  les 30 min. Elle stocke les évènements de J-1 à J+7 et les en-têtes des mails
  non lus ou étiquetés (expéditeur, sujet, extrait). Jamais le corps complet.

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
- Cocher un item depuis Synapse (phase 5) : un `update` de `is_done`, autorisé
  par la même politique RLS. Bouton « Ouvrir dans Cairn » vers
  `EXPO_PUBLIC_WEB_URL/note/<id>`.
- Synapse **n'écrit jamais** de migration sur les tables Cairn. Si le schéma
  Cairn bouge, les types sont regénérés côté Synapse
  (`supabase gen types typescript`).

### Sport — Garmin
- Il n'existe pas d'API officielle pour un particulier : le Garmin Connect
  Developer Program est réservé aux entreprises, sur dossier.
- Choix : la lib non officielle **`python-garminconnect`** dans un workflow
  GitHub Actions (cron toutes les 3 h). Elle récupère activités, sommeil, Body
  Battery, pas, FC au repos et VO2max, puis fait un upsert dans
  `synapse.garmin_*` avec la clé `service_role` (secret GitHub).
- Les jetons de session `garth` sont mis en cache entre deux exécutions
  (secret ou artefact chiffré), pour ne pas se reconnecter, et déclencher la
  double authentification, à chaque passage.
- ⚠️ Fragile par nature : Garmin change son authentification de temps en
  temps. **Plan B** : synchro automatique Garmin → Strava, puis l'API Strava
  (officielle, gratuite, OAuth). On y perd sommeil et Body Battery, mais les
  activités restent.
- Coût : dépôt privé = 2000 min/mois gratuites. 8 passages par jour d'environ
  1 min, soit ~250 min/mois.

### Courses & recettes — maison
- Tables `synapse.shopping_items`, `synapse.recipes` et
  `synapse.meal_plan(date, recipe_id)`.
- Recette du jour : tirage dans ses propres recettes (en évitant les 14
  derniers jours), avec un import ponctuel depuis **TheMealDB** (gratuit) pour
  amorcer la base.
- Bouton « ajouter les ingrédients aux courses ». Plus tard, peut-être une
  liste de courses en checklist Cairn plutôt qu'une table à part.

## 4. Schéma `synapse`

Schéma Postgres dédié, ajouté aux « Exposed schemas » de l'API Supabase. RLS
`user_id = auth.uid()` sur chaque table, comme dans Cairn.

| Table | Contenu |
|---|---|
| `settings` | position météo, ordre des widgets, libellés Gmail suivis |
| `google_accounts` / `google_credentials` | état de connexion / refresh token chiffré (sans politique) |
| `calendar_events` | cache des évènements (id Google, début, fin, titre, lieu) |
| `mail_headers` | cache des en-têtes de mails (id, expéditeur, sujet, extrait, date) |
| `garmin_daily` | une ligne par jour : sommeil, Body Battery, pas, FC repos |
| `garmin_activities` | une ligne par activité : type, durée, distance, FC, dénivelé |
| `recipes`, `meal_plan`, `shopping_items` | cuisine & courses |
| `sync_runs` | journal des jobs (source, début, fin, statut, erreur) → widget « état des syncs » |

**Migrations — point d'attention.** Le projet Supabase a déjà un historique de
migrations, celui du repo Cairn. Lancer `supabase db push` depuis Synapse
verrait ces migrations comme « distantes inconnues » et refuserait d'avancer.
Proposition : les migrations du schéma `synapse` vivent dans
`synapse/db/migrations/` et sont appliquées par un petit script (`psql` sur
`DATABASE_URL`, avec sa propre table de suivi `synapse.schema_migrations`). Le
CLI Supabase reste réservé à Cairn. À valider en phase 1.

## 5. Arborescence cible

```
synapse/
  app/
    (dashboard)/page.tsx        grille de widgets
    api/google/connect|callback route handlers OAuth
    manifest.ts                 manifeste PWA
  components/widgets/           Weather, Agenda, Mail, Todo, Sport, Meal, Shopping
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
  id: 'weather' | 'google' | 'garmin' | 'cairn' | 'meals'
  read(userId: string): Promise<{ data: T; syncedAt: Date | null; error?: string }>
}
```

## 6. Étapes

| Phase | Contenu | Livrable |
|---|---|---|
| 1 | Next.js, connexion Supabase (même compte que Cairn), schéma `synapse` + script de migration, grille de widgets, PWA, **widget météo** | Dashboard en ligne avec la météo |
| 2 | **Widget Cairn** en lecture (to-do du jour, épinglés, compteur privé) | Les tâches visibles sans rien écrire côté Cairn |
| 3 | OAuth Google + Edge Function de sync + `pg_cron` → **agenda** et **mails** | Journée et mails importants |
| 4 | Workflow **Garmin** + widgets sommeil / activité / tendance sur 7 jours | Sport |
| 5 | **Courses & recettes**, cocher une to-do Cairn depuis Synapse | Cuisine |
| 6 | Blocs du README restants : finances, homelab, humeur | — |

## 7. Plafonds gratuits à surveiller

| Service | Plafond | Usage prévu |
|---|---|---|
| Supabase free | 500 Mo de base, 500 k invocations d'Edge Functions/mois, pause après 7 jours d'inactivité | Quelques Mo ; ~1500 invocations/mois ; pas de pause grâce à `pg_cron` et Cairn |
| Vercel Hobby | Usage non commercial, 100 Go de bande passante | Un utilisateur |
| GitHub Actions | 2000 min/mois (privé) | ~250 min |
| Google APIs | Quotas Calendar/Gmail très larges | Négligeable |
| Open-Meteo | 10 000 appels/jour (non commercial) | ~50 |

## 8. Questions ouvertes

- Mails : quels critères pour « important » (non lus, libellé précis,
  expéditeurs) ?
- Garmin : compte avec double authentification ? Cela change la façon de
  stocker les jetons en CI.
- Courses : table dédiée ou checklist Cairn ? La checklist donne le widget
  Android de Cairn gratuitement.
