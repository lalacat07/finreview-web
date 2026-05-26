'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type ActiveTab = '数据检查' | '财务健康度'
type SeverityFilter = 'all' | 'high' | 'medium' | 'low'

interface LegacySection {
  title: string
  content: string
  index: number
}

// ─── New-format parser ────────────────────────────────────────────────────────

function parseNewFormat(text: string): Record<string, string> {
  const keys = ['报告总览', '数据核查', '语法核查', '财务健康度']
  const result: Record<string, string> = {}
  const pattern = new RegExp(
    `## (${keys.join('|')})[\\s\\S]*?(?=\\n## (?:${keys.join('|')})|$)`,
    'g'
  )
  let m
  while ((m = pattern.exec(text)) !== null) {
    const header = m[1]
    const full = m[0]
    result[header] = full.slice(full.indexOf('\n') + 1).trim()
  }
  return result
}

function isNewFormat(text: string): boolean {
  return (
    text.includes('## 报告总览') ||
    text.includes('## 数据核查') ||
    text.includes('## 语法核查') ||
    text.includes('## 财务健康度')
  )
}

// ─── Legacy-format parser (kept for backward compat) ─────────────────────────

function parseLegacySections(text: string): LegacySection[] {
  const parts = text.split(/(?=## 第[一二三四五]部分)/)
  const sections: LegacySection[] = []
  parts.forEach((part, idx) => {
    if (!part.trim()) return
    const titleMatch = part.match(/^## (.+)/)
    if (titleMatch) {
      sections.push({ title: titleMatch[1], content: part.slice(titleMatch[0].length).trim(), index: idx })
    } else if (sections.length === 0 && part.trim()) {
      sections.push({ title: '分析结果', content: part.trim(), index: 0 })
    }
  })
  return sections
}

// ─── Overview table parser ────────────────────────────────────────────────────

function parseOverviewTable(content: string): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const SHOW = ['适用准则', '审计准则', '申报场景', '语系']
  content.split('\n').forEach(line => {
    const cells = line.split('|').map(s => s.trim()).filter(Boolean)
    if (cells.length >= 2 && !cells[0].startsWith('-') && cells[0] !== '项目') {
      if (SHOW.includes(cells[0])) rows.push({ label: cells[0], value: cells[1] })
    }
  })
  return rows
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function getSectionHeaderStyle(n: number) {
  const styles = [
    { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd', accent: '#3b82f6' },
    { bg: 'rgba(34,197,94,0.1)', color: '#86efac', accent: '#22c55e' },
    { bg: 'rgba(239,68,68,0.1)', color: '#fca5a5', accent: '#ef4444' },
    { bg: 'rgba(249,115,22,0.1)', color: '#fdba74', accent: '#f97316' },
    { bg: 'rgba(168,85,247,0.1)', color: '#d8b4fe', accent: '#a855f7' },
  ]
  return styles[n] || styles[0]
}

function detectHealthRating(text: string): { label: string; color: string; bg: string; border: string } | null {
  if (text.includes('🔴 高风险') || text.includes('高风险')) {
    const isHigh = /整体.*?🔴|🔴.*?高风险/.test(text)
    if (isHigh) return { label: '高风险', color: '#fca5a5', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)' }
  }
  if (text.includes('🟡 中等风险') || /整体.*?🟡/.test(text))
    return { label: '中等风险', color: '#fcd34d', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)' }
  if (text.includes('✅ 低风险') || /整体.*?✅/.test(text))
    return { label: '低风险', color: '#86efac', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.4)' }
  return null
}

function isAllPass(content: string): boolean {
  return content.includes('✅') && (
    content.includes('全部通过') || content.includes('未发现') || content.includes('无语言问题') || content.includes('无问题')
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OverviewCards({ content }: { content: string }) {
  const fields = parseOverviewTable(content)
  if (fields.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
      {fields.map(f => (
        <div key={f.label} style={{
          backgroundColor: '#1a1d27',
          border: '1px solid #2d3048',
          borderRadius: '10px',
          padding: '14px 18px',
          minWidth: '150px',
          flex: '1',
        }}>
          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{f.label}</div>
          <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600 }}>{f.value}</div>
        </div>
      ))}
    </div>
  )
}

function CheckSubModule({ title, content, icon }: { title: string; content: string; icon: string }) {
  const pass = isAllPass(content)
  return (
    <div style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #2d3048', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>{title}</span>
        {pass && (
          <span style={{
            marginLeft: 'auto',
            backgroundColor: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.3)',
            color: '#86efac',
            fontSize: '12px',
            fontWeight: 700,
            padding: '2px 10px',
            borderRadius: '5px',
          }}>
            ✓ 全部通过
          </span>
        )}
      </div>
      <div style={{ padding: '16px 20px' }}>
        {content
          ? <MarkdownRenderer text={content} />
          : <p style={{ color: '#4b5563', fontSize: '13px', margin: 0 }}>暂无数据</p>}
      </div>
    </div>
  )
}

function ComingSoonModule() {
  return (
    <div style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', overflow: 'hidden', opacity: 0.55 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #2d3048', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>📋</span>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#94a3b8' }}>披露合规性检查</span>
        <span style={{
          marginLeft: 'auto',
          backgroundColor: 'rgba(148,163,184,0.1)',
          border: '1px solid rgba(148,163,184,0.2)',
          color: '#64748b',
          fontSize: '12px',
          fontWeight: 700,
          padding: '2px 10px',
          borderRadius: '5px',
        }}>
          即将上线
        </span>
      </div>
      <div style={{ padding: '24px 20px', textAlign: 'center' }}>
        <p style={{ color: '#4b5563', fontSize: '13px', margin: 0 }}>披露合规性检查功能正在开发中，即将上线</p>
      </div>
    </div>
  )
}

function HealthSection({ content }: { content: string }) {
  const rating = detectHealthRating(content)
  return (
    <div style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #2d3048', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>📊</span>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>财务健康度分析</span>
        {rating && (
          <span style={{
            marginLeft: 'auto',
            backgroundColor: rating.bg,
            border: `1px solid ${rating.border}`,
            color: rating.color,
            fontSize: '13px',
            fontWeight: 700,
            padding: '3px 12px',
            borderRadius: '6px',
          }}>
            {rating.label}
          </span>
        )}
      </div>
      <div style={{ padding: '20px' }}>
        {content
          ? <MarkdownRenderer text={content} />
          : <p style={{ color: '#4b5563', fontSize: '13px', margin: 0 }}>暂无财务分析数据，请选择包含"财务健康度"的分析模式</p>}
      </div>
    </div>
  )
}

// ─── Main view components ─────────────────────────────────────────────────────

function NewStructuredView({ sections }: { sections: Record<string, string> }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('数据检查')
  const overview = sections['报告总览'] || ''
  const dataCheck = sections['数据核查'] || ''
  const langCheck = sections['语法核查'] || ''
  const health = sections['财务健康度'] || ''

  const tabs: ActiveTab[] = ['数据检查', '财务健康度']

  return (
    <div>
      {/* Layer 1: 报告总览 */}
      {overview && <OverviewCards content={overview} />}

      {/* Layer 2: Tab switcher */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid #2d3048' }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 24px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              backgroundColor: 'transparent',
              color: activeTab === tab ? '#e2e8f0' : '#64748b',
              borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'all 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Layer 3a: 数据检查 */}
      {activeTab === '数据检查' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <CheckSubModule title="数据核查" content={dataCheck} icon="🔢" />
          <CheckSubModule title="语法核查" content={langCheck} icon="📝" />
          <ComingSoonModule />
        </div>
      )}

      {/* Layer 3b: 财务健康度 */}
      {activeTab === '财务健康度' && <HealthSection content={health} />}
    </div>
  )
}

function LegacyStructuredView({
  sections,
  severityFilter,
  setSeverityFilter,
}: {
  sections: LegacySection[]
  severityFilter: SeverityFilter
  setSeverityFilter: (f: SeverityFilter) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {sections.map((section, idx) => {
        const style = getSectionHeaderStyle(idx)
        const isSection3 = section.title.includes('第三部分') || section.title.includes('明显问题')

        return (
          <div key={section.index} style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: style.bg, borderBottom: `1px solid ${style.accent}33`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ display: 'inline-block', width: '3px', height: '18px', backgroundColor: style.accent, borderRadius: '2px', flexShrink: 0 }} />
                <span style={{ color: style.color, fontWeight: 700, fontSize: '15px' }}>{section.title}</span>
              </div>
              {isSection3 && (
                <SeverityFilterButtons filter={severityFilter} setFilter={setSeverityFilter} />
              )}
            </div>
            <div style={{ padding: '20px' }}>
              {isSection3 ? (
                <FilteredLegacySection content={section.content} filter={severityFilter} />
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

function FilteredLegacySection({ content, filter }: { content: string; filter: SeverityFilter }) {
  const lines = content.split('\n').filter(line => {
    if (filter === 'all') return true
    if (filter === 'high') return line.includes('🔴') || !line.match(/[🔴🟡⚪]/)
    if (filter === 'medium') return line.includes('🟡') || !line.match(/[🔴🟡⚪]/)
    if (filter === 'low') return line.includes('⚪') || !line.match(/[🔴🟡⚪]/)
    return true
  })
  return <MarkdownRenderer text={lines.join('\n')} />
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownRenderer({ text }: { text: string }) {
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

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  const newFormat = isNewFormat(result)
  const newSections = newFormat ? parseNewFormat(result) : {}
  const legacySections = !newFormat ? parseLegacySections(result) : []

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f1f5f9' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

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
        {newFormat ? (
          <NewStructuredView sections={newSections} />
        ) : legacySections.some(s => s.title.includes('部分')) ? (
          <LegacyStructuredView sections={legacySections} severityFilter={severityFilter} setSeverityFilter={setSeverityFilter} />
        ) : (
          <MarkdownRenderer text={result} />
        )}
      </div>
    </div>
  )
}
