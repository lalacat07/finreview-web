'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'

type Mode = 'review' | 'analysis' | 'both'
type Stage = 'upload' | 'streaming' | 'done'
type Standard = 'IFRS / HKFRS' | 'CAS 中国会计准则' | 'US GAAP'

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('both')
  const [standard, setStandard] = useState<Standard>('IFRS / HKFRS')
  const [stage, setStage] = useState<Stage>('upload')
  const [progress, setProgress] = useState('')
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf') { setError('请上传PDF文件'); return }
    if (f.size > 50 * 1024 * 1024) { setError('文件不超过50MB'); return }
    setError(''); setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleAnalyzeClick = () => {
    if (!file) return
    setShowModal(true)
  }

  const handleConfirm = async () => {
    setShowModal(false)
    if (!file) return
    setError(''); setStreamedText(''); setStage('streaming')
    try {
      setProgress('正在解析PDF文档...')
      const formData = new FormData()
      formData.append('file', file)
      const extractRes = await fetch('/api/extract', { method: 'POST', body: formData })
      if (!extractRes.ok) {
        const body = await extractRes.json().catch(() => ({}))
        throw new Error(body.error || 'PDF解析失败')
      }
      const { text, pageCount, truncated } = await extractRes.json()

      setProgress(`已提取 ${pageCount} 页${truncated ? '（已截取前8万字符）' : ''}，AI 分析中...`)

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode, standard }),
      })
      if (!analyzeRes.ok) throw new Error('分析请求失败')

      const reader = analyzeRes.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      setProgress('')
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        full += chunk
        setStreamedText(full)
        setTimeout(() => resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight, behavior: 'smooth' }), 0)
      }
      sessionStorage.setItem('analysisResult', full)
      sessionStorage.setItem('analysisMode', mode)
      sessionStorage.setItem('fileName', file.name)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析过程中出现错误，请重试')
      setStage('upload')
    }
  }

  const handleReset = () => {
    setStage('upload'); setStreamedText(''); setFile(null); setError('')
  }

  const standards: { value: Standard; label: string; desc: string }[] = [
    { value: 'IFRS / HKFRS', label: 'IFRS / HKFRS', desc: '适用香港上市、国际准则报告' },
    { value: 'CAS 中国会计准则', label: 'CAS 中国会计准则', desc: '适用A股、中国内地企业报告' },
    { value: 'US GAAP', label: 'US GAAP', desc: '适用美股上市、美国准则报告' },
  ]

  const modes = [
    { value: 'review' as Mode, icon: '🔍', label: '穿透式复核', desc: '合规检查 · 数字勾稽 · 格式审查 · 附注核验' },
    { value: 'analysis' as Mode, icon: '📊', label: '财务分析', desc: '财务比率 · Beneish舞弊模型 · CAS专项风险' },
    { value: 'both' as Mode, icon: '🛡️', label: '完整分析', desc: '以上全部', badge: '推荐' },
  ]

  // ── STREAMING / DONE VIEW ──────────────────────────────────────────
  if (stage === 'streaming' || stage === 'done') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        `}</style>

        {/* Sticky header */}
        <div className="no-print" style={{ borderBottom: '1px solid #2d3048', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, backgroundColor: '#0f1117', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontWeight: 700, color: '#3b82f6' }}>财报穿透</span>
            <span style={{ color: '#4b5563', fontSize: '13px' }}>|</span>
            <span style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {stage === 'streaming' && (
              <span style={{ fontSize: '13px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', animation: 'pulse 1s infinite' }} />
                AI 分析中
              </span>
            )}
            {stage === 'done' && (
              <>
                <button
                  onClick={() => navigator.clipboard.writeText(streamedText)}
                  style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', color: '#94a3b8', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}
                >
                  复制结果
                </button>
                <button
                  onClick={() => window.print()}
                  style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', color: '#94a3b8', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}
                >
                  导出 PDF
                </button>
              </>
            )}
            <button onClick={handleReset} style={{ backgroundColor: 'transparent', border: '1px solid #2d3048', color: '#64748b', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>
              重新上传
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {progress && (
          <div style={{ backgroundColor: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(59,130,246,0.2)', padding: '10px 24px', fontSize: '13px', color: '#93c5fd' }}>
            ⏳ {progress}
          </div>
        )}

        {/* Streaming output */}
        <div
          ref={resultRef}
          style={{ flex: 1, overflowY: 'auto', padding: '28px 24px', maxWidth: '960px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}
        >
          {streamedText ? (
            <MarkdownRenderer text={streamedText} streaming={stage === 'streaming'} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#64748b', padding: '48px 0' }}>
              <LoadingDots />
              <span>{progress || '正在初始化...'}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── UPLOAD VIEW ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f1f5f9', padding: '24px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>← 返回首页</Link>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginTop: '24px', marginBottom: '8px' }}>上传财务报告</h1>
        <p style={{ color: '#94a3b8', marginBottom: '32px' }}>支持 PDF 格式，最大 50MB</p>

        {/* Upload Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          style={{
            border: `2px dashed ${dragOver ? '#3b82f6' : file ? '#22c55e' : '#2d3048'}`,
            borderRadius: '12px', backgroundColor: '#1a1d27', padding: '48px',
            textAlign: 'center', cursor: 'pointer', marginBottom: '8px', transition: 'border-color 0.2s',
          }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <div>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontWeight: 600, color: '#22c55e' }}>{file.name}</div>
              <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>拖拽 PDF 至此，或点击选择文件</div>
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>支持中英文财务报告 · 最大 50MB</div>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <p style={{ color: '#4b5563', fontSize: '12px', marginBottom: '28px', lineHeight: 1.6 }}>
          建议上传已公开发布的财务报告。如需上传内部草稿，请先进行脱敏处理（删除公司名称、替换敏感数字）。
        </p>

        {/* Standards Selector — only show after file selected */}
        {file && (
          <div style={{ marginBottom: '28px' }}>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '12px' }}>选择报告准则</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {standards.map((s) => (
                <div key={s.value} onClick={() => setStandard(s.value)} style={{
                  border: `2px solid ${standard === s.value ? '#3b82f6' : '#2d3048'}`,
                  borderRadius: '10px', backgroundColor: standard === s.value ? 'rgba(59,130,246,0.1)' : '#1a1d27',
                  padding: '14px', cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{s.label}</div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mode Selector */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '12px' }}>选择分析模式</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {modes.map((m) => (
              <div key={m.value} onClick={() => setMode(m.value)} style={{
                border: `2px solid ${mode === m.value ? '#3b82f6' : '#2d3048'}`,
                borderRadius: '10px', backgroundColor: mode === m.value ? 'rgba(59,130,246,0.1)' : '#1a1d27',
                padding: '16px', cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
              }}>
                {m.badge && (
                  <span style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: '#3b82f6', color: 'white', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>{m.badge}</span>
                )}
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{m.icon}</div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{m.label}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px' }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <button onClick={handleAnalyzeClick} disabled={!file} style={{
          width: '100%', padding: '16px', backgroundColor: file ? '#3b82f6' : '#2d3048',
          color: file ? 'white' : '#6b7280', border: 'none', borderRadius: '10px',
          fontSize: '16px', fontWeight: 600, cursor: file ? 'pointer' : 'not-allowed', transition: 'background-color 0.2s',
        }}>
          开始分析
        </button>

        {/* Privacy notice */}
        <p style={{ color: '#4b5563', fontSize: '12px', textAlign: 'center', marginTop: '12px' }}>
          文件仅用于本次分析，不做存储或训练，分析完成后自动删除
        </p>
      </div>

      {/* Confirmation Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '14px',
            padding: '32px', maxWidth: '440px', width: '90%',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '16px', textAlign: 'center' }}>🔒</div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '16px', color: '#f1f5f9', textAlign: 'center' }}>
              上传确认
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.7, marginBottom: '28px' }}>
              请确认您有权上传此文件，且已了解本平台仅用于分析本次内容，不做任何存储、传输或模型训练用途。
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, padding: '12px', backgroundColor: 'transparent',
                  border: '1px solid #2d3048', color: '#94a3b8', borderRadius: '8px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 2, padding: '12px', backgroundColor: '#3b82f6',
                  border: 'none', color: 'white', borderRadius: '8px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                }}
              >
                确认，开始分析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Markdown Renderer ─────────────────────────────────────────────────────────
function MarkdownRenderer({ text, streaming }: { text: string; streaming: boolean }) {
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

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {elements}
      {streaming && (
        <span style={{ display: 'inline-block', width: '2px', height: '15px', backgroundColor: '#3b82f6', marginLeft: '2px', verticalAlign: 'middle', animation: 'blink 1s infinite' }} />
      )}
    </div>
  )
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

function LoadingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: '4px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6', animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
      ))}
    </span>
  )
}
