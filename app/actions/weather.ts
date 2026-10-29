'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/rate-limit'
import { searchCities, WEATHER_LOCATIONS_MAX, type CityResult } from '@/lib/connectors/weather'
import { sectionState, type SectionState } from '@/lib/settings/section-state'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')
  return { supabase, userId: data.user.id }
}

/** Coordonnée d'un champ de formulaire ; NaN si le champ est absent ou vide (`Number(null)` vaudrait 0). */
function coordinate(value: FormDataEntryValue | null): number {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
}

/** Revalide le dashboard et les réglages, puis renvoie l'état de la section (lu par `useActionState`). */
function done(code: string): NonNullable<SectionState> {
  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState(code)
}

const SESSION_EXPIRED = 'Session expirée, reconnecte-toi.'

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
 * Ajoute une ville (suggestion choisie dans l'autocomplétion) en dernière position. Les champs `label`, `latitude`
 * et `longitude` viennent du client : validés ici. Renvoie l'état de la section, la liste se met à jour sur place.
 */
export async function addCity(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const label = String(formData.get('label') ?? '').trim()
  const latitude = coordinate(formData.get('latitude'))
  const longitude = coordinate(formData.get('longitude'))
  if (
    label.length < 1 || label.length > 80 ||
    !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) || Math.abs(longitude) > 180
  ) {
    return sectionState('invalid')
  }

  const { supabase } = await requireUser()
  const table = supabase.schema('synapse').from('weather_locations')
  const { data: existing, error: readError } = await table.select('position').order('position', { ascending: false })
  if (readError) {
    console.error('[weather] lecture des villes', readError)
    return done('save')
  }
  if (existing.length >= WEATHER_LOCATIONS_MAX) return done('max')

  const { error } = await table.insert({ label, latitude, longitude, position: (existing[0]?.position ?? -1) + 1 })
  if (error) {
    // La base tient aussi la limite (migration 0011) : deux ajouts simultanés peuvent passer la lecture ci-dessus.
    if (error.message === 'weather_locations_max') return done('max')
    console.error('[weather] ajout d’une ville', error)
    return done('save')
  }
  return done('added')
}

export async function removeCity(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const id = String(formData.get('id') ?? '')
  if (!UUID.test(id)) return sectionState('invalid')

  const { supabase } = await requireUser()
  const { error } = await supabase.schema('synapse').from('weather_locations').delete().eq('id', id)
  if (error) {
    console.error('[weather] retrait d’une ville', error)
    return done('save')
  }
  return done('removed')
}

/** Échange une ville avec sa voisine (direction -1 = monter, 1 = descendre). */
export async function moveCity(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const id = String(formData.get('id') ?? '')
  const direction = Number(formData.get('direction'))
  if (!UUID.test(id) || (direction !== -1 && direction !== 1)) return sectionState('invalid')

  const { supabase } = await requireUser()
  const table = supabase.schema('synapse').from('weather_locations')
  const { data, error } = await table.select('id').order('position').order('created_at')
  if (error) {
    console.error('[weather] lecture des villes', error)
    return done('save')
  }

  const ids = data.map((row) => row.id)
  const from = ids.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) return done('moved')
  ;[ids[from], ids[to]] = [ids[to], ids[from]]

  // Renumérote tout : les positions restent contiguës même si des villes ont été retirées.
  const results = await Promise.all(ids.map((cityId, position) => table.update({ position }).eq('id', cityId)))
  const failed = results.find((r) => r.error)
  if (failed) {
    console.error('[weather] réordonnancement', failed.error)
    return done('save')
  }
  return done('moved')
}
