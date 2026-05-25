import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '财报穿透 FinReview | 专业财务报告审查平台',
  description: '基于四大事务所审计标准的财务报告穿透式复核与风险识别平台',
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
