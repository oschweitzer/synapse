---
forge: github
jira_project: TODO
base_branch: main
branch_pattern: "claude/{key}-{slug}"
protected_branches: [main, master, develop, staging, prod, production, "release/*"]
risk_paths: [db/migrations/, supabase/, middleware.ts, lib/auth.ts, lib/admin.ts, lib/lock/, lib/supabase/, lib/google/, app/auth/, app/unlock/, app/login/]
review_bot: ""
commands:
  install: npm ci
  lint: npm run lint
  typecheck: npm run typecheck
  test: ""
  build: npm run build
run_app: npm run dev
app_url: http://localhost:3000
seed_accounts: "none: Google-only sign-in, allowed accounts listed in ALLOWED_EMAILS (see .env.example and README.md)"
api_client: curl
api_collection: ""
test_env_url: https://synapse.example.com/
client_language: en
team_language: en
---

## Module map

- app/(dashboard): home page, the widget registry and the dashboards
- app/actions: server actions
- app/api: route handlers (Google OAuth callback, syncs)
- app/auth, app/login, app/unlock: Google sign-in, sign-out, dashboard unlock screen
- app/cash, app/recipes, app/mindmaps, app/settings: feature pages (cash expenses, recipes, mind maps, settings and admin zone)
- components/ui: design system components (Panel, Button, Badge, Input, Stat, Gauge, Sparkline, Icon)
- components/widgets, components/dashboard, components/cash, components/lock, components/mindmap, components/recipes: feature components
- lib: server-side logic per feature (auth, admin, dashboards, weather, recipes, mood, cash, google, lock, connectors, supabase clients)
- lib/types/synapse.ts: TypeScript types of the `synapse` schema
- db/migrations: SQL migrations `NNNN_name.sql`, applied by `npm run db:migrate`
- supabase/functions: Edge Functions
- jobs/garmin: Garmin sync job (Python, run by GitHub Actions)
- scripts: migrate.mjs, gen-types.mjs, icon generation
- docs: PLAN.md (roadmap, French, the reference) and PLAN.en.md

## Conventions

- Pull requests (title, description) and GitHub issues are written in English. The app itself stays in French: UI text, code comments, README and docs/PLAN.md. Match the surrounding code.
- README.md and docs/PLAN.md are the French reference and have English versions, README.en.md and docs/PLAN.en.md: update both in the same change.
- There is no test suite: the checks are lint, type check and build. Run `npm run typecheck`, `npm run lint` and `npm run build` before pushing.
- The database is the Supabase project shared with Cairn. Migrations live in `db/migrations/NNNN_name.sql`, applied by `npm run db:migrate`, limited to the `synapse` schema. Never run `supabase db push`. Never change the schema of Cairn tables (`public.*`); writing Cairn data is fine where Cairn's RLS allows it.
- An applied migration is never edited: write a new one, and update `lib/types/synapse.ts` to match.
- A new widget goes in the `WIDGETS` catalogue of `lib/dashboard.ts` and in the registry of `app/(dashboard)/page.tsx`.
- Commit messages are short imperative sentences in English; the PR number is appended on merge, for example `Add mind map workspace (#37)`.
- `.env.local` holds secrets and is not committed; document any new variable in `.env.example` and in the README.
