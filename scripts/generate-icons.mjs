// Génère les icônes PWA (carré arrondi sombre + « S » clair) sans dépendance.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [15, 23, 42]
const FG = [248, 250, 252]

// « S » dessiné sur une grille 5x7, agrandie à la taille voulue.
const GLYPH = ['.####', '#....', '#....', '.###.', '....#', '....#', '####.']

function crc32(buf) {
  let c
  const table = Array.from({ length: 256 }, (_, n) => {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const cell = Math.floor(size / 10)
  const x0 = Math.floor((size - 5 * cell) / 2)
  const y0 = Math.floor((size - 7 * cell) / 2)
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - x0) / cell)
      const gy = Math.floor((y - y0) / cell)
      const on = gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && GLYPH[gy][gx] === '#'
      const [r, g, b] = on ? FG : BG
      const i = y * (size * 3 + 1) + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size))
