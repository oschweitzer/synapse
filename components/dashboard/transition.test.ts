import { describe, expect, it } from 'vitest'
import { transitionDirection } from './transition'

describe('transitionDirection', () => {
  it("donne 'none' au premier rendu (pas d'index précédent)", () => {
    expect(transitionDirection(null, 0)).toBe('none')
    expect(transitionDirection(null, 3)).toBe('none')
  })

  it("donne 'next' vers un dashboard plus loin dans la navigation", () => {
    expect(transitionDirection(0, 1)).toBe('next')
    expect(transitionDirection(1, 4)).toBe('next')
  })

  it("donne 'previous' vers un dashboard plus tôt dans la navigation", () => {
    expect(transitionDirection(1, 0)).toBe('previous')
    expect(transitionDirection(4, 2)).toBe('previous')
  })

  it("donne 'none' quand l'index ne change pas", () => {
    expect(transitionDirection(2, 2)).toBe('none')
  })
})
