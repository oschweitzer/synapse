'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

/** Couleurs proposées. Valeurs en hex littéral : les nœuds stockent des couleurs, pas des variables CSS. */
export const TOOL_COLORS: Array<{ name: string; value: string }> = [
  { name: 'cyan', value: '#3fd8f2' },
  { name: 'ambre', value: '#ffb547' },
  { name: 'vert', value: '#5ee6a8' },
  { name: 'rouge', value: '#ff6b6b' },
  { name: 'violet', value: '#a78bfa' },
  { name: 'bleu', value: '#5b9bff' },
  { name: 'rose', value: '#ff7ac6' },
  { name: 'ink-100', value: '#e4eef5' },
  { name: 'ink-300', value: '#9fb4c4' },
  { name: 'line-300', value: '#4d7192' },
  { name: 'hull-700', value: '#0f1924' },
  { name: 'void-900', value: '#05080d' },
]

/** Normalise une couleur : #rgb devient #rrggbb, en minuscules. Les autres valeurs (ex. 'transparent') passent en minuscules. */
function normalizeColor(value: string) {
  const v = value.toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : v
}

/** Un `<input type="color">` n'accepte que #rrggbb : repli sur noir sinon (ex. 'transparent'). */
function colorInputValue(value: string) {
  const v = normalizeColor(value)
  return /^#[0-9a-f]{6}$/.test(v) ? v : '#000000'
}

/**
 * Barre d'outils verticale ; les flèches déplacent le focus entre les outils et pastilles actifs (en boucle).
 * Choix assumé : pas de tabindex itinérant, chaque bouton reste un arrêt de Tab.
 */
export function Toolbox({ label, className, children }: { label: string; className?: string; children?: ReactNode }) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const prev = e.key === 'ArrowUp' || e.key === 'ArrowLeft'
    const next = e.key === 'ArrowDown' || e.key === 'ArrowRight'
    if (!prev && !next) return
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.hud-tool:not(:disabled), button.hud-swatch:not(:disabled)'))
    const index = buttons.findIndex((b) => b === document.activeElement)
    // Focus ailleurs (champ couleur…) : le navigateur gère.
    if (index === -1) return
    e.preventDefault()
    const target = prev ? (index - 1 + buttons.length) % buttons.length : (index + 1) % buttons.length
    buttons[target].focus()
  }

  return (
    <div role="toolbar" aria-label={label} aria-orientation="vertical" className={cx('hud-toolbox', className)} onKeyDown={onKeyDown}>
      <div className="hud-toolbox__inner">{children}</div>
    </div>
  )
}

/** Groupe titré d'outils, en grille. */
export function ToolGroup({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="hud-toolgroup">
      <span className="hud-label" aria-hidden="true">{title}</span>
      <div className="hud-toolgroup__grid">{children}</div>
    </div>
  )
}

/** Bouton icône 28px ; `label` sert d'infobulle et de nom accessible. */
export function ToolButton({ name, label, pressed, disabled, onClick, className }: {
  name: IconName
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={cx('hud-tool', className)}
      title={label}
      aria-label={label}
      aria-pressed={typeof pressed === 'boolean' ? pressed : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  )
}

/** Pastilles de couleur (TOOL_COLORS), option « sans remplissage » et couleur personnalisée. */
export function ColorSwatches({ label, value, onChange, allowNone }: { label: string; value: string; onChange: (value: string) => void; allowNone?: boolean }) {
  const current = normalizeColor(value)
  const isCustom = current !== 'transparent' && !TOOL_COLORS.some((c) => c.value.toLowerCase() === current)
  return (
    <div role="group" aria-label={label} className="hud-swatches">
      {allowNone && (
        <button
          type="button"
          className="hud-swatch hud-swatch--none"
          aria-label="Sans remplissage"
          title="Sans remplissage"
          aria-pressed={current === 'transparent'}
          onClick={() => onChange('transparent')}
        />
      )}
      {TOOL_COLORS.map((c) => (
        <button
          type="button"
          key={c.value}
          className="hud-swatch"
          aria-label={c.name}
          title={c.name}
          aria-pressed={current === c.value.toLowerCase()}
          style={{ backgroundColor: c.value }}
          onClick={() => onChange(c.value)}
        />
      ))}
      <label className="hud-swatch hud-swatch--custom" title="Couleur personnalisée" data-selected={isCustom ? 'true' : undefined}>
        <input type="color" aria-label="Couleur personnalisée" value={colorInputValue(value)} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}
