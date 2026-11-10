// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Shopping } from '@/lib/connectors/cairn'
import { ShoppingWidget } from './Shopping'

vi.mock('@/app/actions/cairn', () => ({
  setChecklistItemDone: vi.fn(),
  addChecklistItem: vi.fn(),
  updateChecklistItemContent: vi.fn(),
}))

const ok = (over: Partial<Extract<Shopping, { status: 'ok' }>> = {}): Shopping => ({
  status: 'ok',
  noteId: '11111111-1111-4111-8111-111111111111',
  label: 'Courses',
  masked: false,
  items: [
    { id: 'a', content: 'Lait' },
    { id: 'b', content: 'Pain' },
  ],
  privateCount: 0,
  ...over,
})

describe('ShoppingWidget', () => {
  it('« ok » affiche le champ « Ajouter un article » et un bouton Modifier par item', () => {
    render(<ShoppingWidget shopping={ok()} />)
    expect(screen.getByRole('textbox', { name: 'Ajouter un article' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier « Lait »' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier « Pain »' })).toBeInTheDocument()
  })

  it('affiche le champ d’ajout même sur une liste vide', () => {
    render(<ShoppingWidget shopping={ok({ items: [] })} />)
    expect(screen.getByText('Liste vide.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Ajouter un article' })).toBeInTheDocument()
  })

  it('masked: true n’offre aucun bouton Modifier', () => {
    render(<ShoppingWidget shopping={ok({ masked: true })} />)
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
    expect(screen.getByText('Lait')).toBeInTheDocument()
  })

  it.each([{ status: 'unset' }, { status: 'missing' }] as Shopping[])('« $status » n’affiche pas de formulaire d’ajout', (shopping) => {
    render(<ShoppingWidget shopping={shopping} />)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
