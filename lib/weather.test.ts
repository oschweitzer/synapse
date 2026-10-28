import { describe, it, expect } from 'vitest'
import { describeWeatherCode } from '@/lib/weather'

describe('describeWeatherCode', () => {
  it.each([
    [0, 'Ciel dégagé'],
    [1, 'Peu nuageux'],
    [2, 'Peu nuageux'],
    [3, 'Couvert'],
    [45, 'Brouillard'],
    [48, 'Brouillard'],
    [51, 'Bruine'],
    [57, 'Bruine'],
    [61, 'Pluie'],
    [67, 'Pluie'],
    [71, 'Neige'],
    [77, 'Neige'],
    [80, 'Averses'],
    [82, 'Averses'],
    [85, 'Averses de neige'],
    [86, 'Averses de neige'],
    [95, 'Orage'],
    [99, 'Orage'],
  ])('code %i → %s', (code, label) => {
    const result = describeWeatherCode(code)
    expect(result.label).toBe(label)
    expect(result.icon).not.toBe('')
  })

  it.each([4, 44, 50, 58, 70, 83, 84, 90])('code inconnu %i → Inconnu', (code) => {
    expect(describeWeatherCode(code).label).toBe('Inconnu')
  })
})
