-- Garmin : résumé quotidien et activités, écrits par le job GitHub Actions
-- jobs/garmin/sync.py (clé service_role, upsert), lus par le dashboard.

-- Une ligne par jour --------------------------------------------------------------
-- `day` est la date du calendrier Garmin (fuseau de la montre). Le sommeil d'une
-- ligne est celui de la nuit qui se termine ce jour-là.

create table synapse.garmin_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  -- Sommeil
  sleep_start_at timestamptz,
  sleep_end_at timestamptz,
  sleep_seconds integer,
  deep_sleep_seconds integer,
  light_sleep_seconds integer,
  rem_sleep_seconds integer,
  awake_seconds integer,
  sleep_score smallint,
  -- Body Battery : gain de la nuit, valeur au réveil, extrêmes de la journée
  body_battery_charged smallint,
  body_battery_at_wake smallint,
  body_battery_high smallint,
  body_battery_low smallint,
  -- Activité et forme
  steps integer,
  steps_goal integer,
  resting_hr smallint,
  vo2max real,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger garmin_daily_touch_updated_at
before update on synapse.garmin_daily
for each row execute function synapse.touch_updated_at();

alter table synapse.garmin_daily enable row level security;

create policy "garmin_daily: lecture par le propriétaire" on synapse.garmin_daily
  for select to authenticated using (user_id = (select auth.uid()));

grant select on synapse.garmin_daily to authenticated;
grant all on synapse.garmin_daily to service_role;

-- Une ligne par activité ----------------------------------------------------------

create table synapse.garmin_activities (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_id bigint not null,
  name text,
  -- Clé Garmin : running, cycling, trail_running, strength_training…
  activity_type text,
  start_at timestamptz not null,
  duration_seconds real,
  distance_meters real,
  avg_hr smallint,
  max_hr smallint,
  elevation_gain_meters real,
  calories integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);

create index garmin_activities_user_start_idx on synapse.garmin_activities (user_id, start_at desc);

create trigger garmin_activities_touch_updated_at
before update on synapse.garmin_activities
for each row execute function synapse.touch_updated_at();

alter table synapse.garmin_activities enable row level security;

create policy "garmin_activities: lecture par le propriétaire" on synapse.garmin_activities
  for select to authenticated using (user_id = (select auth.uid()));

grant select on synapse.garmin_activities to authenticated;
grant all on synapse.garmin_activities to service_role;
