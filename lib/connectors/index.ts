import type { Connector } from './types'

/** Connecteur provisoire : sera remplacé par l'appel Open-Meteo (phase 1, météo). */
export const weatherConnector: Connector<null> = {
  id: 'weather',
  async read() {
    return { data: null, syncedAt: null }
  },
}
