// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MindHistoryContext, useMindHistory } from './history'

describe('useMindHistory', () => {
  it('hors fournisseur renvoie un record no-op qui ne lève pas', () => {
    const { result } = renderHook(() => useMindHistory())
    expect(() => result.current.record()).not.toThrow()
  })

  it('dans MindHistoryContext.Provider renvoie le record fourni, appelé une fois', () => {
    const record = vi.fn()
    const wrapper = ({ children }: { children: ReactNode }) => <MindHistoryContext.Provider value={{ record }}>{children}</MindHistoryContext.Provider>
    const { result } = renderHook(() => useMindHistory(), { wrapper })
    result.current.record()
    expect(record).toHaveBeenCalledTimes(1)
  })
})
