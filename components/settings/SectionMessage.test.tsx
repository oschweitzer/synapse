// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionMessage } from './SectionMessage'

describe('SectionMessage', () => {
  it('ne rend rien quand le message est null', () => {
    const { container } = render(<SectionMessage message={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rend un succès avec le rôle status et les classes vertes', () => {
    render(<SectionMessage message={['Enregistré.', false]} />)
    const message = screen.getByRole('status')
    expect(message).toHaveTextContent('Enregistré.')
    expect(message).toHaveAttribute('class', 'text-sm text-green-700 dark:text-green-400')
  })

  it('rend une erreur avec le rôle alert et les classes rouges', () => {
    render(<SectionMessage message={['Ville invalide.', true]} />)
    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('Ville invalide.')
    expect(message).toHaveAttribute('class', 'text-sm text-red-600 dark:text-red-400')
  })

  it("transmet l'id au paragraphe et l'omet quand il n'est pas donné", () => {
    const { rerender } = render(<SectionMessage message={['Erreur.', true]} id="settings-error" />)
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'settings-error')
    rerender(<SectionMessage message={['Erreur.', true]} />)
    expect(screen.getByRole('alert')).not.toHaveAttribute('id')
  })
})
