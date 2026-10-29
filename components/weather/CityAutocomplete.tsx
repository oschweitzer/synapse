'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { addCity, findCities } from '@/app/actions/weather'
// Import de type seulement : un import de valeur embarquerait le code serveur dans le bundle client.
import type { CityResult } from '@/lib/connectors/weather'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

const DEBOUNCE_MS = 300

/** Recherche de ville avec suggestions à la saisie (combobox ARIA), puis ajout sans rechargement de la page. */
export function CityAutocomplete({ full, max }: { full: boolean; max: number }) {
  const inputId = useId()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CityResult | null>(null)
  const [results, setResults] = useState<CityResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const q = query.trim()
    if (selected || q.length < 2) return
    // Une action serveur ne s'annule pas sur le réseau : le contrôleur écarte les réponses périmées.
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setStatus('loading')
      let response: Awaited<ReturnType<typeof findCities>>
      try {
        response = await findCities(q)
      } catch {
        response = { error: 'Recherche impossible : Open-Meteo ne répond pas.' }
      }
      if (controller.signal.aborted) return
      if (response.error) {
        setResults([])
        setSearchError(response.error)
        setStatus('error')
      } else {
        setResults(response.results ?? [])
        setSearchError(null)
        setStatus('done')
      }
      setActive(-1)
      setOpen(true)
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, selected])

  /** Remet la recherche à zéro (appelé par les gestionnaires d'évènements, pas par l'effet). */
  function resetSearch() {
    setResults([])
    setStatus('idle')
    setOpen(false)
    setActive(-1)
  }

  function choose(city: CityResult) {
    setSelected(city)
    setQuery(city.label)
    resetSearch()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current + step + results.length) % results.length)
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && results[active]) {
        e.preventDefault()
        choose(results[active])
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
      }
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    const city = selected
    setMessage(null)
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof addCity>>
      try {
        result = await addCity({ label: city.label, latitude: city.latitude, longitude: city.longitude })
      } catch {
        result = { error: 'Enregistrement impossible, réessaie.' }
      }
      if (result.error) {
        setMessage({ text: result.error, error: true })
      } else {
        setQuery('')
        setSelected(null)
        resetSearch()
        setMessage({ text: 'Ville ajoutée.', error: false })
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor={inputId} className="sr-only">
            Rechercher une ville
          </label>
          <input
            id={inputId}
            className="hud-input w-full"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            aria-busy={status === 'loading' || undefined}
            autoComplete="off"
            maxLength={80}
            placeholder="Strasbourg, Lyon…"
            disabled={full}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(null)
              setMessage(null)
              // Les suggestions de l'ancienne saisie ne doivent pas rester cliquables pendant le délai.
              resetSearch()
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (!selected && query.trim().length >= 2 && results.length > 0) setOpen(true)
            }}
            onBlur={() => setOpen(false)}
          />
          {status === 'loading' && (
            <Spinner size="sm" label="Recherche…" className="absolute right-2 top-1/2 -translate-y-1/2" />
          )}
          {open && (
            <div className="hud-input absolute left-0 right-0 top-full z-10 mt-1 flex flex-col gap-1 p-2 text-sm shadow-lg">
              {status === 'error' ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {searchError}
                </p>
              ) : results.length === 0 ? (
                <p className="text-sm">Aucune ville trouvée pour « {query.trim()} ».</p>
              ) : (
                <ul id={listId} role="listbox" aria-label="Suggestions de villes">
                  {results.map((r, i) => (
                    <li
                      key={`${r.latitude},${r.longitude}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      className={`cursor-pointer px-2 py-1 ${i === active ? 'bg-slate-200 dark:bg-slate-700' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(r)}
                    >
                      {r.label}
                      {r.detail && <span className="text-slate-500 dark:text-slate-400"> · {r.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <Button type="submit" variant="primary" loading={pending} disabled={!selected || full}>
          Ajouter
        </Button>
      </form>
      {full && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {max} villes au plus : retires-en une pour en ajouter une autre.
        </p>
      )}
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={`text-sm ${message.error ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
