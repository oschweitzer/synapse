import type { Metadata, Viewport } from 'next'
import { Chakra_Petch, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google'
import './tokens.css'
import './globals.css'
import './hud.css'

const display = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' })
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Synapse',
  description: 'Dashboard de pilotage du quotidien',
  appleWebApp: { capable: true, title: 'Synapse', statusBarStyle: 'default' },
  icons: { apple: '/icons/icon-192.png' },
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
