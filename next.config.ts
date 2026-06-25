import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 原生/特殊依赖不参与打包，按外部 require 处理：
  // - pdf-parse：文本抽取
  // - pdf-to-img / pdfjs-dist：PDF 渲染（GLM 视觉路径）
  // - @napi-rs/canvas：pdf-to-img 依赖的原生 canvas（含平台 .node 二进制）
  serverExternalPackages: ['pdf-parse', 'pdf-to-img', 'pdfjs-dist', '@napi-rs/canvas'],
  // 确保 Serverless 打包时把原生二进制与 pdfjs 资源一并 trace 进 /api/analyze 函数，
  // 否则线上会报找不到 *.node 或 pdfjs worker/字体。Vercel 运行时为 linux x64。
  outputFileTracingIncludes: {
    '/api/analyze': [
      './node_modules/@napi-rs/canvas-**/*',
      './node_modules/pdf-to-img/**/*',
      './node_modules/pdfjs-dist/**/*',
    ],
  },
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
