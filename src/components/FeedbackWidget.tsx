'use client'

import { useState } from 'react'
import {
  BRAND, BRAND_LIGHT, BRAND_TINT, BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/theme'

type Variant = 'floating' | 'inline'

const CATEGORIES = ['检测不准 / Bug', '功能建议', 'UI / 体验', '其他'] as const

export default function FeedbackWidget({
  variant = 'floating',
  page,
  title,
}: {
  variant?: Variant
  /** 反馈上下文（如 results / analyze），随提交一并记录 */
  page?: string
  /** inline 模式下卡片标题 */
  title?: string
}) {
  const [open, setOpen] = useState(false)

  if (variant === 'inline') {
    return (
      <div
        className="no-print"
        style={{
          backgroundColor: '#ffffff',
          border: `1px solid ${BORDER}`,
          borderRadius: '14px',
          padding: '22px 24px',
        }}
      >
        <FeedbackForm page={page} heading={title || '这次的检测结果怎么样？'} />
      </div>
    )
  }

  // floating
  return (
    <div className="no-print">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="打开意见反馈"
          style={{
            position: 'fixed',
            right: '22px',
            bottom: '22px',
            zIndex: 90,
            backgroundColor: BRAND_LIGHT,
            color: '#ffffff',
            border: 'none',
            borderRadius: '999px',
            padding: '12px 18px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span aria-hidden="true">💬</span> 意见反馈
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="意见反馈"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            zIndex: 100,
            padding: '22px',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              border: `1px solid ${BORDER}`,
              borderRadius: '16px',
              padding: '22px 24px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.3)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '17px', fontWeight: 800, color: TEXT_PRIMARY }}>意见反馈</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: TEXT_MUTED,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <FeedbackForm page={page} onDone={() => setTimeout(() => setOpen(false), 1400)} />
          </div>
        </div>
      )}
    </div>
  )
}

function FeedbackForm({
  page,
  heading,
  onDone,
}: {
  page?: string
  heading?: string
  onDone?: () => void
}) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const submit = async () => {
    if (!rating && !message.trim()) {
      setError('请至少选择评分或填写一些内容')
      return
    }
    setError('')
    setStatus('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          category,
          message: message.trim(),
          contact: contact.trim(),
          page: page || (typeof window !== 'undefined' ? window.location.pathname : ''),
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || '提交失败')
      setStatus('done')
      onDone?.()
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    }
  }

  if (status === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '20px 8px' }}>
        <div style={{ fontSize: '34px', marginBottom: '8px' }} aria-hidden="true">🙏</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: TEXT_PRIMARY, marginBottom: '4px' }}>
          感谢你的反馈！
        </div>
        <div style={{ fontSize: '13px', color: TEXT_MUTED, lineHeight: 1.6 }}>
          我们会认真查看每一条意见，用于持续改进检测能力与体验。
        </div>
      </div>
    )
  }

  const sending = status === 'sending'

  return (
    <div>
      {heading && (
        <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT_PRIMARY, marginBottom: '12px' }}>
          {heading}
        </div>
      )}

      {/* 评分 */}
      <div style={{ marginBottom: '14px' }}>
        <Label>整体评分</Label>
        <div style={{ display: 'flex', gap: '4px' }} role="radiogroup" aria-label="整体评分">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || rating) >= n
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} 星`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '26px',
                  lineHeight: 1,
                  padding: '2px',
                  color: active ? '#f59e0b' : '#cbd5e1',
                  transition: 'color 0.12s',
                }}
              >
                ★
              </button>
            )
          })}
        </div>
      </div>

      {/* 分类 */}
      <div style={{ marginBottom: '14px' }}>
        <Label>反馈分类</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {CATEGORIES.map((c) => {
            const selected = category === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(selected ? '' : c)}
                style={{
                  border: `1.5px solid ${selected ? BRAND_LIGHT : BORDER}`,
                  backgroundColor: selected ? BRAND_TINT : '#ffffff',
                  color: selected ? BRAND : TEXT_SECONDARY,
                  borderRadius: '999px',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {/* 文字 */}
      <div style={{ marginBottom: '14px' }}>
        <Label>具体描述</Label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="请描述你遇到的问题、建议或期望（例如某项检测漏报/误报、希望支持的功能等）"
          rows={4}
          maxLength={4000}
          style={{
            width: '100%',
            border: `1px solid ${BORDER}`,
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '13.5px',
            color: TEXT_PRIMARY,
            lineHeight: 1.6,
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* 联系方式 */}
      <div style={{ marginBottom: '16px' }}>
        <Label>联系方式（选填）</Label>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="邮箱或微信，便于我们回访；不填也可"
          maxLength={200}
          style={{
            width: '100%',
            border: `1px solid ${BORDER}`,
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '13.5px',
            color: TEXT_PRIMARY,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {error && (
        <div style={{ color: '#b91c1c', fontSize: '12.5px', marginBottom: '10px' }}>⚠ {error}</div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={sending}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: sending ? '#93c5fd' : BRAND_LIGHT,
          color: '#ffffff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 700,
          cursor: sending ? 'not-allowed' : 'pointer',
        }}
      >
        {sending ? '提交中…' : '提交反馈'}
      </button>
      <div style={{ fontSize: '11px', color: TEXT_MUTED, marginTop: '8px', lineHeight: 1.6 }}>
        反馈仅用于产品改进。请勿在此提交涉密信息。
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '12.5px', fontWeight: 600, color: TEXT_SECONDARY, marginBottom: '7px' }}>
      {children}
    </div>
  )
}
