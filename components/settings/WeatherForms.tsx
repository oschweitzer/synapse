'use client'

import { useActionState } from 'react'
import { addCity, moveCity, removeCity } from '@/app/actions/weather'
// Import de type seulement : un import de valeur embarquerait le code serveur dans le bundle client.
import type { WeatherLocation } from '@/lib/connectors/weather'
import { CityAutocomplete } from '@/components/weather/CityAutocomplete'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { useLastSubmitted } from '@/components/settings/useLastSubmitted'

/** Retours de la météo : [message, est une erreur]. Le message « max » dépend de `max`, voir `weatherMessage`. */
const WEATHER_MESSAGES: Record<string, [string, boolean]> = {
  added: ['Ville ajoutée.', false],
  removed: ['Ville retirée.', false],
  moved: ['Ordre enregistré.', false],
  invalid: ['Ville invalide.', true],
  save: ['Enregistrement impossible, réessaie.', true],
}

/** Message d'un code de retour ; un code inconnu retombe sur « save ». */
function weatherMessage(code: string, max: number): [string, boolean] {
  if (code === 'max') return [`${max} villes au plus : retires-en une d’abord.`, true]
  return WEATHER_MESSAGES[code] ?? WEATHER_MESSAGES.save
}

/**
 * Liste des villes, recherche avec ajout et message de la section « Météo ».
 * Les actions tournent sans navigation ; `max` vient de la section serveur (`WEATHER_LOCATIONS_MAX`).
 */
export function WeatherForms({ cities, max }: { cities: WeatherLocation[] | null; max: number }) {
  // Les actions serveur sont passées telles quelles : une fonction enveloppante ferait rendre `javascript:throw…` comme
  // `action` du formulaire, et le déplacement et le retrait ne marcheraient plus sans JavaScript.
  const [addState, addAction, addPending] = useActionState(addCity, null)
  const [moveState, moveAction] = useActionState(moveCity, null)
  const [removeState, removeAction] = useActionState(removeCity, null)

  const [latest, setLast] = useLastSubmitted({ add: addState, move: moveState, remove: removeState })

  return (
    <>
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
                      <form key={direction} action={moveAction} onSubmit={() => setLast('move')}>
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
                  <form action={removeAction} onSubmit={() => setLast('remove')}>
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
        full={cities !== null && cities.filter((c) => c.id !== 'default').length >= max}
        max={max}
        action={addAction}
        onSubmit={() => setLast('add')}
        state={addState}
        pending={addPending}
      />
      {latest && <SectionMessage key={`${latest.code}-${latest.at}`} message={weatherMessage(latest.code, max)} />}
    </>
  )
}
