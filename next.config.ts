import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse'],
  // 空 turbopack 配置：Next.js 16 构建默认走 Turbopack，
  // 检测到下方 webpack 配置却无 turbopack 配置会直接报错并导致构建失败。
  // 显式声明空对象以消除该冲突，让生产构建用 Turbopack 正常进行。
  turbopack: {},
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
