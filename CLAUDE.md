# Synapse — instructions for Claude

## Language

- **Pull requests** (title and description) and **GitHub issues** (title, body, comments) are written in **English**.
- The app itself stays in French: UI text, code comments, README and `docs/PLAN.md`. Match the surrounding code.
- `README.md` and `docs/PLAN.md` (French, the reference) have English versions, `README.en.md` and `docs/PLAN.en.md`: update both in the same change.

## Commits and changelog

- Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): description`, e.g. `feat(lock): add auto-lock delay`, `fix(cash): ...`, `docs: ...`, `test: ...`, `chore: ...`. Breaking changes use `!` or a `BREAKING CHANGE:` footer.
- `CHANGELOG.md` follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/): an `Unreleased` section on top, entries grouped under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Update it in the same change as any user-visible modification.

## Project

- Plan and roadmap: `docs/PLAN.md`; setup and conventions: `README.md`.
- Checks before pushing: `npm run typecheck`, `npm run lint`, `npm run build`.
- Database: migrations in `db/migrations/NNNN_name.sql`, applied by `npm run db:migrate`, limited to the `synapse` schema. Never run `supabase db push` (the Supabase project is shared with Cairn) and never change the schema of Cairn tables (`public.*`); writing Cairn data is fine where Cairn's RLS allows it.
- An applied migration is never edited: write a new one. Update `lib/types/synapse.ts` to match.
