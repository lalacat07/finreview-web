'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type SeverityFilter = 'all' | 'high' | 'medium' | 'low'

interface Section {
  title: string
  content: string
  index: number
}

function parseSections(text: string): Section[] {
  const sectionPattern = /(?=## 第[一二三四五]部分)/g
  const parts = text.split(sectionPattern)
  const sections: Section[] = []

  parts.forEach((part, idx) => {
    if (!part.trim()) return
    const titleMatch = part.match(/^## (.+)/)
    if (titleMatch) {
      sections.push({
        title: titleMatch[1],
        content: part.slice(titleMatch[0].length).trim(),
        index: idx,
      })
    } else if (sections.length === 0 && part.trim()) {
      sections.push({ title: '分析结果', content: part.trim(), index: 0 })
    }
  })

  return sections
}

function detectRating(text: string): { label: string; color: string; bg: string; border: string } | null {
  if (text.includes('不建议递交')) return { label: '不建议递交', color: '#fca5a5', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)' }
  if (text.includes('建议修改后')) return { label: '建议修改后递交', color: '#fcd34d', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)' }
  if (text.includes('可递交')) return { label: '可递交', color: '#86efac', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.4)' }
  return null
}

function getSectionHeaderStyle(sectionNum: number): { bg: string; color: string; accent: string } {
  const styles = [
    { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd', accent: '#3b82f6' },
    { bg: 'rgba(34,197,94,0.1)', color: '#86efac', accent: '#22c55e' },
    { bg: 'rgba(239,68,68,0.1)', color: '#fca5a5', accent: '#ef4444' },
    { bg: 'rgba(249,115,22,0.1)', color: '#fdba74', accent: '#f97316' },
    { bg: 'rgba(168,85,247,0.1)', color: '#d8b4fe', accent: '#a855f7' },
  ]
  return styles[sectionNum] || styles[0]
}

export default function ResultsPage() {
  const [result, setResult] = useState('')
  const [fileName, setFileName] = useState('')
  const [copied, setCopied] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')

  useEffect(() => {
    setResult(sessionStorage.getItem('analysisResult') || '')
    setFileName(sessionStorage.getItem('fileName') || '财务报告')
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  const sections = parseSections(result)
  const hasSections = sections.some(s => s.title.includes('部分'))

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f1f5f9' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{ borderBottom: '1px solid #2d3048', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, backgroundColor: '#0f1117', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/analyze" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>← 重新分析</Link>
          <span style={{ color: '#2d3048' }}>|</span>
          <span style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleCopy} style={{
            backgroundColor: copied ? '#22c55e' : '#1a1d27', border: '1px solid #2d3048',
            color: copied ? 'white' : '#94a3b8', padding: '7px 16px', borderRadius: '7px',
            cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s',
          }}>
            {copied ? '✓ 已复制' : '复制结果'}
          </button>
          <button onClick={() => window.print()} style={{
            backgroundColor: '#1a1d27', border: '1px solid #2d3048',
            color: '#94a3b8', padding: '7px 16px', borderRadius: '7px',
            cursor: 'pointer', fontSize: '13px',
          }}>
            导出 PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        {hasSections ? (
          <StructuredView sections={sections} severityFilter={severityFilter} setSeverityFilter={setSeverityFilter} />
        ) : (
          <MarkdownRenderer text={result} />
        )}
      </div>
    </div>
  )
}

function StructuredView({
  sections,
  severityFilter,
  setSeverityFilter,
}: {
  sections: Section[]
  severityFilter: SeverityFilter
  setSeverityFilter: (f: SeverityFilter) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {sections.map((section, idx) => {
        const sectionNum = idx
        const style = getSectionHeaderStyle(sectionNum)
        const isSection3 = section.title.includes('第三部分') || section.title.includes('明显问题')
        const isSection5 = section.title.includes('第五部分') || section.title.includes('质量控制')
        const rating = isSection5 ? detectRating(section.content) : null

        return (
          <div key={section.index} style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Section header */}
            <div style={{ backgroundColor: style.bg, borderBottom: `1px solid ${style.accent}33`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ display: 'inline-block', width: '3px', height: '18px', backgroundColor: style.accent, borderRadius: '2px', flexShrink: 0 }} />
                <span style={{ color: style.color, fontWeight: 700, fontSize: '15px' }}>{section.title}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {rating && (
                  <span style={{ backgroundColor: rating.bg, border: `1px solid ${rating.border}`, color: rating.color, fontSize: '13px', fontWeight: 700, padding: '3px 12px', borderRadius: '6px' }}>
                    {rating.label}
                  </span>
                )}
                {isSection3 && (
                  <SeverityFilterButtons filter={severityFilter} setFilter={setSeverityFilter} />
                )}
              </div>
            </div>

            {/* Section content */}
            <div style={{ padding: '20px' }}>
              {isSection3 ? (
                <FilteredSection3 content={section.content} filter={severityFilter} />
              ) : (
                <MarkdownRenderer text={section.content} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SeverityFilterButtons({ filter, setFilter }: { filter: SeverityFilter; setFilter: (f: SeverityFilter) => void }) {
  const buttons: { value: SeverityFilter; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'high', label: '🔴 高风险' },
    { value: 'medium', label: '🟡 中风险' },
    { value: 'low', label: '⚪ 低风险' },
  ]
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {buttons.map(b => (
        <button key={b.value} onClick={() => setFilter(b.value)} style={{
          padding: '3px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', border: 'none',
          backgroundColor: filter === b.value ? '#3b82f6' : '#2d3048',
          color: filter === b.value ? 'white' : '#94a3b8',
          transition: 'all 0.15s',
        }}>
          {b.label}
        </button>
      ))}
    </div>
  )
}

function FilteredSection3({ content, filter }: { content: string; filter: SeverityFilter }) {
  const lines = content.split('\n')
  const filteredLines = lines.filter(line => {
    if (filter === 'all') return true
    if (filter === 'high') return line.includes('🔴') || !line.match(/[🔴🟡⚪]/)
    if (filter === 'medium') return line.includes('🟡') || !line.match(/[🔴🟡⚪]/)
    if (filter === 'low') return line.includes('⚪') || !line.match(/[🔴🟡⚪]/)
    return true
  })
  return <MarkdownRenderer text={filteredLines.join('\n')} />
}

function MarkdownRenderer({ text }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  lines.forEach((line, i) => {
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} style={{ fontSize: '20px', fontWeight: 800, color: '#e2e8f0', marginTop: '32px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #2d3048' }}>
          {line.slice(2)}
        </h1>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} style={{ fontSize: '16px', fontWeight: 700, color: '#93c5fd', marginTop: '28px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-block', width: '3px', height: '16px', backgroundColor: '#3b82f6', borderRadius: '2px', flexShrink: 0 }} />
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', marginTop: '16px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {line.slice(4)}
        </h3>
      )
    } else if (line.match(/^\|/)) {
      elements.push(
        <p key={i} style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6, margin: '1px 0', fontFamily: 'monospace' }}>
          {line}
        </p>
      )
    } else if (line.match(/^-{3,}$/) || line.match(/^={3,}$/)) {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #2d3048', margin: '16px 0' }} />)
    } else if (line.includes('🔴')) {
      elements.push(<RiskLine key={i} line={line} color="#fca5a5" bg="rgba(239,68,68,0.08)" border="rgba(239,68,68,0.3)" />)
    } else if (line.includes('🟡')) {
      elements.push(<RiskLine key={i} line={line} color="#fcd34d" bg="rgba(245,158,11,0.08)" border="rgba(245,158,11,0.3)" />)
    } else if (line.includes('✅')) {
      elements.push(<RiskLine key={i} line={line} color="#86efac" bg="rgba(34,197,94,0.07)" border="rgba(34,197,94,0.25)" />)
    } else if (line.includes('⚪')) {
      elements.push(<RiskLine key={i} line={line} color="#94a3b8" bg="rgba(148,163,184,0.06)" border="rgba(148,163,184,0.2)" />)
    } else if (line.match(/^[-*•]\s/)) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', padding: '2px 0', color: '#cbd5e1', fontSize: '14px', lineHeight: 1.7 }}>
          <span style={{ color: '#3b82f6', flexShrink: 0, marginTop: '1px' }}>›</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '6px' }} />)
    } else {
      elements.push(
        <p key={i} style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: 1.75, margin: '2px 0' }}>
          {renderInline(line)}
        </p>
      )
    }
  })

  return <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{elements}</div>
}

function RiskLine({ line, color, bg, border }: { line: string; color: string; bg: string; border: string }) {
  return (
    <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: '6px', padding: '9px 13px', margin: '5px 0', fontSize: '13px', lineHeight: 1.7, color }}>
      {renderInline(line)}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}
