-- Recettes et recette du jour. Les courses restent dans Cairn : le bouton
-- « ajouter aux courses » écrit des checklist_items (données), jamais de schéma.

-- Recettes ------------------------------------------------------------------------

create table synapse.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  -- Une ligne par ingrédient, quantité comprise (« Farine (200 g) ») : c'est ce
  -- texte qui part tel quel dans la liste de courses.
  ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  source_url text check (source_url ~ '^https?://'),
  -- Recette importée depuis TheMealDB : évite de l'importer deux fois.
  mealdb_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mealdb_id)
);

create index recipes_user_title_idx on synapse.recipes (user_id, title);

create trigger recipes_touch_updated_at
before update on synapse.recipes
for each row execute function synapse.touch_updated_at();

alter table synapse.recipes enable row level security;

create policy "recipes: lecture par le propriétaire" on synapse.recipes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "recipes: création par le propriétaire" on synapse.recipes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "recipes: modification par le propriétaire" on synapse.recipes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recipes: suppression par le propriétaire" on synapse.recipes
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.recipes to authenticated;
grant all on synapse.recipes to service_role;

-- Plan des repas : une recette par jour ---------------------------------------------
-- Supprimer une recette efface ses jours ; celui d'aujourd'hui est alors retiré.

create table synapse.meal_plan (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  recipe_id uuid not null references synapse.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index meal_plan_recipe_day_idx on synapse.meal_plan (recipe_id, day desc);

alter table synapse.meal_plan enable row level security;

create policy "meal_plan: lecture par le propriétaire" on synapse.meal_plan
  for select to authenticated using (user_id = (select auth.uid()));
create policy "meal_plan: création par le propriétaire" on synapse.meal_plan
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "meal_plan: modification par le propriétaire" on synapse.meal_plan
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal_plan: suppression par le propriétaire" on synapse.meal_plan
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on synapse.meal_plan to authenticated;
grant all on synapse.meal_plan to service_role;

-- Recette du jour ---------------------------------------------------------------------
-- Renvoie la recette prévue le jour `p_day`, après l'avoir tirée si besoin. Le
-- tirage évite les recettes servies dans les 14 jours précédents ; si toutes
-- l'ont été, il prend la moins récente. Deux appels simultanés tombent sur la
-- même ligne (clé primaire user_id + day). `null` s'il n'y a aucune recette.
-- Security invoker : la RLS limite tout aux lignes de l'appelant.

create function synapse.pick_daily_recipe(p_day date) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipe_id uuid;
begin
  select recipe_id into v_recipe_id
  from synapse.meal_plan
  where user_id = (select auth.uid()) and day = p_day;
  if found then
    return v_recipe_id;
  end if;

  -- Toute recette absente des 14 derniers jours vaut `p_day - 15` : égalité,
  -- départagée au hasard. Les autres passent après, de la moins récente à la plus récente.
  select r.id into v_recipe_id
  from synapse.recipes r
  left join lateral (
    select max(m.day) as last_day
    from synapse.meal_plan m
    where m.recipe_id = r.id and m.day < p_day
  ) last on true
  where r.user_id = (select auth.uid())
  order by greatest(last.last_day, p_day - 15), random()
  limit 1;

  if v_recipe_id is null then
    return null;
  end if;

  insert into synapse.meal_plan (user_id, day, recipe_id)
  values ((select auth.uid()), p_day, v_recipe_id)
  on conflict (user_id, day) do nothing;

  select recipe_id into v_recipe_id
  from synapse.meal_plan
  where user_id = (select auth.uid()) and day = p_day;
  return v_recipe_id;
end;
$$;

revoke all on function synapse.pick_daily_recipe(date) from public, anon;
grant execute on function synapse.pick_daily_recipe(date) to authenticated;
