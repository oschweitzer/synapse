'use client'

import { useState, useTransition } from 'react'
import { saveMoodNote, setMood } from '@/app/actions/mood'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { MOOD_LABELS } from '@/lib/mood'

const muted = 'text-slate-500 dark:text-slate-400'

/** Humeur du jour en un clic, puis un mot facultatif. */
export function MoodPicker({ score, note }: { score: number | null; note: string | null }) {
  const [current, setCurrent] = useState(score)
  const [text, setText] = useState(note ?? '')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  function pick(next: number) {
    const previous = current
    setCurrent(next)
    setMessage(null)
    startTransition(async () => {
      const result = await setMood(next)
      if (result.error) {
        setCurrent(previous)
        setMessage({ text: result.error, error: true })
      }
    })
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const result = await saveMoodNote(text)
      setMessage(result.error ? { text: result.error, error: true } : { text: 'Enregistré.', error: false })
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Humeur du jour" className="flex justify-between gap-1">
        {Object.entries(MOOD_LABELS).map(([value, { emoji, label }]) => {
          const selected = current === Number(value)
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              disabled={pending}
              onClick={() => pick(Number(value))}
              className={`flex-1 rounded py-1 text-2xl transition ${
                selected
                  ? 'bg-slate-200 dark:bg-slate-700'
                  : current == null
                    ? 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'opacity-40 hover:opacity-100'
              }`}
            >
              {emoji}
            </button>
          )
        })}
      </div>
      {current != null && (
        <form onSubmit={save} className="flex gap-2">
          <label htmlFor="mood-note" className="sr-only">
            Un mot sur la journée
          </label>
          <input
            id="mood-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Un mot sur la journée (facultatif)"
            className="hud-input hud-input--sm min-w-0 flex-1"
          />
          <Button type="submit" size="sm" loading={pending}>
            OK
          </Button>
        </form>
      )}
      {pending && (
        <p className={`flex items-center gap-2 text-xs ${muted}`}>
          <Spinner size="sm" label="Enregistrement…" />
        </p>
      )}
      {current == null && <p className={`text-xs ${muted}`}>Comment ça va aujourd’hui ?</p>}
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={`text-xs ${message.error ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
