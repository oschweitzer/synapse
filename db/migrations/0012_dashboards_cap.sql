-- Nombre maximal de dashboards par utilisateur (DASHBOARDS_MAX dans lib/dashboard.ts), tenu par la base :
-- l'action serveur lit puis insère, deux créations simultanées pouvaient donc dépasser la limite, et prendre la
-- même position (position = nombre de dashboards lu avant l'insertion, aussi décalé après une suppression).
-- Un verrou consultatif par utilisateur, pris pour la durée de la transaction, sérialise les créations d'un même
-- utilisateur ; le comptage et la position qui suivent voient alors les lignes déjà validées par l'autre création.
-- La position est attribuée ici : toujours après le dernier dashboard, quelle que soit la valeur envoyée.

create function synapse.dashboards_cap() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('dashboards:' || new.user_id::text, 0));
  if (select count(*) from synapse.dashboards where user_id = new.user_id) >= 10 then
    raise exception 'dashboards_max' using errcode = 'check_violation';
  end if;
  new.position := coalesce((select max(position) + 1 from synapse.dashboards where user_id = new.user_id), 0);
  return new;
end;
$$;

revoke all on function synapse.dashboards_cap() from public, anon, authenticated;

create trigger dashboards_cap
before insert on synapse.dashboards
for each row execute function synapse.dashboards_cap();
