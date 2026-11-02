// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DashboardTransition } from './DashboardTransition'

function face(container: HTMLElement) {
  return container.querySelector('.hud-dash-stage > .hud-dash-face') as HTMLElement
}

describe('DashboardTransition', () => {
  it("au premier rendu : data-enter='none' et les enfants dans la scène", () => {
    const { container } = render(
      <DashboardTransition dashboardId="a" index={0}>
        <p>contenu</p>
      </DashboardTransition>,
    )
    expect(face(container).dataset.enter).toBe('none')
    expect(face(container).textContent).toBe('contenu')
  })

  it("vers un index plus grand (nouveau dashboard) : data-enter='next'", () => {
    const { container, rerender } = render(
      <DashboardTransition dashboardId="a" index={0}>
        <p>A</p>
      </DashboardTransition>,
    )
    rerender(
      <DashboardTransition dashboardId="b" index={1}>
        <p>B</p>
      </DashboardTransition>,
    )
    expect(face(container).dataset.enter).toBe('next')
    expect(face(container).textContent).toBe('B')
  })

  it("vers un index plus petit : data-enter='previous'", () => {
    const { container, rerender } = render(
      <DashboardTransition dashboardId="b" index={2}>
        <p>B</p>
      </DashboardTransition>,
    )
    rerender(
      <DashboardTransition dashboardId="a" index={0}>
        <p>A</p>
      </DashboardTransition>,
    )
    expect(face(container).dataset.enter).toBe('previous')
  })

  it("avec le même index et le même dashboard : garde la direction et ne remonte pas la face", () => {
    const { container, rerender } = render(
      <DashboardTransition dashboardId="a" index={0}>
        <p>A</p>
      </DashboardTransition>,
    )
    rerender(
      <DashboardTransition dashboardId="b" index={1}>
        <p>B</p>
      </DashboardTransition>,
    )
    const node = face(container)
    rerender(
      <DashboardTransition dashboardId="b" index={1}>
        <p>B, rafraîchi</p>
      </DashboardTransition>,
    )
    expect(face(container)).toBe(node)
    expect(face(container).dataset.enter).toBe('next')
    expect(face(container).textContent).toBe('B, rafraîchi')
  })

  it('remonte la face quand le dashboard change (rejoue l’animation)', () => {
    const { container, rerender } = render(
      <DashboardTransition dashboardId="a" index={0}>
        <p>A</p>
      </DashboardTransition>,
    )
    const before = face(container)
    rerender(
      <DashboardTransition dashboardId="b" index={1}>
        <p>B</p>
      </DashboardTransition>,
    )
    expect(face(container)).not.toBe(before)
  })

  it("avec le même index mais un autre dashboard (suppression, réordonnancement) : data-enter='none' et la face est remontée", () => {
    const { container, rerender } = render(
      <DashboardTransition dashboardId="a" index={0}>
        <p>A</p>
      </DashboardTransition>,
    )
    rerender(
      <DashboardTransition dashboardId="b" index={1}>
        <p>B</p>
      </DashboardTransition>,
    )
    expect(face(container).dataset.enter).toBe('next')
    const before = face(container)
    rerender(
      <DashboardTransition dashboardId="c" index={1}>
        <p>C</p>
      </DashboardTransition>,
    )
    expect(face(container)).not.toBe(before)
    expect(face(container).dataset.enter).toBe('none')
    expect(face(container).textContent).toBe('C')
  })
})
