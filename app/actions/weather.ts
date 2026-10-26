'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WEATHER_LOCATIONS_MAX } from '@/lib/connectors/weather'

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

/** Ajoute une ville (résultat de la recherche de géocodage) en dernière position. */
export async function addCity(formData: FormData) {
  const label = String(formData.get('label') ?? '').trim()
  const latitude = Number(formData.get('latitude'))
  const longitude = Number(formData.get('longitude'))
  if (
    label.length < 1 || label.length > 80 ||
    !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) || Math.abs(longitude) > 180
  ) {
    redirect('/settings?weather=invalid')
  }

  const { supabase } = await requireUser()
  const table = supabase.schema('synapse').from('weather_locations')
  const { data: existing, error: readError } = await table.select('position').order('position', { ascending: false })
  if (readError) {
    console.error('[weather] lecture des villes', readError)
    done('save')
  }
  if (existing.length >= WEATHER_LOCATIONS_MAX) done('max')

  const { error } = await table.insert({ label, latitude, longitude, position: (existing[0]?.position ?? -1) + 1 })
  if (error) {
    console.error('[weather] ajout d’une ville', error)
    done('save')
  }
  done('added')
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
