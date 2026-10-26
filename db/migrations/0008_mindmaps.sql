-- Mind maps : un canevas libre par carte (nœuds, liens, vue).
-- Le contenu est stocké tel quel en JSONB (format React Flow) : la carte est
-- toujours lue et écrite en entier, jamais interrogée nœud par nœud.

create table synapse.mindmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  nodes jsonb not null default '[]'::jsonb check (jsonb_typeof(nodes) = 'array' and jsonb_array_length(nodes) <= 1000),
  edges jsonb not null default '[]'::jsonb check (jsonb_typeof(edges) = 'array' and jsonb_array_length(edges) <= 2000),
  viewport jsonb check (viewport is null or jsonb_typeof(viewport) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mindmaps_user_updated_idx on synapse.mindmaps (user_id, updated_at desc);

create trigger mindmaps_touch_updated_at
before update on synapse.mindmaps
for each row execute function synapse.touch_updated_at();

alter table synapse.mindmaps enable row level security;

create policy "mindmaps: lecture par le propriétaire" on synapse.mindmaps
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mindmaps: création par le propriétaire" on synapse.mindmaps
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mindmaps: modification par le propriétaire" on synapse.mindmaps
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mindmaps: suppression par le propriétaire" on synapse.mindmaps
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.mindmaps to authenticated;
grant all on synapse.mindmaps to service_role;
