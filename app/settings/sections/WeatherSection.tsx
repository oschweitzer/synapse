import { moveCity, removeCity } from '@/app/actions/weather'
import { listLocations, WEATHER_LOCATIONS_MAX } from '@/lib/connectors/weather'
import { CityAutocomplete } from '@/components/weather/CityAutocomplete'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { card } from './styles'

/** Retours de la météo (`?weather=…`) : [message, est une erreur]. */
const WEATHER_MESSAGES: Record<string, [string, boolean]> = {
  removed: ['Ville retirée.', false],
  moved: ['Ordre enregistré.', false],
  invalid: ['Ville invalide.', true],
  save: ['Enregistrement impossible, réessaie.', true],
}

/** Section « Météo » : villes du widget « Météo ». */
export async function WeatherSection({ code }: { code?: string }) {
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
      {cities === null ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Lecture des villes impossible.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cities.map((city, i) => (
            <li key={city.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">{city.label}</span>
              {city.id !== 'default' && (
                <span className="flex gap-3">
                  {([-1, 1] as const).map((direction) => {
                    const disabled = direction === -1 ? i === 0 : i === cities.length - 1
                    return (
                      <form key={direction} action={moveCity}>
                        <input type="hidden" name="id" value={city.id} />
                        <input type="hidden" name="direction" value={direction} />
                        <SubmitButton
                          disabled={disabled}
                          className="text-sm text-slate-500 underline disabled:no-underline disabled:opacity-40 dark:text-slate-400"
                        >
                          {direction === -1 ? 'Monter' : 'Descendre'}
                          <span className="sr-only"> « {city.label} »</span>
                        </SubmitButton>
                      </form>
                    )
                  })}
                  <form action={removeCity}>
                    <input type="hidden" name="id" value={city.id} />
                    <SubmitButton className="text-sm text-slate-500 underline dark:text-slate-400">
                      Retirer<span className="sr-only"> « {city.label} »</span>
                    </SubmitButton>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <CityAutocomplete
        full={cities !== null && cities.filter((c) => c.id !== 'default').length >= WEATHER_LOCATIONS_MAX}
        max={WEATHER_LOCATIONS_MAX}
      />
      <SectionMessage message={code ? (WEATHER_MESSAGES[code] ?? WEATHER_MESSAGES.save) : null} />
    </section>
  )
}
