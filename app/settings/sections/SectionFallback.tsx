import { Spinner } from '@/components/ui/Spinner'
import { cx } from '@/components/ui/cx'
import { card } from './styles'

/** Repli Suspense d'une section des réglages : sa carte avec le titre et un spinner. Un <div>, pas une <section>, pour ne pas être pris pour la section chargée. */
export function SectionFallback({ title, className }: { title: string; className?: string }) {
  return (
    <div className={cx(card, className)}>
      <h2 className="font-semibold">{title}</h2>
      <Spinner size="sm" label={`Chargement de la section ${title}…`} />
    </div>
  )
}
