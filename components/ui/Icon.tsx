const PATHS = {
  plus: 'M8 3v10M3 8h10',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
  edit: 'M10.5 2.5l3 3L6 13H3v-3z',
  check: 'M3 8.5l3 3 7-7',
  close: 'M4 4l8 8M12 4l-8 8',
  mail: 'M2 3.5h12v9H2zM2 4l6 5 6-5',
  run: 'M9.5 2.5a1.2 1.2 0 1 0 0 .1M6 14l2-4 2 2v3M8 10l1-3.5-3 1-1.5 2.5M9 6.5l2 2 2.5.5',
  heart: 'M8 13.5S2.5 10 2.5 6.2A2.7 2.7 0 0 1 8 5a2.7 2.7 0 0 1 5.5 1.2C13.5 10 8 13.5 8 13.5z',
  cart: 'M1.5 2.5h2l1.6 7.5h7.4l1.5-5.5H4.3M6 13h.01M12 13h.01',
  sync: 'M13 6A5 5 0 0 0 3.6 4.4L2.5 6M3 10a5 5 0 0 0 9.4 1.6l1.1-1.6M2.5 2.5V6H6M13.5 13.5V10H10',
  wallet: 'M2.5 4.5h10v8h-10zM2.5 4.5l8-2v2M10 8.5h2.5',
  task: 'M2.5 3.5h11v9h-11zM5 8l2 2 4-4',
  moon: 'M12.5 9.5A5 5 0 0 1 6.5 3.5a5 5 0 1 0 6 6z',
  lock: 'M3.5 7.5h9v6h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5M8 10v1.5',
  unlock: 'M3.5 7.5h9v6h-9zM5.5 7.5V5a2.5 2.5 0 0 1 4.9-.7M8 10v1.5',
  key: 'M6 10a3 3 0 1 1 2.1-.9L13.5 3.7M11 6.2l1.5 1.5M12.5 4.7L14 6.2',
  shield: 'M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4z',
  fingerprint:
    'M4.5 13c.6-1.3 1-2.8 1-4.5a2.5 2.5 0 0 1 5 0c0 1 0 2-.3 3M8 8.5c0 2.2-.5 4-1.5 5.5M3 10.5c.3-.7.5-1.4.5-2a4.5 4.5 0 0 1 8.5-2M12.4 8.5c0 1.6-.2 3-.7 4.3',
  grid: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
  up: 'M8 13V3M4 7l4-4 4 4',
  down: 'M8 3v10M4 9l4 4 4-4',
  pointer: 'M4 2.5v10l3-3 2 4 1.5-.7-2-4H12.5z',
  hand: 'M5 8V4a1 1 0 0 1 2 0v3M7 7V3a1 1 0 0 1 2 0v4M9 7V4a1 1 0 0 1 2 0v4M11 8V6a1 1 0 0 1 2 0v3.5c0 2.5-1.5 4-4 4H8c-1.5 0-2.5-.8-3.5-2.5L3 8.5a1 1 0 0 1 1.7-1L5 8z',
  undo: 'M5.5 3.5l-3 3 3 3M2.5 6.5H9a3.5 3.5 0 0 1 0 7H5',
  redo: 'M10.5 3.5l3 3-3 3M13.5 6.5H7a3.5 3.5 0 0 0 0 7h4',
  copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  'shape-text': 'M3.5 3.5h9M8 3.5v9M6 12.5h4',
  'shape-rect': 'M2.5 4.5h11v7h-11z',
  'shape-rounded': 'M4.5 4.5h7a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
  'shape-ellipse': 'M2.5 8a5.5 3.5 0 1 0 11 0a5.5 3.5 0 1 0 -11 0',
  'shape-diamond': 'M8 2.5l5.5 5.5L8 13.5 2.5 8z',
  'link-curve': 'M2.5 12.5C8 12.5 8 3.5 13.5 3.5',
  'link-straight': 'M2.5 12.5l11-9',
  'link-step': 'M2.5 12.5H8V3.5h5.5',
  'arrow-none': 'M2.5 8h11',
  'arrow-end': 'M2.5 8h11M10.5 5l3 3-3 3',
  'arrow-start': 'M13.5 8h-11M5.5 5l-3 3 3 3',
  'arrow-both': 'M2.5 8h11M5.5 5l-3 3 3 3M10.5 5l3 3-3 3',
  'dash-solid': 'M2 8h12',
  'dash-dashed': 'M2 8h3M6.5 8h3M11 8h3',
  'dash-dotted': 'M2.5 8h.01M5.5 8h.01M8.5 8h.01M11.5 8h.01M14 8h.01',
} as const

export type IconName = keyof typeof PATHS

/** Icône linéaire 16px, trait 1,5 à extrémités carrées, en `currentColor`. */
export function Icon({ name, size = 16, title, className }: { name: IconName; size?: number; title?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={className}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}
