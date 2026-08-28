import type { Metadata } from 'next'
import { ThemeProvider } from './theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Voice AI — Sesli Asistan',
  description: 'Gerçek zamanlı sesli yapay zeka asistanı',
}

import { Toaster } from 'react-hot-toast'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
