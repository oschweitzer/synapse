# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). No version has been released yet, so everything below is listed under `Unreleased`.

## [Unreleased]

### Added

- Next.js and Supabase foundation, installable as a PWA (#11).
- `synapse` database schema and a migration script limited to that schema (#12).
- Weather widget backed by Open-Meteo (#13), with cities chosen in the settings and several shown in the widget (#36).
- To-do and shopping list widgets reading Cairn data (#14).
- Google integration: calendar agenda and the 20 latest emails (#15).
- Garmin sync job and widgets (#16).
- Recipes and a recipe of the day (#17).
- Mood and habits tracking (#18).
- Cash expenses widget backed by a Google Sheet (#21).
- Drag-and-drop reordering of dashboard widgets, saved per user (#30).
- Per-widget refresh button (#35).
- Loading spinners on buttons and widgets (#29).
- Mind map workspace (#37).
- Dashboard lock: unlock code, WebAuthn fingerprint and auto-lock (#38).
- Multiple dashboards, with admin widget selection and public/private visibility (#39).
- Unit test suite (Vitest) for the auth, admin, time, lock and Google helpers of `lib/`, and a CI workflow running typecheck, lint and tests (#56).
- Unit tests for the cash, dashboard, weather, recipe and mood modules of `lib/` and for every dashboard connector, with a shared Supabase mock (#57).
- Unit tests for the server actions and the cash, Google and lock route handlers, covering sessions, admin rights, invalid input and Supabase errors (#58).
- End-to-end tests (Playwright) against a local Supabase, with a guard refusing non-local databases, a mock server for Google, Open-Meteo and TheMealDB, a first sign-in flow and an e2e CI job (#60).
- Component tests (Testing Library, jsdom) for the UI kit, the recipe, cash and lock forms and the mood, habit and checklist widgets (#59).

### Changed

- Sign-in is Google-only and restricted to an email allowlist (#22).
- Applied the Synapse design system (HUD theme) to the whole interface (#25).
- Upgraded Next.js to 16 and the minimum Node.js version to 24 (#56).
- The Google OAuth token, Google Sheets, Open-Meteo and TheMealDB base URLs can be overridden by environment variables, for tests only (#60).

### Security

- Cleared the `postcss` advisories reported by `npm audit` by upgrading Next.js (#56).
