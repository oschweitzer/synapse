import { cairnNoteUrl, type Todo } from '@/lib/connectors/cairn'
import { TIME_ZONE } from '@/lib/time'
import { CheckItem } from './CheckItem'

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
  const empty = todo.items.length === 0 && todo.pinned.length === 0

  return (
    <div className="flex flex-col gap-4">
      {empty && <p className={`text-sm ${muted}`}>Rien à faire. 🎉</p>}

      {todo.items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Items à faire">
          {todo.items.map((item) => (
            <CheckItem key={item.id} id={item.id} label={item.content ?? `Élément masqué de ${item.noteLabel}`}>
              <p className="break-words">
                {item.content ?? <span className={`italic ${muted}`}>Élément masqué</span>}
              </p>
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

      {todo.pinned.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Épinglées</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {todo.pinned.map((note) => (
              <li key={note.id}>
                📌 <CairnLink noteId={note.id}>{note.label}</CairnLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      {todo.privateCount > 0 && <p className={`text-xs ${muted}`}>🔒 {privateLabel(todo.privateCount)}</p>}
    </div>
  )
}
