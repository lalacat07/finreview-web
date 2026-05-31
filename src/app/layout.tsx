import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import FeedbackWidget from '@/components/FeedbackWidget'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FinGuard | AI 财务报告审阅与风险提示平台',
  description:
    '上传财务报告后，系统自动进行数据一致性复核、披露完整性检查及财务风险识别，辅助企业提升报告编制质量。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body
        className={inter.className}
        style={{ backgroundColor: '#f6f8fb', color: '#0f172a', minHeight: '100vh' }}
      >
        {children}
        <FeedbackWidget variant="floating" />
      </body>
    </html>
  )
}
