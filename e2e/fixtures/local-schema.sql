-- Seed du Supabase local (npx supabase start) : crée le schéma synapse avant
-- le démarrage de PostgREST, qui l'expose via [api] schemas et refuse de
-- démarrer s'il n'existe pas. La migration 0001 le crée aussi (if not exists)
-- et reste la référence : ce fichier ne sert qu'au démarrage de la pile locale.
create schema if not exists synapse;
grant usage on schema synapse to anon, authenticated, service_role;
