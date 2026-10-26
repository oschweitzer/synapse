-- Villes de la météo : plusieurs par utilisateur, ordonnées.
-- Remplace weather_label / weather_latitude / weather_longitude de synapse.settings,
-- laissées en place mais plus lues (une migration appliquée ne se modifie pas).

create table synapse.weather_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 80),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index weather_locations_user_position_idx on synapse.weather_locations (user_id, position);

alter table synapse.weather_locations enable row level security;

create policy "weather_locations: lecture par le propriétaire" on synapse.weather_locations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "weather_locations: création par le propriétaire" on synapse.weather_locations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "weather_locations: modification par le propriétaire" on synapse.weather_locations
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "weather_locations: suppression par le propriétaire" on synapse.weather_locations
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.weather_locations to authenticated;
grant all on synapse.weather_locations to service_role;

-- Reprise de la position unique déjà enregistrée.
insert into synapse.weather_locations (user_id, label, latitude, longitude, position)
select user_id, coalesce(nullif(btrim(weather_label), ''), 'Position enregistrée'), weather_latitude, weather_longitude, 0
from synapse.settings
where weather_latitude is not null and weather_longitude is not null;
