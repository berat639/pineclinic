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
          <Toaster 
            position="top-right" 
            containerStyle={{
              zIndex: 99999999,
              top: 24,
              right: 24
            }}
            toastOptions={{
              duration: 4000,
              style: {
                zIndex: 99999999,
                borderRadius: '10px',
                background: '#0f172a',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
                fontSize: '0.88rem',
                fontWeight: 600
              }
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
