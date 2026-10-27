-- Tableaux de bord multiples : chaque utilisateur a ses dashboards (nom, visibilité publique ou
-- privée), et pour chacun la liste ordonnée des widgets affichés. Un dashboard `private` n'est
-- servi qu'une fois le verrouillage (0009) levé ; `public` ne demande que la session Supabase.
-- Le tableau de bord actuel devient le dashboard par défaut (privé : il était derrière le verrou).
-- `settings.widget_order` n'est plus lu : la colonne pourra être supprimée par une migration ultérieure.

create table synapse.dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  is_default boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dashboards_user_idx on synapse.dashboards (user_id, position);
-- Un seul dashboard par défaut par utilisateur.
create unique index dashboards_one_default_idx on synapse.dashboards (user_id) where is_default;

create trigger dashboards_touch_updated_at
before update on synapse.dashboards
for each row execute function synapse.touch_updated_at();

alter table synapse.dashboards enable row level security;

create policy "dashboards: lecture par le propriétaire" on synapse.dashboards
  for select to authenticated using (user_id = (select auth.uid()));
create policy "dashboards: création par le propriétaire" on synapse.dashboards
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dashboards: modification par le propriétaire" on synapse.dashboards
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dashboards: suppression par le propriétaire" on synapse.dashboards
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.dashboards to authenticated;
grant all on synapse.dashboards to service_role;

-- Widgets d'un dashboard (ordre = position) ----------------------------------------------

create table synapse.dashboard_widgets (
  dashboard_id uuid not null references synapse.dashboards (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  widget_id text not null check (char_length(widget_id) between 1 and 40),
  position integer not null check (position >= 0),
  primary key (dashboard_id, widget_id)
);

alter table synapse.dashboard_widgets enable row level security;

create policy "dashboard_widgets: lecture par le propriétaire" on synapse.dashboard_widgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "dashboard_widgets: création par le propriétaire" on synapse.dashboard_widgets
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from synapse.dashboards d where d.id = dashboard_id and d.user_id = (select auth.uid()))
  );
create policy "dashboard_widgets: modification par le propriétaire" on synapse.dashboard_widgets
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dashboard_widgets: suppression par le propriétaire" on synapse.dashboard_widgets
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.dashboard_widgets to authenticated;
grant all on synapse.dashboard_widgets to service_role;

-- Fonctions (security invoker : la RLS s'applique) -----------------------------------------

-- Remplace d'un bloc les widgets d'un dashboard, dans l'ordre donné (doublons ignorés).
create function synapse.set_dashboard_widgets(p_dashboard uuid, p_widgets text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from synapse.dashboards d where d.id = p_dashboard and d.user_id = (select auth.uid())) then
    raise exception 'dashboard introuvable';
  end if;
  delete from synapse.dashboard_widgets where dashboard_id = p_dashboard;
  insert into synapse.dashboard_widgets (dashboard_id, user_id, widget_id, position)
  select p_dashboard, (select auth.uid()), w.widget_id, (min(w.ord) - 1)::integer
  from unnest(p_widgets) with ordinality as w(widget_id, ord)
  group by w.widget_id
  order by min(w.ord);
end;
$$;

grant execute on function synapse.set_dashboard_widgets(uuid, text[]) to authenticated;

-- Désigne le dashboard par défaut (l'ancien perd le drapeau dans la même transaction).
create function synapse.set_default_dashboard(p_dashboard uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from synapse.dashboards d where d.id = p_dashboard and d.user_id = (select auth.uid())) then
    raise exception 'dashboard introuvable';
  end if;
  update synapse.dashboards set is_default = false where user_id = (select auth.uid()) and is_default;
  update synapse.dashboards set is_default = true where id = p_dashboard;
end;
$$;

grant execute on function synapse.set_default_dashboard(uuid) to authenticated;

-- Crée le dashboard par défaut d'un utilisateur qui n'en a aucun (premier accès) ; sans effet sinon.
create function synapse.ensure_default_dashboard(p_widgets text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from synapse.dashboards d where d.user_id = (select auth.uid())) then
    return;
  end if;
  insert into synapse.dashboards (name, visibility, is_default)
  values ('Principal', 'private', true)
  on conflict (user_id) where is_default do nothing
  returning id into v_id;
  if v_id is not null then
    perform synapse.set_dashboard_widgets(v_id, p_widgets);
  end if;
end;
$$;

grant execute on function synapse.ensure_default_dashboard(text[]) to authenticated;

-- Reprise de l'existant : un dashboard par défaut par utilisateur ayant des réglages, avec ses
-- widgets dans l'ordre enregistré (`widget_order`), puis les autres dans l'ordre par défaut.
-- Même résultat qu'avant : tous les widgets, même ordre, derrière le verrou comme avant.
insert into synapse.dashboards (user_id, name, visibility, is_default, position)
select s.user_id, 'Principal', 'private', true, 0
from synapse.settings s;

insert into synapse.dashboard_widgets (dashboard_id, user_id, widget_id, position)
select d.id, d.user_id, w.widget_id,
  (row_number() over (partition by d.id order by w.rank, w.ord) - 1)::integer
from synapse.dashboards d
join synapse.settings s on s.user_id = d.user_id
cross join lateral (
  select catalog.widget_id, catalog.ord,
    coalesce((select min(o.pos) from unnest(s.widget_order) with ordinality as o(id, pos) where o.id = catalog.widget_id), 1000000) as rank
  from unnest(array[
    'activities', 'mail', 'trend', 'sleep', 'cash', 'todo',
    'shopping', 'agenda', 'weather', 'mood', 'habits', 'daily-recipe'
  ]) with ordinality as catalog(widget_id, ord)
) w
where d.is_default;
