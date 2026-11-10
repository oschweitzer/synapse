import { cairnNoteUrl, type Todo } from '@/lib/connectors/cairn'
import { TIME_ZONE } from '@/lib/time'
import { AddChecklistItem } from './AddChecklistItem'
import { CheckItem } from './CheckItem'
import { ItemText } from './ItemText'

const muted = 'text-slate-500 dark:text-slate-400'

function formatDue(dueAt: string) {
  return new Date(dueAt).toLocaleString('fr-FR', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CairnLink({ noteId, children }: { noteId: string; children: React.ReactNode }) {
  const href = cairnNoteUrl(noteId)
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
      {children}
    </a>
  )
}

export function privateLabel(count: number) {
  return `${count} élément${count > 1 ? 's' : ''} privé${count > 1 ? 's' : ''}`
}

export function TodoWidget({ todo }: { todo: Todo }) {
  const empty = todo.items.length === 0

  return (
    <div className="flex flex-col gap-4">
      {empty && <p className={`text-sm ${muted}`}>Rien à faire. 🎉</p>}

      {todo.items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Items à faire">
          {todo.items.map((item) => (
            <CheckItem key={item.id} id={item.id} label={item.content ?? `Élément masqué de ${item.noteLabel}`}>
              {item.content !== null ? (
                <ItemText id={item.id} content={item.content} />
              ) : (
                <p className="break-words">
                  <span className={`italic ${muted}`}>Élément masqué</span>
                </p>
              )}
              <p className={`text-xs ${muted}`}>
                <CairnLink noteId={item.noteId}>{item.noteLabel}</CairnLink>
                {item.dueAt && (
                  <span className={item.isDue ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
                    {' · '}
                    {formatDue(item.dueAt)}
                  </span>
                )}
              </p>
            </CheckItem>
          ))}
        </ul>
      )}
      {todo.moreCount > 0 && <p className={`text-xs ${muted}`}>… et {todo.moreCount} autres dans Cairn</p>}

      {todo.checklists.length > 0 ? (
        <AddChecklistItem checklists={todo.checklists} storageKey="synapse:todo-checklist" label="Ajouter un item" />
      ) : (
        <p className={`text-xs ${muted}`}>Aucune checklist Cairn où ajouter un item.</p>
      )}

      {todo.privateCount > 0 && <p className={`text-xs ${muted}`}>🔒 {privateLabel(todo.privateCount)}</p>}
    </div>
  )
}
