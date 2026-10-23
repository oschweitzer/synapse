/** Fuseau utilisé pour « aujourd'hui » : le serveur (Vercel) tourne en UTC. */
export const TIME_ZONE = 'Europe/Paris'

/** Date locale (y, m, d, h, min, s) de `date` dans `timeZone`. */
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return [get('year'), get('month'), get('day'), get('hour'), get('minute'), get('second')] as const
}

/** Décalage du fuseau à cet instant, en ms (heure locale lue comme UTC, moins l'instant réel). */
function offsetAt(date: Date, timeZone: string) {
  const [y, m, d, h, min, s] = localParts(date, timeZone)
  return Date.UTC(y, m - 1, d, h, min, s) - Math.floor(date.getTime() / 1000) * 1000
}

/** Minuit (dans `timeZone`) du jour courant décalé de `days` jours, changements d'heure compris. */
export function startOfDay(now = new Date(), days = 0, timeZone = TIME_ZONE) {
  const [y, m, d] = localParts(now, timeZone)
  const midnight = Date.UTC(y, m - 1, d + days)
  // Le décalage de minuit peut différer de celui de maintenant un jour de changement d'heure.
  const guess = midnight - offsetAt(now, timeZone)
  return new Date(midnight - offsetAt(new Date(guess), timeZone))
}

/** Fin de la journée en cours dans `TIME_ZONE` (minuit suivant). */
export function endOfToday(now = new Date(), timeZone = TIME_ZONE) {
  return startOfDay(now, 1, timeZone)
}

/** Jour local au format AAAA-MM-JJ, pour regrouper par date. */
export function dayKey(date: Date, timeZone = TIME_ZONE) {
  const [y, m, d] = localParts(date, timeZone)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
