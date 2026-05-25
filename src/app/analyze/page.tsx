'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Mode = 'review' | 'analysis' | 'both'

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('both')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf') { setError('请上传PDF文件'); return }
    if (f.size > 50 * 1024 * 1024) { setError('文件不超过50MB'); return }
    setError('')
    setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true); setError('')
    try {
      setProgress('正在解析PDF文档...')
      const formData = new FormData()
      formData.append('file', file)
      const extractRes = await fetch('/api/extract', { method: 'POST', body: formData })
      if (!extractRes.ok) throw new Error('PDF解析失败')
      const { text, pageCount, truncated } = await extractRes.json()

      setProgress(`已提取${pageCount}页文本${truncated ? '（已截取前8万字符）' : ''}，正在进行AI分析...`)

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode }),
      })
      if (!analyzeRes.ok) throw new Error('分析失败')

      setProgress('正在生成分析报告...')
      const reader = analyzeRes.body!.getReader()
      const decoder = new TextDecoder()
      let result = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        result += decoder.decode(value)
      }

      sessionStorage.setItem('analysisResult', result)
      sessionStorage.setItem('analysisMode', mode)
      sessionStorage.setItem('fileName', file.name)
      router.push('/results')
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析过程中出现错误，请重试')
      setLoading(false)
    }
  }

  const modes = [
    { value: 'review' as Mode, icon: '🔍', label: '穿透式复核', desc: '合规检查 · 数字勾稽 · 格式审查' },
    { value: 'analysis' as Mode, icon: '📊', label: '财务分析', desc: '财务比率 · 风险信号 · 舞弊指标' },
    { value: 'both' as Mode, icon: '🛡️', label: '完整分析', desc: '以上全部', badge: '推荐' },
  ]

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
            textAlign: 'center', cursor: 'pointer', marginBottom: '24px',
            transition: 'border-color 0.2s',
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
                  <span style={{
                    position: 'absolute', top: '8px', right: '8px', backgroundColor: '#3b82f6',
                    color: 'white', fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                  }}>{m.badge}</span>
                )}
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{m.icon}</div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{m.label}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px' }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#ef4444' }}>{error}</div>}

        <button onClick={handleAnalyze} disabled={!file || loading} style={{
          width: '100%', padding: '16px', backgroundColor: file && !loading ? '#3b82f6' : '#2d3048',
          color: file && !loading ? 'white' : '#6b7280', border: 'none', borderRadius: '10px',
          fontSize: '16px', fontWeight: 600, cursor: file && !loading ? 'pointer' : 'not-allowed',
          transition: 'background-color 0.2s',
        }}>
          {loading ? progress || '分析中...' : '开始分析'}
        </button>
      </div>
    </div>
  )
}
