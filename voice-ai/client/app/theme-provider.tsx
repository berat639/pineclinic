'use client'

import { useEffect, useState } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    const preferred = saved ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    document.documentElement.setAttribute('data-theme', preferred)
  }, [])

  return <>{children}</>
}

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const update = () => {
      setIsDark((document.documentElement.getAttribute('data-theme') ?? 'dark') === 'dark')
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const toggle = () => {
    const next = isDark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  return (
    <button
      onClick={toggle}
      className={`theme-toggle${className ? ` ${className}` : ''}`}
      title={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
