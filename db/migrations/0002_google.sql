-- Google : connexion OAuth (agenda + Gmail en lecture seule) et cache des données.
--
-- Même modèle que Cairn (public.google_accounts / public.google_credentials),
-- mais dans des tables distinctes : Cairn n'a que le scope `calendar.events`,
-- et révoquer l'un ne doit pas couper l'autre.
--
-- Écritures : la connexion passe par save_google_connection() (appelée par
-- /api/google/callback avec la session), le cache par replace_google_cache()
-- (appelée par l'Edge Function synapse-google-sync avec la clé service_role).

-- Compte Google : état visible par le client --------------------------------

create table synapse.google_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  scopes text[] not null default '{}',
  -- Google a refusé le refresh token (révoqué, mot de passe changé…) ou il est
  -- illisible (clé changée) : le dashboard affiche « reconnecter Google ».
  needs_reauth boolean not null default false,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger google_accounts_touch_updated_at
before update on synapse.google_accounts
for each row execute function synapse.touch_updated_at();

alter table synapse.google_accounts enable row level security;

create policy "google_accounts: lecture par le propriétaire" on synapse.google_accounts
  for select to authenticated using (user_id = (select auth.uid()));

grant select on synapse.google_accounts to authenticated;
grant all on synapse.google_accounts to service_role;

-- Refresh token chiffré --------------------------------------------------------
-- RLS activée SANS AUCUNE POLITIQUE : aucun client (anon, authenticated) ne peut
-- lire, écrire ni même détecter une ligne. Seule la clé service_role passe.

create table synapse.google_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- AES-GCM, clé SYNAPSE_GOOGLE_TOKEN_KEY ; nonce en tête, le tout en hexadécimal.
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

comment on table synapse.google_credentials is
  'Jamais accessible au client. RLS actif sans politique, seule la clé de service passe.';

alter table synapse.google_credentials enable row level security;

revoke all on synapse.google_credentials from anon, authenticated;
grant all on synapse.google_credentials to service_role;

-- Cache de l'agenda (J-1 à J+7) -------------------------------------------------

create table synapse.calendar_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  calendar_id text not null,
  event_id text not null,
  title text,
  location text,
  -- Évènement « toute la journée » : début et fin à minuit UTC des dates Google
  -- (fin exclusive), à lire en UTC.
  all_day boolean not null default false,
  start_at timestamptz not null,
  end_at timestamptz not null,
  html_link text,
  primary key (user_id, calendar_id, event_id)
);

create index calendar_events_user_start_idx on synapse.calendar_events (user_id, start_at);

alter table synapse.calendar_events enable row level security;

create policy "calendar_events: lecture par le propriétaire" on synapse.calendar_events
  for select to authenticated using (user_id = (select auth.uid()));

grant select on synapse.calendar_events to authenticated;
grant all on synapse.calendar_events to service_role;

-- En-têtes des 20 derniers mails de la boîte de réception ------------------------
-- Jamais le corps : expéditeur, sujet, extrait fourni par Gmail, date, lu/non lu.

create table synapse.mail_headers (
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id text not null,
  thread_id text not null,
  sender text,
  subject text,
  snippet text,
  received_at timestamptz not null,
  is_unread boolean not null default false,
  primary key (user_id, message_id)
);

create index mail_headers_user_received_idx on synapse.mail_headers (user_id, received_at desc);

alter table synapse.mail_headers enable row level security;

create policy "mail_headers: lecture par le propriétaire" on synapse.mail_headers
  for select to authenticated using (user_id = (select auth.uid()));

grant select on synapse.mail_headers to authenticated;
grant all on synapse.mail_headers to service_role;

-- Connexion / déconnexion depuis le dashboard --------------------------------------
-- SECURITY DEFINER pour écrire dans google_credentials, mais limité à la ligne de
-- l'appelant : auth.uid() est lu dans la fonction, ce n'est pas un paramètre.

create function synapse.save_google_connection(
  p_refresh_token_encrypted text,
  p_google_email text,
  p_scopes text[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Aucune session' using errcode = '28000';
  end if;

  -- Le secret d'abord, l'état visible ensuite : un échec entre les deux ne
  -- montre jamais une connexion sans jeton derrière.
  insert into synapse.google_credentials (user_id, refresh_token_encrypted, updated_at)
  values (me, p_refresh_token_encrypted, now())
  on conflict (user_id) do update set
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    updated_at = excluded.updated_at;

  insert into synapse.google_accounts (user_id, google_email, scopes, needs_reauth, connected_at)
  values (me, p_google_email, coalesce(p_scopes, '{}'), false, now())
  on conflict (user_id) do update set
    google_email = excluded.google_email,
    scopes = excluded.scopes,
    needs_reauth = false,
    connected_at = excluded.connected_at;
end;
$$;

create function synapse.disconnect_google() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Aucune session' using errcode = '28000';
  end if;

  delete from synapse.google_credentials where user_id = me;
  delete from synapse.google_accounts where user_id = me;
  delete from synapse.calendar_events where user_id = me;
  delete from synapse.mail_headers where user_id = me;
end;
$$;

-- Postgres accorde `execute` à PUBLIC sur toute nouvelle fonction : on le retire.
revoke execute on function synapse.save_google_connection(text, text, text[]) from public, anon;
revoke execute on function synapse.disconnect_google() from public, anon;
grant execute on function synapse.save_google_connection(text, text, text[]) to authenticated;
grant execute on function synapse.disconnect_google() to authenticated;

-- Remplacement du cache par la synchro --------------------------------------------
-- Une seule transaction : le dashboard ne voit jamais un cache vidé à moitié.

create function synapse.replace_google_cache(p_user_id uuid, p_events jsonb, p_mails jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from synapse.calendar_events where user_id = p_user_id;
  insert into synapse.calendar_events
    (user_id, calendar_id, event_id, title, location, all_day, start_at, end_at, html_link)
  select p_user_id, e.calendar_id, e.event_id, e.title, e.location, e.all_day, e.start_at, e.end_at, e.html_link
  from jsonb_to_recordset(coalesce(p_events, '[]')) as e (
    calendar_id text, event_id text, title text, location text, all_day boolean,
    start_at timestamptz, end_at timestamptz, html_link text
  )
  on conflict do nothing;

  delete from synapse.mail_headers where user_id = p_user_id;
  insert into synapse.mail_headers
    (user_id, message_id, thread_id, sender, subject, snippet, received_at, is_unread)
  select p_user_id, m.message_id, m.thread_id, m.sender, m.subject, m.snippet, m.received_at, m.is_unread
  from jsonb_to_recordset(coalesce(p_mails, '[]')) as m (
    message_id text, thread_id text, sender text, subject text, snippet text,
    received_at timestamptz, is_unread boolean
  )
  -- Le plan : jamais plus de 20 lignes.
  order by m.received_at desc
  limit 20
  on conflict do nothing;
end;
$$;

revoke execute on function synapse.replace_google_cache(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function synapse.replace_google_cache(uuid, jsonb, jsonb) to service_role;

-- Planification : synapse-google-sync toutes les 30 min ---------------------------
-- L'URL des fonctions et le secret partagé avec la fonction sont lus dans Supabase
-- Vault à chaque passage (voir README) : rien de secret dans ce fichier.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'synapse-google-sync',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'synapse_functions_url')
      || '/synapse-google-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-synapse-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'synapse_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
