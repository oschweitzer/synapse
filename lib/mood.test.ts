import { describe, it, expect } from 'vitest'
import { MOOD_LABELS } from '@/lib/mood'

describe('MOOD_LABELS', () => {
  it('couvre exactement les scores 1 à 5', () => {
    expect(Object.keys(MOOD_LABELS).map(Number)).toEqual([1, 2, 3, 4, 5])
  })

  it('donne à chaque score un emoji et un libellé', () => {
    for (const { emoji, label } of Object.values(MOOD_LABELS)) {
      expect(emoji).not.toBe('')
      expect(label).not.toBe('')
    }
  })

  it('place « Neutre » au milieu', () => {
    expect(MOOD_LABELS[3].label).toBe('Neutre')
  })
})
