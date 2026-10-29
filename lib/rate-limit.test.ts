import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRateLimiter } from './rate-limit'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createRateLimiter', () => {
  it('accepte jusqu’à la limite puis refuse dans la fenêtre', () => {
    const allow = createRateLimiter({ limit: 3, windowMs: 1000 })
    expect([allow('u1'), allow('u1'), allow('u1'), allow('u1')]).toEqual([true, true, true, false])
  })

  it('compte chaque clé à part', () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000 })
    expect(allow('u1')).toBe(true)
    expect(allow('u2')).toBe(true)
    expect(allow('u1')).toBe(false)
  })

  it('accepte de nouveau une fois la fenêtre écoulée', () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000 })
    expect(allow('u1')).toBe(true)
    expect(allow('u1')).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(allow('u1')).toBe(true)
  })

  it('un appel refusé ne prolonge pas le blocage', () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000 })
    allow('u1')
    vi.advanceTimersByTime(600)
    expect(allow('u1')).toBe(false)
    vi.advanceTimersByTime(401)
    expect(allow('u1')).toBe(true)
  })
})
