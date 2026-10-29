/** Message de retour d'une section des réglages (`?section=code`) : [texte, est une erreur]. Rien si `message` est null. */
export function SectionMessage({ message, id }: { message: [string, boolean] | null; id?: string }) {
  if (!message) return null
  const [text, isError] = message
  return (
    <p
      id={id}
      role={isError ? 'alert' : 'status'}
      className={`text-sm ${isError ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
    >
      {text}
    </p>
  )
}
