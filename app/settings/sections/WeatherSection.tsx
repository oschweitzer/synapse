import { listLocations, WEATHER_LOCATIONS_MAX } from '@/lib/connectors/weather'
import { WeatherForms } from '@/components/settings/WeatherForms'
import { card } from './styles'

/** Section « Météo » : villes du widget « Météo ». */
export async function WeatherSection() {
  const cities = await listLocations().catch((e) => {
    console.error('[settings] lecture des villes', e)
    return null
  })

  return (
    <section className={`${card} mt-4`}>
      <h2 className="font-semibold">Météo</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Villes affichées dans le widget « Météo » ({WEATHER_LOCATIONS_MAX} au plus). Sans ville, c’est Paris.
      </p>
      <WeatherForms cities={cities} max={WEATHER_LOCATIONS_MAX} />
    </section>
  )
}
