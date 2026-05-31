'use client'

import { useState } from 'react'
import {
  NAV_BG, BRAND, BRAND_LIGHT, BRAND_TINT, BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/theme'

interface FeedbackItem {
  ts?: string
  rating?: number
  category?: string
  message?: string
  contact?: string
  page?: string
  ua?: string
  ip?: string
}

export default function AdminFeedbackPage() {
  const [token, setToken] = useState('')
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const load = async () => {
    if (!token.trim()) {
      setError('请输入管理令牌')
      return
    }
    setError('')
    setNote('')
    setLoading(true)
    try {
      const res = await fetch(`/api/feedback?token=${encodeURIComponent(token.trim())}`)
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '读取失败')
      setItems(data.items || [])
      if (data.note) setNote(data.note)
    } catch (e) {
      setItems(null)
      setError(e instanceof Error ? e.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
      <nav style={{ backgroundColor: NAV_BG, padding: '14px 32px', color: '#e2e8f0', fontWeight: 700 }}>
        FinGuard · 反馈管理
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>用户反馈查看</h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: '13.5px', lineHeight: 1.7, marginBottom: '20px' }}>
          输入管理令牌（环境变量 <code style={{ backgroundColor: '#eef2f7', padding: '1px 5px', borderRadius: '4px' }}>FEEDBACK_ADMIN_TOKEN</code>）后查看已收集的反馈。
          反馈默认存于服务器本地 <code style={{ backgroundColor: '#eef2f7', padding: '1px 5px', borderRadius: '4px' }}>feedback.jsonl</code>；
          若部署在 serverless（如 Vercel）平台，文件不持久化，请改用 webhook 接收。
        </p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="管理令牌"
            style={{
              flex: 1,
              minWidth: '220px',
              border: `1px solid ${BORDER}`,
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '14px',
            }}
          />
          <button
            onClick={load}
            disabled={loading}
            style={{
              backgroundColor: loading ? '#93c5fd' : BRAND_LIGHT,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 22px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '加载中…' : '查看反馈'}
          </button>
        </div>

        {error && <div style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '12px' }}>⚠ {error}</div>}
        {note && <div style={{ color: TEXT_MUTED, fontSize: '13px', marginBottom: '12px' }}>{note}</div>}

        {items && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '13px', color: TEXT_MUTED, marginBottom: '12px' }}>
              共 {items.length} 条反馈（最新在前）
            </div>
            {items.length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: '14px', padding: '24px', textAlign: 'center', backgroundColor: '#fff', border: `1px solid ${BORDER}`, borderRadius: '12px' }}>
                暂无反馈
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {items.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: '#fff',
                      border: `1px solid ${BORDER}`,
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#f59e0b', fontSize: '15px' }}>
                          {it.rating ? '★'.repeat(it.rating) + '☆'.repeat(5 - it.rating) : '未评分'}
                        </span>
                        {it.category && (
                          <span style={{ backgroundColor: BRAND_TINT, color: BRAND, borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
                            {it.category}
                          </span>
                        )}
                        {it.page && <span style={{ fontSize: '12px', color: TEXT_MUTED }}>页面：{it.page}</span>}
                      </div>
                      <span style={{ fontSize: '12px', color: TEXT_MUTED }}>
                        {it.ts ? new Date(it.ts).toLocaleString('zh-CN') : ''}
                      </span>
                    </div>
                    {it.message && (
                      <div style={{ fontSize: '14px', color: TEXT_PRIMARY, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {it.message}
                      </div>
                    )}
                    {it.contact && (
                      <div style={{ fontSize: '12.5px', color: TEXT_SECONDARY, marginTop: '6px' }}>
                        联系方式：{it.contact}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
