import type { Metadata } from 'next'
import { ThemeProvider } from './theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Voice AI — Sesli Asistan',
  description: 'Gerçek zamanlı sesli yapay zeka asistanı',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
