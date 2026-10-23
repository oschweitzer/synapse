-- Humeur et habitudes : saisie rapide quotidienne depuis le dashboard.
-- Un « jour » est la date locale Europe/Paris, calculée côté serveur Next.

-- Humeur : une note de 1 à 5 par jour, avec un mot facultatif ----------------------

create table synapse.mood_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  score smallint not null check (score between 1 and 5),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger mood_entries_touch_updated_at
before update on synapse.mood_entries
for each row execute function synapse.touch_updated_at();

alter table synapse.mood_entries enable row level security;

create policy "mood_entries: lecture par le propriétaire" on synapse.mood_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mood_entries: création par le propriétaire" on synapse.mood_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mood_entries: modification par le propriétaire" on synapse.mood_entries
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mood_entries: suppression par le propriétaire" on synapse.mood_entries
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.mood_entries to authenticated;
grant all on synapse.mood_entries to service_role;

-- Habitudes : définies dans les réglages, archivées plutôt que supprimées ------------
-- Archiver garde l'historique des jours cochés ; supprimer l'efface.

create table synapse.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  -- Cible de la clé étrangère de habit_checks : un jour coché appartient
  -- forcément au propriétaire de l'habitude.
  unique (id, user_id)
);

create index habits_user_position_idx on synapse.habits (user_id, position) where archived_at is null;

alter table synapse.habits enable row level security;

create policy "habits: lecture par le propriétaire" on synapse.habits
  for select to authenticated using (user_id = (select auth.uid()));
create policy "habits: création par le propriétaire" on synapse.habits
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "habits: modification par le propriétaire" on synapse.habits
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "habits: suppression par le propriétaire" on synapse.habits
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.habits to authenticated;
grant all on synapse.habits to service_role;

-- Jours cochés : une ligne = habitude faite ce jour-là ---------------------------------

create table synapse.habit_checks (
  user_id uuid not null default auth.uid(),
  habit_id uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, day),
  foreign key (habit_id, user_id) references synapse.habits (id, user_id) on delete cascade
);

create index habit_checks_user_day_idx on synapse.habit_checks (user_id, day desc);

alter table synapse.habit_checks enable row level security;

create policy "habit_checks: lecture par le propriétaire" on synapse.habit_checks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "habit_checks: création par le propriétaire" on synapse.habit_checks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "habit_checks: suppression par le propriétaire" on synapse.habit_checks
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on synapse.habit_checks to authenticated;
grant all on synapse.habit_checks to service_role;
