import Link from 'next/link'
import { cairnNoteUrl, type Shopping } from '@/lib/connectors/cairn'
import { AddChecklistItem } from './AddChecklistItem'
import { CheckItem } from './CheckItem'
import { ItemText } from './ItemText'
import { privateLabel } from './Todo'

const muted = 'text-slate-500 dark:text-slate-400'

export function ShoppingWidget({ shopping }: { shopping: Shopping }) {
  if (shopping.status !== 'ok') {
    return (
      <p className={`text-sm ${muted}`}>
        {shopping.status === 'unset'
          ? 'Aucune checklist Cairn choisie pour les courses. '
          : 'La checklist des courses est introuvable ou passée au coffre. '}
        <Link href="/settings" className="underline">
          Choisir une checklist
        </Link>
      </p>
    )
  }

  const href = cairnNoteUrl(shopping.noteId)

  return (
    <div className="flex flex-col gap-3">
      {shopping.items.length === 0 ? (
        <p className={`text-sm ${muted}`}>Liste vide.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={shopping.label}>
          {shopping.items.map((item) => (
            <CheckItem key={item.id} id={item.id} label={item.content}>
              {shopping.masked ? <p className="break-words">{item.content}</p> : <ItemText id={item.id} content={item.content} />}
            </CheckItem>
          ))}
        </ul>
      )}
      <AddChecklistItem checklists={[{ id: shopping.noteId, label: shopping.label }]} label="Ajouter un article" />
      {shopping.privateCount > 0 && <p className={`text-xs ${muted}`}>🔒 {privateLabel(shopping.privateCount)}</p>}
      <p className={`text-xs ${muted}`}>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
            Ouvrir « {shopping.label} » dans Cairn
          </a>
        ) : (
          shopping.label
        )}
      </p>
    </div>
  )
}
