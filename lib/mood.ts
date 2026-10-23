/** Échelle d'humeur, partagée par le widget (client) et le connecteur. */
export const MOOD_LABELS: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😞', label: 'Très mal' },
  2: { emoji: '🙁', label: 'Pas terrible' },
  3: { emoji: '😐', label: 'Neutre' },
  4: { emoji: '🙂', label: 'Bien' },
  5: { emoji: '😄', label: 'Très bien' },
}
