// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Badge } from './Badge'
import { Button, buttonClass } from './Button'
import { Gauge } from './Gauge'
import { Input } from './Input'
import { Panel } from './Panel'
import { Sparkline } from './Sparkline'
import { Stat } from './Stat'

describe('buttonClass', () => {
  it("renvoie 'hud-btn hud-btn--ghost' par défaut", () => {
    expect(buttonClass()).toBe('hud-btn hud-btn--ghost')
  })

  it('ajoute hud-btn--sm, hud-btn--icon et hud-btn--block selon les options', () => {
    expect(buttonClass({ variant: 'primary', size: 'sm', iconOnly: true, block: true })).toBe('hud-btn hud-btn--primary hud-btn--sm hud-btn--icon hud-btn--block')
  })
})

describe('Button', () => {
  it("a type='button' par défaut et respecte type='submit'", () => {
    const { rerender } = render(<Button>Ok</Button>)
    expect(screen.getByRole('button', { name: 'Ok' })).toHaveAttribute('type', 'button')
    rerender(<Button type="submit">Ok</Button>)
    expect(screen.getByRole('button', { name: 'Ok' })).toHaveAttribute('type', 'submit')
  })

  it('fusionne className et appelle onClick au clic', async () => {
    const onClick = vi.fn()
    render(
      <Button className="extra" variant="primary" onClick={onClick}>
        Ok
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Ok' })
    expect(button).toHaveClass('hud-btn', 'hud-btn--primary', 'extra')
    await userEvent.setup().click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("loading: désactivé, aria-busy='true', icône remplacée par le spinner, libellé conservé", () => {
    const { container } = render(
      <Button loading icon="up">
        Envoi
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Envoi' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.hud-spinner')).toBeInTheDocument()
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
  })

  it('sans loading: pas de aria-busy, pas de spinner', () => {
    const { container } = render(<Button>Ok</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy')
    expect(container.querySelector('.hud-spinner')).not.toBeInTheDocument()
  })

  it('iconOnly: libellé dans un span .hud-sr, nom accessible conservé', () => {
    render(
      <Button iconOnly icon="up">
        Monter
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Monter' })
    expect(button).toHaveClass('hud-btn--icon')
    expect(screen.getByText('Monter')).toHaveClass('hud-sr')
  })
})

describe('Badge', () => {
  it('utilise le ton neutral par défaut et applique le ton demandé', () => {
    const { rerender } = render(<Badge>Info</Badge>)
    expect(screen.getByText('Info')).toHaveClass('hud-badge', 'hud-badge--neutral')
    rerender(<Badge tone="danger">Info</Badge>)
    expect(screen.getByText('Info')).toHaveClass('hud-badge--danger')
  })

  it('affiche le point .hud-dot seulement avec dot', () => {
    const { rerender } = render(<Badge>Info</Badge>)
    expect(screen.getByText('Info').querySelector('.hud-dot')).not.toBeInTheDocument()
    rerender(<Badge dot>Info</Badge>)
    expect(screen.getByText('Info').querySelector('.hud-dot')).toBeInTheDocument()
  })
})

describe('Input', () => {
  it('relie le label au champ et le hint par aria-describedby', () => {
    render(<Input label="Montant" hint="En euros" />)
    const input = screen.getByLabelText('Montant')
    expect(input).toHaveAttribute('aria-describedby', screen.getByText('En euros').id)
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it("error: aria-invalid='true', message en role='alert', classe hud-field--error", () => {
    const { container } = render(<Input label="Montant" error="Montant invalide" />)
    expect(screen.getByLabelText('Montant')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Montant invalide')
    expect(container.firstElementChild).toHaveClass('hud-field--error')
  })

  it('sans message le span reste monté mais hidden', () => {
    const { container } = render(<Input label="Montant" />)
    const hint = container.querySelector('.hud-field__hint')
    expect(hint).toBeInTheDocument()
    expect(hint).not.toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('respecte l’id fourni', () => {
    render(<Input label="Montant" id="amount" />)
    expect(screen.getByLabelText('Montant')).toHaveAttribute('id', 'amount')
  })

  it('mono et size="sm" ajoutent hud-input--mono et hud-input--sm', () => {
    render(<Input label="Montant" mono size="sm" />)
    expect(screen.getByLabelText('Montant')).toHaveClass('hud-input', 'hud-input--mono', 'hud-input--sm')
  })
})

describe('Panel', () => {
  it('rend une section nommée par son titre, avec un h2, un index paddé et la meta', () => {
    render(
      <Panel title="Météo" index={3} meta={<span>en direct</span>}>
        contenu
      </Panel>,
    )
    const section = screen.getByRole('region', { name: 'Météo' })
    expect(section).toHaveClass('hud-panel')
    expect(screen.getByRole('heading', { level: 2, name: 'Météo' })).toBeInTheDocument()
    expect(screen.getByText('03')).toHaveClass('hud-panel__index')
    expect(screen.getByText('en direct')).toBeInTheDocument()
    expect(screen.getByText('contenu')).toBeInTheDocument()
  })

  it("index 'auto': data-auto et texte vide", () => {
    const { container } = render(<Panel title="Météo" index="auto" />)
    const index = container.querySelector('.hud-panel__index')
    expect(index).toHaveAttribute('data-auto', 'true')
    expect(index).toBeEmptyDOMElement()
  })

  it('sans title ni meta, pas d’en-tête', () => {
    const { container } = render(<Panel>contenu</Panel>)
    expect(container.querySelector('header')).not.toBeInTheDocument()
  })

  it('busy pose aria-busy ; hero et compact ajoutent leurs classes', () => {
    render(
      <Panel title="Météo" busy variant="hero" compact>
        x
      </Panel>,
    )
    const section = screen.getByRole('region', { name: 'Météo' })
    expect(section).toHaveAttribute('aria-busy', 'true')
    expect(section).toHaveClass('hud-panel--hero', 'hud-panel--compact')
  })
})

describe('Stat', () => {
  it('affiche label, valeur et unité', () => {
    render(<Stat label="Pas" value="8 200" unit="pas" />)
    expect(screen.getByText('Pas')).toBeInTheDocument()
    expect(screen.getByText('pas')).toHaveClass('hud-stat__unit')
    expect(screen.getByText('pas').parentElement).toHaveTextContent('8 200pas')
  })

  it('affiche le delta avec la classe du sens et une flèche', () => {
    const { container } = render(<Stat label="Pas" value="1" delta="+5 %" trend="up" />)
    const delta = screen.getByText('+5 %')
    expect(delta).toHaveClass('hud-stat__delta', 'hud-stat__delta--up')
    expect(delta.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('.hud-stat__delta--down')).not.toBeInTheDocument()
  })

  it('n’affiche pas de delta sans prop', () => {
    const { container } = render(<Stat label="Pas" value="1" />)
    expect(container.querySelector('.hud-stat__delta')).not.toBeInTheDocument()
  })
})

describe('Gauge', () => {
  it('expose un role="meter" avec ses valeurs et son label', () => {
    render(<Gauge value={40} max={80} label="Sommeil" />)
    const meter = screen.getByRole('meter', { name: 'Sommeil' })
    expect(meter).toHaveAttribute('aria-valuenow', '40')
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '80')
  })

  it('display remplace la valeur affichée', () => {
    const { container } = render(<Gauge value={40} display="40 %" />)
    expect(container.querySelector('.hud-gauge__value')).toHaveTextContent('40 %')
  })

  it('trace 25 graduations', () => {
    const { container } = render(<Gauge value={40} />)
    expect(container.querySelectorAll('line.hud-gauge__tick')).toHaveLength(25)
  })

  it('borne une valeur au-dessus de max : l’arc est plein', () => {
    const { container } = render(<Gauge value={500} max={100} />)
    const arc = container.querySelector('.hud-gauge__arc')
    expect(Number(arc?.getAttribute('stroke-dashoffset'))).toBe(0)
  })
})

describe('Sparkline', () => {
  it("expose role='img' avec le label par défaut 'tendance' ou celui fourni", () => {
    const { rerender } = render(<Sparkline data={[1, 2, 3]} />)
    expect(screen.getByRole('img', { name: 'tendance' })).toBeInTheDocument()
    rerender(<Sparkline data={[1, 2, 3]} label="Poids" />)
    expect(screen.getByRole('img', { name: 'Poids' })).toBeInTheDocument()
  })

  it('line: polyline et point final', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />)
    expect(container.querySelector('polyline')).toBeInTheDocument()
    expect(container.querySelector('circle.hud-spark__dot')).toBeInTheDocument()
    expect(container.querySelector('rect')).not.toBeInTheDocument()
  })

  it('bars: un rect par donnée, la dernière mise en avant par défaut', () => {
    const { container } = render(<Sparkline type="bars" data={[1, 2, 3]} />)
    const bars = container.querySelectorAll('rect.hud-spark__bar')
    expect(bars).toHaveLength(3)
    expect(bars[2]).toHaveClass('hud-spark__bar--hi')
    expect(container.querySelectorAll('.hud-spark__bar--hi')).toHaveLength(1)
  })

  it('bars avec highlight: la barre indiquée est mise en avant', () => {
    const { container } = render(<Sparkline type="bars" data={[1, 2, 3]} highlight={0} />)
    const bars = container.querySelectorAll('rect.hud-spark__bar')
    expect(bars[0]).toHaveClass('hud-spark__bar--hi')
    expect(bars[2]).not.toHaveClass('hud-spark__bar--hi')
  })

  it('goal ajoute la ligne d’objectif, labels les étiquettes d’axe', () => {
    const { container } = render(<Sparkline type="bars" data={[1, 2, 3]} goal={2} labels={['L', 'M', 'M']} />)
    expect(container.querySelector('line.hud-spark__goal')).toBeInTheDocument()
    expect(container.querySelectorAll('text.hud-spark__axis')).toHaveLength(3)
  })

  it('sans goal ni labels, ni ligne d’objectif ni étiquettes', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />)
    expect(container.querySelector('line.hud-spark__goal')).not.toBeInTheDocument()
    expect(container.querySelector('text')).not.toBeInTheDocument()
  })
})
