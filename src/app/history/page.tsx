'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { listReports, deleteReport, type HistoryRecord } from '@/lib/history'
import {
  BRAND, BRAND_LIGHT, BRAND_TINT, BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/theme'

const MODE_LABEL: Record<string, string> = {
  both: '完整分析',
  review: '数据复核',
  analysis: '健康度分析',
}

export default function HistoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<HistoryRecord[] | null>(null)
  const [batchSummary, setBatchSummary] = useState<string[] | null>(null)

  const refresh = () => {
    listReports().then(setItems)
  }
  useEffect(() => {
    refresh()
    try {
      const raw = sessionStorage.getItem('batchSummary')
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBatchSummary(JSON.parse(raw))
        sessionStorage.removeItem('batchSummary')
      }
    } catch {}
  }, [])

  const open = (rec: HistoryRecord) => {
    try {
      sessionStorage.setItem('analysisResult', rec.result)
      sessionStorage.setItem('analysisFigures', rec.figures || '')
      sessionStorage.setItem('analysisSourceText', rec.sourceText || '')
      sessionStorage.setItem('analysisMode', rec.mode || 'both')
      sessionStorage.setItem('fileName', rec.fileName || '财务报告')
      sessionStorage.setItem('analysisStandard', rec.standard || '')
      sessionStorage.setItem('analysisScope', JSON.stringify(rec.scope || {}))
      sessionStorage.setItem('analysisId', rec.id)
      sessionStorage.setItem('analysisTs', String(rec.ts))
    } catch {}
    router.push('/results')
  }

  const remove = async (id: string) => {
    await deleteReport(id)
    refresh()
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
      <TopNav active="history" />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>历史报告</h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: '13.5px', lineHeight: 1.7, marginBottom: '20px' }}>
          历次复核结果保存在<strong>本浏览器本地</strong>（IndexedDB，不上传服务器）。清除浏览器数据会一并删除；换设备 / 浏览器不可见。
        </p>

        {batchSummary && (
          <div
            style={{
              backgroundColor: BRAND_TINT,
              border: `1px solid ${BORDER}`,
              borderRadius: '12px',
              padding: '14px 18px',
              marginBottom: '16px',
              fontSize: '13px',
              color: TEXT_SECONDARY,
              lineHeight: 1.8,
            }}
          >
            <div style={{ fontWeight: 700, color: BRAND, marginBottom: '4px' }}>批量处理完成</div>
            {batchSummary.map((s, i) => (
              <div key={i}>· {s}</div>
            ))}
          </div>
        )}

        {items === null && (
          <div style={{ color: TEXT_MUTED, fontSize: '14px', padding: '40px', textAlign: 'center' }}>加载中…</div>
        )}

        {items !== null && items.length === 0 && (
          <div
            style={{
              backgroundColor: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: '12px',
              padding: '40px',
              textAlign: 'center',
              color: TEXT_MUTED,
              fontSize: '14px',
            }}
          >
            还没有历史报告。
            <Link href="/analyze" style={{ color: BRAND_LIGHT, fontWeight: 600, marginLeft: '6px', textDecoration: 'none' }}>
              去上传一份 →
            </Link>
          </div>
        )}

        {items && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  backgroundColor: '#fff',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '12px',
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT_PRIMARY, marginBottom: '4px', wordBreak: 'break-all' }}>
                    {it.fileName}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ backgroundColor: BRAND_TINT, color: BRAND, borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
                      {MODE_LABEL[it.mode] || it.mode}
                    </span>
                    {it.standard && <span style={{ fontSize: '12px', color: TEXT_MUTED }}>{it.standard}</span>}
                    <span style={{ fontSize: '12px', color: TEXT_MUTED }}>{new Date(it.ts).toLocaleString('zh-CN')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => open(it)}
                    style={{
                      backgroundColor: BRAND_LIGHT,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    查看
                  </button>
                  <button
                    onClick={() => remove(it.id)}
                    aria-label="删除该报告"
                    style={{
                      backgroundColor: '#fff',
                      color: TEXT_MUTED,
                      border: `1px solid ${BORDER}`,
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
