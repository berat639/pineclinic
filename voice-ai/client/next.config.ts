import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.SERVER_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ]
  },
}

export default config
