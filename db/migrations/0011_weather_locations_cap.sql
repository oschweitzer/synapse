-- Nombre maximal de villes de la météo (WEATHER_LOCATIONS_MAX dans lib/connectors/weather.ts), tenu par la base :
-- l'action serveur lit puis insère, deux ajouts simultanés pouvaient donc dépasser la limite.
-- Un verrou consultatif par utilisateur, pris pour la durée de la transaction, sérialise les ajouts d'un même
-- utilisateur ; le comptage qui suit voit alors les lignes déjà validées par l'autre ajout.

create function synapse.weather_locations_cap() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('weather_locations:' || new.user_id::text, 0));
  if (select count(*) from synapse.weather_locations where user_id = new.user_id) >= 5 then
    raise exception 'weather_locations_max' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function synapse.weather_locations_cap() from public, anon, authenticated;

create trigger weather_locations_cap
before insert on synapse.weather_locations
for each row execute function synapse.weather_locations_cap();
