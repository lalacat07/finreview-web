'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import {
  BRAND, BRAND_LIGHT, BRAND_TINT, BRAND_STRONG,
  BORDER, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/theme'

type Mode = 'review' | 'analysis' | 'both'
type Stage = 'upload' | 'streaming' | 'done'
type Standard = '' | 'CAS 中国企业会计准则' | 'IFRS / HKFRS' | 'US GAAP'

/* ───────────────────────────────────────────────────────────────
 * 解析阶段定义（用户可视化感受系统在做什么）
 * ──────────────────────────────────────────────────────────────*/

const STAGES = [
  { key: 'upload', label: '上传并读取文档', desc: '校验文件并加载到处理引擎' },
  { key: 'structure', label: '识别报告结构', desc: '识别报告类型、期间、适用准则、审计师' },
  { key: 'extract', label: '提取财务报表及附注数据', desc: '解析主表、附注、关键指标' },
  { key: 'crosscheck', label: '检查报表勾稽关系', desc: '主表平衡 / 跨表勾稽 / 附注一致性' },
  { key: 'risk', label: '分析披露完整性与风险点', desc: '披露口径、异常波动、经营质量信号' },
  { key: 'compose', label: '生成检查结果', desc: '整理结构化复核与健康度分析' },
] as const

type StageKey = (typeof STAGES)[number]['key']

