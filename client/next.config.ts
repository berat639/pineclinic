import type { NextConfig } from 'next'

// Server-side proxy her zaman localhost:3001 — ngrok sadece client-side (WS/direct) için
const BACKEND_PROXY_URL = process.env.BACKEND_PROXY_URL || 'http://localhost:3001'

const config: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path((?!admin-auth|direct-session).*)',
        destination: `${BACKEND_PROXY_URL}/api/:path*`,
      },
    ]
  },
}

export default config
