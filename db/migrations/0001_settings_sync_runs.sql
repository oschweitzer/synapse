-- Schéma synapse : réglages par utilisateur et journal des synchronisations.
-- Le schéma doit aussi figurer dans Supabase > Settings > API > Exposed schemas.

create schema if not exists synapse;

grant usage on schema synapse to anon, authenticated, service_role;

-- Réglages ------------------------------------------------------------------

create table synapse.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  weather_label text,
  weather_latitude double precision check (weather_latitude between -90 and 90),
  weather_longitude double precision check (weather_longitude between -180 and 180),
  widget_order text[] not null default '{}',
  -- Checklist Cairn utilisée comme liste de courses (lue, jamais modifiée par une migration).
  cairn_shopping_checklist_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function synapse.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger settings_touch_updated_at
before update on synapse.settings
for each row execute function synapse.touch_updated_at();

alter table synapse.settings enable row level security;

create policy "settings: lecture par le propriétaire" on synapse.settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: création par le propriétaire" on synapse.settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "settings: modification par le propriétaire" on synapse.settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "settings: suppression par le propriétaire" on synapse.settings
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.settings to authenticated;
grant all on synapse.settings to service_role;

-- Journal des synchros --------------------------------------------------------
-- Écrit par les jobs (service_role, qui contourne la RLS), lu par le dashboard.

create table synapse.sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('weather', 'google', 'garmin', 'cairn', 'meals')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  error text,
  check ((status = 'running') = (finished_at is null))
);

create index sync_runs_user_source_started_idx
  on synapse.sync_runs (user_id, source, started_at desc);

alter table synapse.sync_runs enable row level security;

create policy "sync_runs: lecture par le propriétaire" on synapse.sync_runs
  for select to authenticated using (user_id = (select auth.uid()));

grant select on synapse.sync_runs to authenticated;
grant all on synapse.sync_runs to service_role;
