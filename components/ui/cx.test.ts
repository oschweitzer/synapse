import { describe, expect, it } from 'vitest'
import { cx } from './cx'

describe('cx', () => {
  it('joint les classes par un espace', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c')
  })

  it('ignore false, null, undefined et les chaînes vides', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('renvoie une chaîne vide sans argument', () => {
    expect(cx()).toBe('')
  })
})
