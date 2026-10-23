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
| `NEXT_PUBLIC_SITE_URL` | URL publique de Synapse |
| `NEXT_PUBLIC_CAIRN_URL` | URL web de Cairn (liens « Ouvrir dans Cairn ») |

### Connexion

On se connecte avec le compte Cairn (email/mot de passe ou Google). Dans Supabase, **Authentication > URL Configuration**, ajouter `<NEXT_PUBLIC_SITE_URL>/auth/callback` (et `http://localhost:3000/auth/callback` en local) aux *Redirect URLs*.

### Déploiement (Vercel Hobby)

Importer le dépôt dans Vercel (preset Next.js), renseigner les variables ci-dessus, puis déployer. Installer ensuite l'appli depuis le navigateur du téléphone (« Ajouter à l'écran d'accueil »).

Les icônes PWA sont régénérables avec `node scripts/generate-icons.mjs`.
