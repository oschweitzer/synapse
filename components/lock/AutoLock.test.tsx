// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoLock } from './AutoLock'

const assign = vi.fn()
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  assign.mockReset()
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('location', { ...window.location, assign })
})

afterEach(() => {
  vi.useRealTimers()
  // Retire la surcharge posée sur l'instance : visibilityState retombe sur le getter de Document.prototype.
  delete (document as { visibilityState?: unknown }).visibilityState
})

describe('AutoLock', () => {
  it('ne rend rien', () => {
    const { container } = render(<AutoLock idleMinutes={1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('idleMinutes=1: après 60 s sans activité, POST /api/lock/lock puis location.assign(/unlock)', async () => {
    render(<AutoLock idleMinutes={1} />)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledWith('/api/lock/lock', { method: 'POST', redirect: 'manual' })
    expect(assign).toHaveBeenCalledWith('/unlock')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it('avant le délai (50 s), rien n’est appelé', async () => {
    render(<AutoLock idleMinutes={1} />)
    await vi.advanceTimersByTimeAsync(50_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('une activité (keydown) à 50 s repousse le verrouillage: rien à 60 s, verrouillage à 110 s', async () => {
    render(<AutoLock idleMinutes={1} />)
    await vi.advanceTimersByTimeAsync(50_000)
    fireEvent.keyDown(window)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(assign).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50_000)
    expect(assign).toHaveBeenCalledWith('/unlock')
  })

  it('retour au premier plan après le délai (visibilitychange): verrouille sans attendre l’intervalle', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    render(<AutoLock idleMinutes={1} />)
    // L'horloge saute sans exécuter l'intervalle : seul l'évènement de visibilité peut verrouiller.
    vi.setSystemTime(Date.now() + 60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(assign).toHaveBeenCalledWith('/unlock')
  })

  it('idleMinutes=0: rien même après plusieurs heures', async () => {
    render(<AutoLock idleMinutes={0} />)
    await vi.advanceTimersByTimeAsync(5 * 3_600_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('démontage: l’intervalle et les écouteurs sont retirés, plus de verrouillage ensuite', async () => {
    const { unmount } = render(<AutoLock idleMinutes={1} />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    vi.setSystemTime(Date.now() + 120_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(assign).not.toHaveBeenCalled()
  })

  it('fetch qui rejette: location.assign(/unlock) est quand même appelé', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    render(<AutoLock idleMinutes={1} />)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(assign).toHaveBeenCalledWith('/unlock')
  })
})
