// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSortable } from '@dnd-kit/sortable'
import { SortableDashboard, type DashboardItem } from './SortableDashboard'

vi.mock('@/app/actions/dashboard', () => ({ saveWidgetOrder: vi.fn(async () => ({})) }))
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>()
  // Conserve toujours le vrai useSortable, même si restoreMocks réinitialise le spy.
  return { ...actual, useSortable: vi.fn((...args: Parameters<typeof actual.useSortable>) => actual.useSortable(...args)) }
})

function makeItems(n: number, span: 4 | 8 = 4): DashboardItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    title: `Widget ${i}`,
    span,
    node: <section className="hud-panel">Widget {i}</section>,
  }))
}

function itemsOf(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('.hud-dash__item'))
}

describe('SortableDashboard', () => {
  it('donne à chaque widget --i égal à sa position', () => {
    const { container } = render(<SortableDashboard dashboardId="d" items={makeItems(3)} />)
    expect(itemsOf(container).map((el) => el.style.getPropertyValue('--i'))).toEqual(['0', '1', '2'])
  })

  it('plafonne --i à 8', () => {
    const { container } = render(<SortableDashboard dashboardId="d" items={makeItems(12)} />)
    const values = itemsOf(container).map((el) => el.style.getPropertyValue('--i'))
    expect(values.slice(8)).toEqual(['8', '8', '8', '8'])
    expect(values[7]).toBe('7')
  })

  it('passe la transition 200ms ease-out à useSortable pour chaque widget', () => {
    render(<SortableDashboard dashboardId="d" items={makeItems(3)} />)
    const calls = vi.mocked(useSortable).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(3)
    for (const [args] of calls) {
      expect(args.transition).toEqual({ duration: 200, easing: 'cubic-bezier(.16, 1, .3, 1)' })
    }
  })

  it('garde gridColumn span N à côté de --i', () => {
    const { container } = render(<SortableDashboard dashboardId="d" items={makeItems(2, 8)} />)
    for (const el of itemsOf(container)) {
      expect(el.style.gridColumn).toBe('span 8')
      expect(el.style.getPropertyValue('--i')).not.toBe('')
    }
  })

  it('garde les mêmes noeuds DOM par id quand la liste change (key stable)', () => {
    const items = makeItems(3)
    const { container, rerender } = render(<SortableDashboard dashboardId="d" items={items} />)
    const before = new Map(itemsOf(container).map((el, i) => [`w${i}`, el]))
    // w0 disparaît, w3 arrive : les positions (donc --i) changent, pas les noeuds.
    rerender(<SortableDashboard dashboardId="d" items={[items[1], items[2], ...makeItems(4).slice(3)]} />)
    const after = itemsOf(container)
    expect(after).toHaveLength(3)
    expect(after[0]).toBe(before.get('w1'))
    expect(after[1]).toBe(before.get('w2'))
    expect(after[0].style.getPropertyValue('--i')).toBe('0')
  })

  it('pose data-live sur la grille après le montage', () => {
    const { container } = render(<SortableDashboard dashboardId="d" items={makeItems(2)} />)
    expect(container.querySelector('.hud-dash')?.hasAttribute('data-live')).toBe(true)
  })

  it('recopie les valeurs de app/tokens.css dans la transition de tri', () => {
    const tokens = readFileSync('app/tokens.css', 'utf8')
    expect(tokens).toContain('--motion-base: 200ms;')
    expect(tokens).toContain('--ease-out: cubic-bezier(.16, 1, .3, 1);')
  })
})

describe('app/hud.css (entrée des widgets)', () => {
  const css = readFileSync('app/hud.css', 'utf8')

  it("anime l'entrée seulement sur une grille déjà montée, via translate", () => {
    expect(css).toMatch(/\.hud-dash\[data-live\] > \.hud-dash__item\s*\{[^}]*animation:\s*hud-widget-in/)
    const keyframes = css.match(/@keyframes hud-widget-in\s*\{.*\}\s*(?=\n)/)?.[0] ?? ''
    expect(keyframes).toContain('translate:')
    expect(keyframes).not.toMatch(/[^-]transform:/)
  })

  it("coupe l'entrée sous prefers-reduced-motion", () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toMatch(/\.hud-dash\[data-live\] > \.hud-dash__item\s*\{\s*animation:\s*none/)
  })
})
