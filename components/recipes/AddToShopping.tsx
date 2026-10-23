'use client'

import { useState, useTransition } from 'react'
import { addIngredientsToShopping } from '@/app/actions/recipes'

function addedLabel(count: number) {
  return `${count} ingrédient${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} aux courses.`
}

/** Bouton « ajouter les ingrédients aux courses » (checklist Cairn choisie dans les réglages). */
export function AddToShopping({ recipeId, className }: { recipeId: string; className: string }) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, startTransition] = useTransition()
  const added = message != null && !message.error

  function add() {
    setMessage(null)
    startTransition(async () => {
      const result = await addIngredientsToShopping(recipeId)
      setMessage(result.error ? { text: result.error, error: true } : { text: addedLabel(result.added ?? 0), error: false })
    })
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Une fois ajoutés, pas de second clic par mégarde (doublons dans la liste). */}
      <button type="button" onClick={add} disabled={pending || added} className={className}>
        {pending ? 'Ajout…' : 'Ajouter les ingrédients aux courses'}
      </button>
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
