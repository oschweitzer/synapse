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
| `NEXT_PUBLIC_SITE_URL` | URL publique de Synapse (utilisée dès la phase 3, OAuth Google) |
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

### Connexion

On se connecte avec le compte Cairn (email/mot de passe ou Google). Dans Supabase, **Authentication > URL Configuration**, ajouter `<NEXT_PUBLIC_SITE_URL>/auth/callback` (et `http://localhost:3000/auth/callback` en local) aux *Redirect URLs*.

### Déploiement (Vercel Hobby)

Importer le dépôt dans Vercel (preset Next.js), renseigner les variables ci-dessus, puis déployer. Installer ensuite l'appli depuis le navigateur du téléphone (« Ajouter à l'écran d'accueil »).

Les icônes PWA sont régénérables avec `node scripts/generate-icons.mjs`.
