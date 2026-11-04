-- « Marquer comme lu » depuis le widget Mails.
--
-- mail_headers n'accorde que `select` à `authenticated` (cache écrit par l'Edge
-- Function synapse-google-sync). Cette fonction ne change que la ligne de
-- l'appelant (auth.uid() lu dans la fonction) et seulement `is_unread`.
-- Appelée par le serveur Next juste après que Gmail a accepté le changement :
-- le widget n'attend pas la prochaine synchro, qui réécrit de toute façon le
-- cache depuis Gmail.

create function synapse.mark_mail_read(p_message_id text) returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update synapse.mail_headers
    set is_unread = false
    where user_id = auth.uid() and message_id = p_message_id
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke execute on function synapse.mark_mail_read(text) from public, anon;
grant execute on function synapse.mark_mail_read(text) to authenticated;
