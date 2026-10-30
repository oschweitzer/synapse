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
- End-to-end flows for the dashboard (widgets, reorder), dashboards admin and public/private visibility, lock (code, auto-lock, passkey through a virtual authenticator), settings and weather (#61).
- End-to-end flows for recipes (create, edit, add to shopping, delete, TheMealDB import, daily recipe) and for checking shopping and to-do items, with Cairn seed helpers (#69).
- End-to-end flows for mood and habits (pick, check, persisted after reload) and mind maps (create, edit a node, undo/redo, autosave, delete) (#70).
- End-to-end flow for cash expenses (add, edit, delete, forget and re-link the sheet through a faked Google Picker), with a seeded Google connection and a stateful in-memory Sheets mock (#71).
- The plan (`docs/PLAN.md`) states that sign-in, recipes, shopping, to-do, mood, habits, cash, mind maps, dashboards, lock, settings and weather each have an end-to-end browser flow (#72).
- Reorder dashboard widgets from the settings with move up/down buttons, saved with the dashboard form (#44).

### Changed

- Settings page sections load independently, so a slow source no longer delays the others (#78).
- Settings: saving the shopping checklist or adding/removing a habit updates the section in place, without reloading the page or losing what is typed in other sections (#79).
- Settings: adding, moving or removing a weather city updates the Météo section in place, with its message inside the section and no `?weather=` in the URL (#80).
- Settings: creating, saving, resetting the order of, setting the default or deleting a dashboard in the admin section updates the list in place, without reloading the page or jumping to the section (#81).
- Settings: syncing or disconnecting Google updates the Google and cash expenses sections in place, without reloading the page (#82).
- Settings: setting, changing or disabling the lock code, changing the idle delay or removing a fingerprint updates the Verrouillage section in place, without reloading the page or `?lock=` in the URL (#83).
- Weather settings: the city search suggests cities as you type and adds the chosen one without reloading the page (#41).
- Sign-in is Google-only and restricted to an email allowlist (#22).
- Applied the Synapse design system (HUD theme) to the whole interface (#25).
- Upgraded Next.js to 16 and the minimum Node.js version to 24 (#56).
- The Google OAuth token, Google Sheets, Open-Meteo and TheMealDB base URLs can be overridden by environment variables, for tests only (#60).

### Fixed

- Settings: the label of the "Reconnect Google" button is centered like the other buttons, also when it wraps (#43).

### Security

- Weather settings: city suggestions are limited to 60 searches per minute and per user, and the 5-city cap is now enforced by the database (migration `0011_weather_locations_cap.sql`), so simultaneous additions cannot exceed it (#41).
- Dashboards: the 10-dashboard cap is now enforced by the database, which also gives a new dashboard the next free position (migration `0012_dashboards_cap.sql`), so simultaneous creations cannot exceed the cap or share a position (#81).
- Cleared the `postcss` advisories reported by `npm audit` by upgrading Next.js (#56).
