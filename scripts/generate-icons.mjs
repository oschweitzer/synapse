// Génère les icônes PNG (PWA et Apple) à partir de `app/icon.svg`, avec `sharp` (livré avec Next.js).
// Usage : node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('app/icon.svg', 'utf8')

// Version « maskable » / Apple : fond plein sans coins arrondis, motif réduit à 70 %
// pour rester dans la zone de sécurité quand la plateforme applique son propre masque.
const full = svg
  .replace('<rect width="64" height="64" rx="14" fill="#0f172a"/>', '<rect width="64" height="64" fill="#0f172a"/><g transform="translate(9.6 9.6) scale(.7)">')
  .replace('</svg>', '</g></svg>')

const render = (source, size, file) =>
  sharp(Buffer.from(source), { density: 600 }).resize(size, size).png().toFile(file)

await Promise.all([
  render(svg, 192, 'public/icons/icon-192.png'),
  render(svg, 512, 'public/icons/icon-512.png'),
  render(full, 512, 'public/icons/icon-512-maskable.png'),
  render(full, 180, 'app/apple-icon.png'),
])
console.log('Icônes générées depuis app/icon.svg')
