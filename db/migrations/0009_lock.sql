-- Verrouillage du dashboard : code de déverrouillage (second facteur local) et passkeys
-- WebAuthn (empreinte sur mobile). Une ligne dans synapse.lock = verrouillage activé.
-- Le code est haché côté serveur (scrypt + secret serveur) : la base ne contient pas
-- de quoi le retrouver sans SYNAPSE_LOCK_SECRET.

create table synapse.lock (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  code_hash text not null,
  code_salt text not null,
  -- Délai d'inactivité en minutes ; 0 = jusqu'à la fermeture du navigateur.
  idle_minutes integer not null default 5 check (idle_minutes in (0, 1, 5, 15)),
  -- Incrémenté à chaque changement de code : invalide les déverrouillages en cours.
  epoch integer not null default 1,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lock_touch_updated_at
before update on synapse.lock
for each row execute function synapse.touch_updated_at();

alter table synapse.lock enable row level security;

create policy "lock: lecture par le propriétaire" on synapse.lock
  for select to authenticated using (user_id = (select auth.uid()));
create policy "lock: création par le propriétaire" on synapse.lock
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "lock: modification par le propriétaire" on synapse.lock
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "lock: suppression par le propriétaire" on synapse.lock
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.lock to authenticated;
grant all on synapse.lock to service_role;

-- Appareils (passkeys) ---------------------------------------------------------------

create table synapse.lock_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  credential_id text not null unique,
  -- Clé publique COSE, base64url.
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  label text not null check (char_length(label) between 1 and 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index lock_passkeys_user_idx on synapse.lock_passkeys (user_id);

alter table synapse.lock_passkeys enable row level security;

create policy "lock_passkeys: lecture par le propriétaire" on synapse.lock_passkeys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "lock_passkeys: création par le propriétaire" on synapse.lock_passkeys
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "lock_passkeys: modification par le propriétaire" on synapse.lock_passkeys
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "lock_passkeys: suppression par le propriétaire" on synapse.lock_passkeys
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.lock_passkeys to authenticated;
grant all on synapse.lock_passkeys to service_role;

-- Échecs de saisie ---------------------------------------------------------------------
-- Incrément atomique (pas de lecture-puis-écriture) ; la temporisation double à chaque
-- échec à partir du 3e : 30 s, 1 min, 2 min… plafonnée à 1 h.

create function synapse.register_lock_failure()
returns table (failed_attempts integer, locked_until timestamptz)
language sql
set search_path = ''
as $$
  update synapse.lock l
  set failed_attempts = l.failed_attempts + 1,
      locked_until = case
        when l.failed_attempts + 1 >= 3
          then now() + least(interval '1 hour', interval '30 seconds' * power(2, l.failed_attempts + 1 - 3))
        else l.locked_until
      end
  where l.user_id = (select auth.uid())
  returning l.failed_attempts, l.locked_until;
$$;

grant execute on function synapse.register_lock_failure() to authenticated;
