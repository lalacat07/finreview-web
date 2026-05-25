'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function ResultsPage() {
  const [result, setResult] = useState('')
  const [fileName, setFileName] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const r = sessionStorage.getItem('analysisResult') || ''
    const f = sessionStorage.getItem('fileName') || '财务报告'
    setResult(r)
    setFileName(f)
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderResult = (text: string) => {
    return text.split('\n').map((line, i) => {
      let color = '#f1f5f9'
      if (line.includes('🔴')) color = '#fca5a5'
      else if (line.includes('🟡')) color = '#fcd34d'
      else if (line.includes('✅')) color = '#86efac'
      else if (line.startsWith('##')) color = '#93c5fd'
      return <div key={i} style={{ color, lineHeight: '1.7', minHeight: '4px' }}>{line || ' '}</div>
    })
  }

  if (!result) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f1f5f9' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
        <p style={{ color: '#94a3b8', marginBottom: '24px' }}>未找到分析结果，请重新上传报告</p>
        <Link href="/analyze" style={{ backgroundColor: '#3b82f6', color: 'white', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none' }}>重新分析</Link>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f1f5f9' }}>
      <div style={{ borderBottom: '1px solid #2d3048', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, backgroundColor: '#0f1117', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/analyze" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>← 重新分析</Link>
          <span style={{ color: '#2d3048' }}>|</span>
          <span style={{ fontSize: '14px', color: '#94a3b8' }}>{fileName}</span>
        </div>
        <button onClick={handleCopy} style={{
          backgroundColor: copied ? '#22c55e' : '#1a1d27', border: '1px solid #2d3048',
          color: copied ? 'white' : '#94a3b8', padding: '8px 16px', borderRadius: '8px',
          cursor: 'pointer', fontSize: '14px', transition: 'all 0.2s',
        }}>
          {copied ? '✓ 已复制' : '复制结果'}
        </button>
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', padding: '32px', fontFamily: 'monospace', fontSize: '14px', lineHeight: '1.8' }}>
          {renderResult(result)}
        </div>
      </div>
    </div>
  )
}
