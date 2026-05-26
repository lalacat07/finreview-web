import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FinGuard | 专业财务报告自查与风险识别平台',
  description: '帮助企业财务团队在发布前自查，识别数字错误、披露缺陷与风险信号',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className={inter.className} style={{ backgroundColor: '#0f1117', color: '#f1f5f9', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
