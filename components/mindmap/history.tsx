'use client'

import { createContext, useContext } from 'react'

/** `record()` : à appeler juste AVANT une modification pour qu'elle soit annulable. */
export const MindHistoryContext = createContext<{ record: () => void }>({ record: () => {} })

export function useMindHistory() {
  return useContext(MindHistoryContext)
}
