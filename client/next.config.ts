import type { NextConfig } from 'next'

// Server-side proxy her zaman localhost:3001 — ngrok sadece client-side (WS/direct) için
const BACKEND_PROXY_URL = process.env.BACKEND_PROXY_URL || 'http://localhost:3001'

const config: NextConfig = {
  output: 'standalone',

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
}

export default config
