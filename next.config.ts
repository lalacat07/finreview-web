import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse'],
  // 仅在 webpack 开发模式生效：缩小文件监听范围，不监听 node_modules/.next/.git
  // 这是此前 dev 模式内存失控（吃满内存冻死系统）的根因防护之一
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
        aggregateTimeout: 300,
        poll: false,
      }
    }
    return config
  },
}

export default nextConfig