export default function AnalyzePage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('both')
  const [standard, setStandard] = useState<Standard>('') // 默认空 = 让系统自动识别
  const [showStandard, setShowStandard] = useState(false) // 高级：手动覆盖
  const [stage, setStage] = useState<Stage>('upload')
  const [currentStage, setCurrentStage] = useState<StageKey>('upload')
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const elapsedTimer = useRef<NodeJS.Timeout | null>(null)

  /* ─ 计时器 ─ */
  useEffect(() => {
    if (stage === 'streaming') {
      const start = Date.now()
      elapsedTimer.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }, 500)
      return () => {
        if (elapsedTimer.current) clearInterval(elapsedTimer.current)
      }
    }
  }, [stage])

  /* ─ 文件处理 ─ */
  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf') {
      setError('当前仅支持 PDF 格式财务报告')
      return
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('文件超出 50MB 限制，请压缩或拆分后再上传')
      return
    }
    setError('')
    setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleAnalyzeClick = () => {
    if (!file) return
    setShowModal(true)
  }

  const handleConfirm = async () => {
    setShowModal(false)
    if (!file) return
    setError('')
    setStreamedText('')
    setStage('streaming')
    setCurrentStage('upload')

    try {
      // 阶段 1：上传并读取
      setCurrentStage('upload')
      const formData = new FormData()
      formData.append('file', file)
      const extractRes = await fetch('/api/extract', { method: 'POST', body: formData })
      if (!extractRes.ok) {
        const body = await extractRes.json().catch(() => ({}))
        throw new Error(body.error || 'PDF 解析失败')
      }
      const { text, pageCount, charCount, truncated, lowText } = await extractRes.json()

      // 图片型/扫描型 PDF：抽不到正文，继续分析只会得到"未发现问题"的假阴性，需中止并提示
      if (lowText) {
        throw new Error(
          '未能从该 PDF 提取到足够的文本内容（疑似扫描件/图片版报告）。系统当前依赖可复制文本进行检查，无法识别图片中的内容，继续分析可能产生"未发现问题"的误导性结果。请改用带可复制文本的 PDF（如交易所/公司官网发布的电子版），或先对扫描件做 OCR 处理后再上传。'
        )
      }

      // 并行启动确定性指标重算（取数→后端确定性计算），不阻塞主流式分析
      const figuresPromise = fetch('/api/figures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)

      // 阶段 2：识别结构（短暂展示）
      setCurrentStage('structure')
      await sleep(450)

      // 阶段 3：提取数据
      setCurrentStage('extract')
      await sleep(450)

      // 启动流式分析
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode, standard }),
      })
      if (!analyzeRes.ok) throw new Error('分析请求失败')

      // 阶段 4–6 随流式输出推进
      setCurrentStage('crosscheck')

      const reader = analyzeRes.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      let advanced5 = false
      let advanced6 = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        full += chunk
        setStreamedText(full)

        // 阶段推进：根据已生成内容粗略推断
        if (!advanced5 && (full.includes('财务数据复核') || full.length > 1200)) {
          setCurrentStage('risk')
          advanced5 = true
        }
        if (!advanced6 && (full.includes('财务健康度分析') || full.length > 3000)) {
          setCurrentStage('compose')
          advanced6 = true
        }
      }

      sessionStorage.setItem('analysisResult', full)
      // 保存原文文本以支持"原文定位"（限长以规避 sessionStorage 配额）
      try {
        sessionStorage.setItem('analysisSourceText', String(text).slice(0, 200000))
      } catch {
        try { sessionStorage.removeItem('analysisSourceText') } catch {}
      }
      sessionStorage.setItem('analysisMode', mode)
      sessionStorage.setItem('fileName', file.name)
      sessionStorage.setItem('analysisStandard', standard)
      sessionStorage.setItem(
        'analysisScope',
        JSON.stringify({
          pageCount: pageCount ?? null,
          charCount: charCount ?? null,
          truncated: !!truncated,
        })
      )
      // 等待确定性指标重算结果（最多不额外阻塞太久——流式分析通常更慢）
      try {
        const figuresData = await figuresPromise
        sessionStorage.setItem('analysisFigures', figuresData ? JSON.stringify(figuresData) : '')
      } catch {
        sessionStorage.setItem('analysisFigures', '')
      }
      setStage('done')
      // 直接跳转到结果页（产品化体验）
      router.push('/results')
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析过程中出现错误，请重试')
      setStage('upload')
    }
  }

  const handleReset = () => {
    setStage('upload')
    setStreamedText('')
    setFile(null)
    setError('')
    setElapsed(0)
  }

  const standards: { value: Standard; label: string; desc: string }[] = [
    { value: 'CAS 中国企业会计准则', label: 'CAS 中国企业会计准则', desc: '适用 A 股、中国内地企业报告' },
    { value: 'IFRS / HKFRS', label: 'IFRS / HKFRS', desc: '适用香港上市、国际准则报告' },
    { value: 'US GAAP', label: 'US GAAP', desc: '适用美股上市、美国准则报告' },
  ]

  const modes = [
    { value: 'review' as Mode, icon: '🔢', label: '数据复核', desc: '报表勾稽 · 附注一致性 · 披露自查' },
    { value: 'analysis' as Mode, icon: '📊', label: '健康度分析', desc: '盈利 · 偿债 · 现金流 · 风险信号' },
    { value: 'both' as Mode, icon: '🛡️', label: '完整分析', desc: '数据复核 + 健康度分析', badge: '推荐' },
  ]

  /* ───────────────────────────────────────────────────────────────
   *  STREAMING 视图 — 产品化解析过程页
   *  采用阶段进度 + 当前任务卡片 + 扫描动画，让用户清晰感受系统正在工作
   *  done 状态也保留此页面，避免跳转到结果页前闪回上传页
   * ──────────────────────────────────────────────────────────────*/
  if (stage === 'streaming' || stage === 'done') {
    const stageIdx = STAGES.findIndex((s) => s.key === currentStage)
    const progressPct = Math.round(((stageIdx + 1) / STAGES.length) * 100)

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
        <TopNav active="analyze" />

        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px 64px' }}>
          {/* 顶部状态条 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: TEXT_PRIMARY, marginBottom: '4px' }}>
                正在执行财务报告智能审阅
              </div>
              <div style={{ fontSize: '13px', color: TEXT_MUTED }}>
                文件：{file?.name} · 已处理 {elapsed}s
              </div>
            </div>
            <button
              onClick={handleReset}
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${BORDER}`,
                color: TEXT_SECONDARY,
                padding: '8px 16px',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              取消并重新上传
            </button>
          </div>

          {/* 主进度卡片 */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: `1px solid ${BORDER}`,
              borderRadius: '14px',
              padding: '28px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              marginBottom: '20px',
            }}
          >
            {/* 进度条 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: TEXT_SECONDARY }}>
                整体进度
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: BRAND }}>{progressPct}%</span>
            </div>
            <div
              style={{
                height: '8px',
                backgroundColor: '#f1f5f9',
                borderRadius: '999px',
                overflow: 'hidden',
                position: 'relative',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg, ${BRAND_LIGHT}, ${BRAND})`,
                  borderRadius: '999px',
                  transition: 'width 0.5s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                    animation: 'fg-shimmer 1.4s infinite',
                  }}
                />
              </div>
            </div>

            {/* 当前任务卡片：扫描动画 */}
            <CurrentTaskCard stageKey={currentStage} />

            {/* 阶段列表 */}
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {STAGES.map((s, i) => {
                const status: 'done' | 'active' | 'pending' =
                  i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending'
                return <StageRow key={s.key} idx={i + 1} label={s.label} desc={s.desc} status={status} />
              })}
            </div>
          </div>

          {/* 安抚文字 */}
          <div
            style={{
              fontSize: '12px',
              color: TEXT_MUTED,
              textAlign: 'center',
              lineHeight: 1.7,
            }}
          >
            完整复核通常需要 1–2 分钟，长报告可能更久。完成后将自动跳转至结果页。
            <br />
            报告内容将发送至第三方大模型服务商进行分析处理。
          </div>

        </div>
      </div>
    )
  }

  /* ───────────────────────────────────────────────────────────────
   *  UPLOAD 视图 — 浅色专业风
   * ──────────────────────────────────────────────────────────────*/
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
      <TopNav active="analyze" />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px 64px' }}>
        <Link
          href="/"
          style={{ color: TEXT_MUTED, textDecoration: 'none', fontSize: '13px' }}
        >
          ← 返回首页
        </Link>
        <h1
          style={{
            fontSize: '26px',
            fontWeight: 800,
            marginTop: '18px',
            marginBottom: '8px',
            color: TEXT_PRIMARY,
            letterSpacing: '-0.3px',
          }}
        >
          上传财务报告，立即开始智能检查
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: '14px', marginBottom: '28px', lineHeight: 1.65 }}>
          上传后，系统将自动解析报告内容，并进行数据一致性复核、披露完整性检查及财务风险识别。
        </p>

        {/* 上传卡片 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            marginBottom: '20px',
          }}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="上传 PDF 财务报告：点击选择文件，或将文件拖拽至此"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            style={{
              border: `2px dashed ${dragOver ? BRAND_LIGHT : file ? '#22c55e' : BORDER}`,
              borderRadius: '12px',
              backgroundColor: dragOver
                ? BRAND_TINT
                : file
                ? '#ecfdf5'
                : '#f8fafc',
              padding: '40px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '6px' }}>✅</div>
                <div style={{ fontWeight: 700, color: '#047857', fontSize: '15px' }}>{file.name}</div>
                <div style={{ color: TEXT_MUTED, fontSize: '13px', marginTop: '4px' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>📄</div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: TEXT_PRIMARY, marginBottom: '6px' }}>
                  拖拽 PDF 至此，或点击选择文件
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: '13px' }}>
                  当前仅支持上传 PDF 格式财务报告，单个文件最大 50MB
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: '14px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#92400e',
              fontSize: '12.5px',
              lineHeight: 1.65,
              display: 'flex',
              gap: '8px',
            }}
          >
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>
              报告内容将发送至<strong>第三方大模型服务商</strong>进行分析处理。请优先上传<strong>已公开发布</strong>的财务报告；如需上传内部草稿，请先脱敏（删除公司名称、替换敏感数字）。请勿上传涉密或受保密义务约束的文件。
            </span>
          </div>
        </div>

        {/* 准则识别 — 自动识别为主，仅在用户选择展开时显示手动覆盖 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderRadius: '14px',
            padding: '20px 24px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: BRAND_TINT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '16px',
              }}
            >
              🤖
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: TEXT_PRIMARY, marginBottom: '4px' }}>
                系统将自动识别报告适用准则
              </div>
              <div style={{ fontSize: '13px', color: TEXT_SECONDARY, lineHeight: 1.6 }}>
                平台会根据报告披露内容自动判断适用的会计准则（CAS / IFRS / HKFRS / US GAAP 等）。
                如识别结果不准确，可由您手动覆盖。
              </div>
              <button
                onClick={() => setShowStandard((v) => !v)}
                style={{
                  marginTop: '10px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: BRAND_LIGHT,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showStandard ? '收起手动设置 ▲' : '手动指定准则（可选）▾'}
              </button>
            </div>
          </div>

          {showStandard && (
            <div
              style={{
                marginTop: '14px',
                paddingTop: '14px',
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              <div className="fg-grid-3">
                {standards.map((s) => {
                  const selected = standard === s.value
                  return (
                    <div
                      key={s.value}
                      onClick={() => setStandard(selected ? '' : s.value)}
                      style={{
                        border: `1.5px solid ${selected ? BRAND_LIGHT : BORDER}`,
                        borderRadius: '8px',
                        backgroundColor: selected ? BRAND_TINT : '#ffffff',
                        padding: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '13px', color: TEXT_PRIMARY, marginBottom: '4px' }}>
                        {s.label}
                      </div>
                      <div style={{ color: TEXT_MUTED, fontSize: '11.5px', lineHeight: 1.45 }}>
                        {s.desc}
                      </div>
                    </div>
                  )
                })}
              </div>
              {standard && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: TEXT_MUTED }}>
                  已手动指定：<strong style={{ color: TEXT_PRIMARY }}>{standard}</strong>。再次点击同一项可取消，恢复为自动识别。
                </div>
              )}
            </div>
          )}
        </div>

        {/* 分析模式 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderRadius: '14px',
            padding: '20px 24px',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 700, color: TEXT_PRIMARY, marginBottom: '12px' }}>
            选择分析模式
          </div>
          <div className="fg-grid-3">
            {modes.map((m) => {
              const selected = mode === m.value
              return (
                <div
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  style={{
                    border: `1.5px solid ${selected ? BRAND_LIGHT : BORDER}`,
                    borderRadius: '10px',
                    backgroundColor: selected ? BRAND_TINT : '#ffffff',
                    padding: '14px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.15s',
                  }}
                >
                  {m.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: BRAND_LIGHT,
                        color: 'white',
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {m.badge}
                    </span>
                  )}
                  <div style={{ fontSize: '22px', marginBottom: '6px' }}>{m.icon}</div>
                  <div style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: '14px', marginBottom: '4px' }}>
                    {m.label}
                  </div>
                  <div style={{ color: TEXT_MUTED, fontSize: '11.5px', lineHeight: 1.5 }}>
                    {m.desc}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px',
              color: '#b91c1c',
              fontSize: '13px',
            }}
          >
            ⚠ {error}
          </div>
        )}

        <button
          onClick={handleAnalyzeClick}
          disabled={!file}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: file ? BRAND_LIGHT : '#cbd5e1',
            color: file ? 'white' : '#64748b',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: file ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
            boxShadow: file ? '0 6px 18px rgba(37, 99, 235, 0.25)' : 'none',
          }}
        >
          开始智能检查
        </button>

        <p style={{ color: TEXT_MUTED, fontSize: '12px', textAlign: 'center', marginTop: '12px' }}>
          报告内容将发送至第三方大模型服务商进行分析处理 · 建议优先上传已公开报告，内部草稿请先脱敏
        </p>
      </div>

      {/* 上传确认 Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              border: `1px solid ${BORDER}`,
              borderRadius: '14px',
              padding: '28px',
              maxWidth: '440px',
              width: '90%',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: BRAND_TINT,
                margin: '0 auto 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}
            >
              🔒
            </div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '12px', color: TEXT_PRIMARY, textAlign: 'center' }}>
              上传确认
            </h2>
            <p style={{ color: TEXT_SECONDARY, fontSize: '13.5px', lineHeight: 1.7, marginBottom: '24px' }}>
              请确认您有权上传此文件，并已了解：为完成分析，报告内容将通过网络发送至第三方大模型服务商（DeepSeek / 火山方舟等）进行处理。我们不会主动留存您的报告，但无法对第三方服务商的数据处理作出担保。请勿上传涉密或未公开的敏感报告，内部草稿请先脱敏。
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  padding: '11px',
                  backgroundColor: '#ffffff',
                  border: `1px solid ${BORDER}`,
                  color: TEXT_SECONDARY,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 2,
                  padding: '11px',
                  backgroundColor: BRAND_LIGHT,
                  border: 'none',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                }}
              >
                确认，开始检查
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
 *  解析过程子组件：当前任务卡 + 阶段行
 * ──────────────────────────────────────────────────────────────*/

function CurrentTaskCard({ stageKey }: { stageKey: StageKey }) {
  const stage = STAGES.find((s) => s.key === stageKey)!
  return (
    <div
      style={{
        backgroundColor: BRAND_TINT,
        border: `1px solid ${BRAND_LIGHT}33`,
        borderRadius: '10px',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        position: 'relative',
        overflow: 'hidden',
        animation: 'fg-fade-in 0.25s ease-out',
      }}
      key={stageKey}
    >
      {/* 扫描动画线 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, transparent, ${BRAND_LIGHT}1a, transparent)`,
          animation: 'fg-scan 2s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          backgroundColor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <Spinner />
      </div>
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: BRAND_STRONG, marginBottom: '2px' }}>
          {stage.label}
        </div>
        <div style={{ fontSize: '12.5px', color: TEXT_SECONDARY, lineHeight: 1.5 }}>{stage.desc}</div>
      </div>
    </div>
  )
}

function StageRow({
  idx,
  label,
  desc,
  status,
}: {
  idx: number
  label: string
  desc: string
  status: 'done' | 'active' | 'pending'
}) {
  const bg = status === 'done' ? '#ecfdf5' : status === 'active' ? BRAND_TINT : '#f8fafc'
  const borderColor = status === 'done' ? '#a7f3d0' : status === 'active' ? '#bfdbfe' : BORDER
  const dotBg = status === 'done' ? '#10b981' : status === 'active' ? BRAND_LIGHT : '#cbd5e1'
  const labelColor = status === 'pending' ? TEXT_MUTED : TEXT_PRIMARY
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 14px',
        backgroundColor: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
      }}
    >
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: dotBg,
          color: 'white',
          fontSize: '12px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {status === 'done' ? '✓' : idx}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: labelColor }}>{label}</div>
        <div style={{ fontSize: '11.5px', color: TEXT_MUTED, marginTop: '1px' }}>{desc}</div>
      </div>
      {status === 'active' && <Spinner size={14} />}
    </div>
  )
}

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="9" stroke={BRAND_LIGHT} strokeWidth="2.5" fill="none" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={BRAND_LIGHT} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
