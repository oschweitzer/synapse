import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './tokens.css'
import './globals.css'
import './hud.css'

// Polices auto-hébergées (app/fonts, licence OFL) : le build ne dépend pas de Google Fonts.
const display = localFont({
  src: [
    { path: './fonts/chakra-petch-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/chakra-petch-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/chakra-petch-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
})
const sans = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sans',
})
const mono = localFont({
  src: [
    { path: './fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Synapse',
  description: 'Dashboard de pilotage du quotidien',
  appleWebApp: { capable: true, title: 'Synapse', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#05080d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="hud-grid">{children}</body>
    </html>
  )
}
