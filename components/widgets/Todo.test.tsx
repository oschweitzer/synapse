// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Todo } from '@/lib/connectors/cairn'
import { TodoWidget } from './Todo'

vi.mock('@/app/actions/cairn', () => ({
  setChecklistItemDone: vi.fn(),
  addChecklistItem: vi.fn(),
  updateChecklistItemContent: vi.fn(),
}))

const todo = (over: Partial<Todo> = {}): Todo => ({
  items: [
    { id: 'a', content: 'Appeler le garage', noteId: 'n1', noteLabel: 'Maison', dueAt: null, isDue: false },
    { id: 'b', content: null, noteId: 'n2', noteLabel: 'K2', dueAt: null, isDue: false },
  ],
  moreCount: 0,
  privateCount: 0,
  checklists: [
    { id: '11111111-1111-4111-8111-111111111111', label: 'Maison' },
    { id: '22222222-2222-4222-8222-222222222222', label: 'Travail' },
  ],
  ...over,
})

describe('TodoWidget', () => {
  it('un item visible a un bouton Modifier, un item masqué n’en a pas', () => {
    render(<TodoWidget todo={todo()} />)
    expect(screen.getByRole('button', { name: 'Modifier « Appeler le garage »' })).toBeInTheDocument()
    expect(screen.getByText('Élément masqué')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Modifier/ })).toHaveLength(1)
  })

  it('le formulaire d’ajout propose les checklists données', () => {
    render(<TodoWidget todo={todo()} />)
    expect(screen.getByRole('textbox', { name: 'Ajouter un item' })).toBeInTheDocument()
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Maison', 'Travail'])
  })

  it('sans checklist, le formulaire est remplacé par un message', () => {
    render(<TodoWidget todo={todo({ checklists: [] })} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Aucune checklist Cairn où ajouter un item.')).toBeInTheDocument()
  })
})
