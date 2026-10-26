-- Dépenses cash : Google Sheet « Dépenses Liquide », source de vérité.
--
-- Rien n'est stocké ici hormis l'id du fichier : les dépenses vivent dans le
-- Sheet (onglet `Saisies`), lu et écrit par les route handlers /api/cash avec le
-- refresh token Google de la phase 3 (scope `drive.file` en plus).

-- Fichier choisi une fois avec le Google Picker ---------------------------------

alter table synapse.settings
  add column cash_sheet_id text check (cash_sheet_id ~ '^[A-Za-z0-9_-]{20,100}$');

-- Jeton pour le serveur Next ------------------------------------------------------
-- google_credentials reste sans politique : cette fonction ne rend que la ligne de
-- l'appelant (auth.uid() lu dans la fonction), et seulement chiffrée. La clé
-- SYNAPSE_GOOGLE_TOKEN_KEY ne vit que sur Vercel et dans les Edge Functions : un
-- client qui l'appellerait avec sa session n'obtiendrait qu'un chiffré illisible.

create function synapse.google_refresh_token() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select refresh_token_encrypted from synapse.google_credentials where user_id = auth.uid();
$$;

-- Google a refusé le jeton pendant un appel du serveur Next : même état que celui
-- posé par synapse-google-sync, le dashboard affiche « Reconnecter Google ».
create function synapse.flag_google_reauth() returns void
language sql
security definer
set search_path = ''
as $$
  update synapse.google_accounts set needs_reauth = true where user_id = auth.uid();
$$;

revoke execute on function synapse.google_refresh_token() from public, anon;
revoke execute on function synapse.flag_google_reauth() from public, anon;
grant execute on function synapse.google_refresh_token() to authenticated;
grant execute on function synapse.flag_google_reauth() to authenticated;
