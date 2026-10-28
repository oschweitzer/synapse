import { afterEach, describe, expect, it, vi } from 'vitest'
import { envUrl } from './env'

describe('envUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('renvoie la valeur par défaut quand la variable est absente', () => {
    expect(envUrl('SYNAPSE_TEST_URL', 'https://exemple.test')).toBe('https://exemple.test')
  })

  it('renvoie la valeur par défaut quand la variable est vide', () => {
    vi.stubEnv('SYNAPSE_TEST_URL', '')
    expect(envUrl('SYNAPSE_TEST_URL', 'https://exemple.test')).toBe('https://exemple.test')
  })

  it('renvoie la variable quand elle est définie, lue à chaque appel', () => {
    expect(envUrl('SYNAPSE_TEST_URL', 'https://exemple.test')).toBe('https://exemple.test')
    vi.stubEnv('SYNAPSE_TEST_URL', 'http://127.0.0.1:9999')
    expect(envUrl('SYNAPSE_TEST_URL', 'https://exemple.test')).toBe('http://127.0.0.1:9999')
  })
})
