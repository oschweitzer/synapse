-- Couleurs Google dans le cache de l'agenda, et fenêtre élargie.
--
-- Le cache garde désormais la couleur Google de chaque évènement (colorId de
-- l'évènement, sinon couleur de l'agenda) et trois mois d'agenda : du mois
-- précédent au mois suivant, avec les marges d'une grille mensuelle commençant
-- le lundi. Les colonnes sont nullables : l'Edge Function déjà déployée, qui
-- n'envoie aucune couleur, continue de fonctionner (clés absentes = null).

alter table synapse.calendar_events
  add column background_color text,
  add column foreground_color text;

comment on column synapse.calendar_events.background_color is 'Couleur de fond Google, hexadécimale (ex. #039be5).';
comment on column synapse.calendar_events.foreground_color is 'Couleur de texte Google, hexadécimale.';
comment on table synapse.calendar_events is 'Cache de l''agenda Google : du mois précédent au mois suivant (marges de la grille mensuelle), remplacé à chaque synchro.';

create or replace function synapse.replace_google_cache(p_user_id uuid, p_events jsonb, p_mails jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from synapse.calendar_events where user_id = p_user_id;
  insert into synapse.calendar_events
    (user_id, calendar_id, event_id, title, location, all_day, start_at, end_at, html_link,
     background_color, foreground_color)
  select p_user_id, e.calendar_id, e.event_id, e.title, e.location, e.all_day, e.start_at, e.end_at, e.html_link,
         e.background_color, e.foreground_color
  from jsonb_to_recordset(coalesce(p_events, '[]')) as e (
    calendar_id text, event_id text, title text, location text, all_day boolean,
    start_at timestamptz, end_at timestamptz, html_link text,
    background_color text, foreground_color text
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
