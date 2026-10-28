-- Doublure de Cairn pour les tests e2e, sur la Supabase LOCALE uniquement.
-- Elle ne reprend que les colonnes de Cairn lues ou écrites par
-- lib/connectors/cairn.ts, app/actions/cairn.ts et app/actions/recipes.ts.
-- Ce fichier n'est JAMAIS une migration (pas dans db/migrations, pas appliqué par
-- `npm run db:migrate`) : le projet partagé garde les vraies tables de Cairn.
-- Idempotent : rejouable à chaque lancement.

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'note_kind'
  ) then
    create type public.note_kind as enum ('note', 'checklist');
  end if;
end
$$;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  code_name text,
  kind public.note_kind not null default 'note',
  is_private boolean not null default false,
  hide_content boolean not null default false,
  is_encrypted boolean not null default false,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  deleted_at timestamptz,
  position integer not null default 0
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text,
  is_done boolean not null default false,
  is_encrypted boolean not null default false,
  due_at timestamptz,
  position integer not null default 0
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checklist_item_id uuid references public.checklist_items(id) on delete cascade,
  remind_at timestamptz not null
);

alter table public.notes enable row level security;
alter table public.checklist_items enable row level security;
alter table public.reminders enable row level security;

drop policy if exists "e2e own rows" on public.notes;
create policy "e2e own rows" on public.notes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "e2e own rows" on public.checklist_items;
create policy "e2e own rows" on public.checklist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "e2e own rows" on public.reminders;
create policy "e2e own rows" on public.reminders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.checklist_items to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;
