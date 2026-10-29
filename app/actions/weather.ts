'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/rate-limit'
import { searchCities, WEATHER_LOCATIONS_MAX, type CityResult } from '@/lib/connectors/weather'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')
  return { supabase, userId: data.user.id }
}

function done(code: string): never {
  revalidatePath('/')
  redirect(`/settings?weather=${code}`)
}

const SESSION_EXPIRED = 'Session expirée, reconnecte-toi.'
const SAVE_FAILED = 'Enregistrement impossible, réessaie.'
const MAX_REACHED = `${WEATHER_LOCATIONS_MAX} villes au plus : retires-en une d’abord.`

// Chaque appel à findCities déclenche une requête vers Open-Meteo : 60 par minute et par utilisateur suffisent à la saisie.
const allowSearch = createRateLimiter({ limit: 60, windowMs: 60_000 })

/**
 * Suggestions de villes pour l'autocomplétion des réglages. Action serveur appelée depuis le client :
 * la requête est validée et la session vérifiée ici (pas de redirection, le composant affiche l'erreur).
 */
export async function findCities(query: string): Promise<{ results?: CityResult[]; error?: string }> {
  if (typeof query !== 'string') return { results: [] }
  const q = query.trim()
  if (q.length < 2 || q.length > 80) return { results: [] }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { error: SESSION_EXPIRED }
  if (!allowSearch(data.user.id)) return { error: 'Trop de recherches, réessaie dans un instant.' }

  try {
    return { results: await searchCities(q) }
  } catch (e) {
    console.error('[weather] recherche de ville', e)
    return { error: 'Recherche impossible : Open-Meteo ne répond pas.' }
  }
}

/**
 * Ajoute une ville (suggestion choisie dans l'autocomplétion) en dernière position.
 * Renvoie `{ error }` au lieu de rediriger : la liste se met à jour sur place, seul /settings est revalidé
 * (le dashboard est dynamique, il relit les villes à chaque visite). Les arguments viennent du client : validés ici.
 */
export async function addCity(city: { label: string; latitude: number; longitude: number }): Promise<{ error?: string }> {
  if (typeof city !== 'object' || city === null) return { error: 'Ville invalide.' }
  const { latitude, longitude } = city
  const label = typeof city.label === 'string' ? city.label.trim() : ''
  if (
    label.length < 1 || label.length > 80 ||
    typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180
  ) {
    return { error: 'Ville invalide.' }
  }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: SESSION_EXPIRED }

  const table = supabase.schema('synapse').from('weather_locations')
  const { data: existing, error: readError } = await table.select('position').order('position', { ascending: false })
  if (readError) {
    console.error('[weather] lecture des villes', readError)
    return { error: SAVE_FAILED }
  }
  if (existing.length >= WEATHER_LOCATIONS_MAX) {
    return { error: MAX_REACHED }
  }

  const { error } = await table.insert({ label, latitude, longitude, position: (existing[0]?.position ?? -1) + 1 })
  if (error) {
    // La base tient aussi la limite (migration 0011) : deux ajouts simultanés peuvent passer la lecture ci-dessus.
    if (error.message === 'weather_locations_max') return { error: MAX_REACHED }
    console.error('[weather] ajout d’une ville', error)
    return { error: SAVE_FAILED }
  }
  revalidatePath('/settings')
  return {}
}

export async function removeCity(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!UUID.test(id)) redirect('/settings?weather=invalid')

  const { supabase } = await requireUser()
  const { error } = await supabase.schema('synapse').from('weather_locations').delete().eq('id', id)
  if (error) {
    console.error('[weather] retrait d’une ville', error)
    done('save')
  }
  done('removed')
}

/** Échange une ville avec sa voisine (direction -1 = monter, 1 = descendre). */
export async function moveCity(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const direction = Number(formData.get('direction'))
  if (!UUID.test(id) || (direction !== -1 && direction !== 1)) redirect('/settings?weather=invalid')

  const { supabase } = await requireUser()
  const table = supabase.schema('synapse').from('weather_locations')
  const { data, error } = await table.select('id').order('position').order('created_at')
  if (error) {
    console.error('[weather] lecture des villes', error)
    done('save')
  }

  const ids = data.map((row) => row.id)
  const from = ids.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) done('moved')
  ;[ids[from], ids[to]] = [ids[to], ids[from]]

  // Renumérote tout : les positions restent contiguës même si des villes ont été retirées.
  const results = await Promise.all(ids.map((cityId, position) => table.update({ position }).eq('id', cityId)))
  const failed = results.find((r) => r.error)
  if (failed) {
    console.error('[weather] réordonnancement', failed.error)
    done('save')
  }
  done('moved')
}
