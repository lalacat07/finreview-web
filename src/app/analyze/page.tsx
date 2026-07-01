'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { saveReport } from '@/lib/history'
import { chunkText, mergeReview } from '@/lib/reviewMerge'
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
  const [files, setFiles] = useState<File[]>([])
  const file = files[0] ?? null
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; name: string } | null>(null)
  const [mode, setMode] = useState<Mode>('both')
  const [standard, setStandard] = useState<Standard>('') // 默认空 = 让系统自动识别
  const [showStandard, setShowStandard] = useState(false) // 高级：手动覆盖
  const [stage, setStage] = useState<Stage>('upload')
  const [currentStage, setCurrentStage] = useState<StageKey>('upload')
  const [partProgress, setPartProgress] = useState<{ i: number; n: number } | null>(null)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const elapsedTimer = useRef<NodeJS.Timeout | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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

  /* ─ 确认弹窗：ESC 关闭 ─ */
  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  /* ─ 文件处理（支持多选/批量） ─ */
  const handleFiles = (list: FileList | File[]) => {
    const arr = Array.from(list)
    const valid: File[] = []
    let skipped = ''
    for (const f of arr) {
      // 部分系统下合法 PDF 的 MIME 为空，故以扩展名兜底
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
      if (!isPdf) { skipped = `「${f.name}」非 PDF，已跳过`; continue }
      if (f.size > 50 * 1024 * 1024) { skipped = `「${f.name}」超过 50MB，已跳过`; continue }
      valid.push(f)
    }
    setError(skipped)
    if (valid.length) {
      setFiles((prev) => {
        const seen = new Set(prev.map((p) => p.name + p.size))
        const merged = [...prev]
        for (const f of valid) if (!seen.has(f.name + f.size)) merged.push(f)
        return merged
      })
    }
  }

  const removeFileAt = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const handleAnalyzeClick = () => {
    if (!file) return
    setShowModal(true)
  }

  /** 读取一次 /api/analyze 的 JSON 文本请求（单段），返回完整文本（过滤心跳字节） */
  const postAnalyze = async (
    body: string,
    m: Mode,
    signal: AbortSignal
  ): Promise<string> => {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: body, mode: m, standard }),
      signal,
    })
    if (!r.ok) {
      const d = await r.text().catch(() => '')
      throw new Error(`分析请求失败（HTTP ${r.status}）${d ? '：' + d.slice(0, 300) : ''}`)
    }
    const reader = r.body!.getReader()
    const decoder = new TextDecoder()
    let s = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      s += decoder.decode(value).replace(/​/g, '')
    }
    return s
  }

  /**
   * 核心：分段编排复核（Hobby 免费版友好——每次服务端调用只处理一段，均 <60s）。
   * 1) /api/extract 取元数据 + pdf-parse 文本；再试 /api/kimi-extract 取更高质量文本（失败回退）。
   * 2) 前端把文本切分成多段，主表(前部)作为共享上下文前置到每段。
   * 3) 逐段（限并发2）请求 /api/analyze 做复核，再单独请求一次健康度；前端合并成单一结果。
   */
  const analyzeReport = async (
    f: File,
    signal: AbortSignal,
    onStage?: (s: StageKey, prog?: { i: number; n: number }) => void
  ): Promise<{ full: string; pageCount: number | null; charCount: number | null; truncated: boolean; sourceText: string }> => {
    onStage?.('upload')
    const exForm = new FormData()
    exForm.append('file', f)
    const extractRes = await fetch('/api/extract', { method: 'POST', body: exForm, signal })
    if (!extractRes.ok) {
      const b = await extractRes.json().catch(() => ({}))
      throw new Error(b.error || 'PDF 解析失败')
    }
    const { text: pdfText, pageCount, charCount, truncated } = await extractRes.json()

    // 尝试用 Kimi 原生解析获得更高质量文本（含扫描件 OCR / 表格还原）；失败则回退 pdf-parse
    onStage?.('extract')
    let text: string = pdfText || ''
    try {
      const kForm = new FormData()
      kForm.append('file', f)
      const kRes = await fetch('/api/kimi-extract', { method: 'POST', body: kForm, signal })
      if (kRes.ok) {
        const kj = await kRes.json()
        if (kj.text && String(kj.text).trim()) text = kj.text
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      /* 回退 pdfText */
    }
    if (!text.trim()) {
      throw new Error('未能从该 PDF 提取到文本内容（可能是扫描件/图片版）。请改用带可复制文本的 PDF，或在 Pro 环境启用视觉路径。')
    }

    // 段偏小：每段单次调用（含输出生成）需在 Vercel 免费版 ~60s 内完成，
    // 段越小、单次输出越短越安全；段数增多由前端多次请求承担，不受单函数时限约束。
    const SECTION = 30000
    const chunks = chunkText(text, SECTION)
    const anchor = text.slice(0, 20000)
    const sourceText = String(text).slice(0, 200000)

    let full = ''
    if (chunks.length === 1) {
      onStage?.('crosscheck')
      full = await postAnalyze(chunks[0], mode, signal)
    } else {
      const want = (m: Mode) => mode === 'both' || mode === m
      // 复核：逐段（限并发2），每段完整列出本段问题；主表前置供跨表勾稽
      let reviewMd = ''
      if (want('review')) {
        const parts: string[] = new Array(chunks.length).fill('')
        let idx = 0
        let done = 0
        const worker = async () => {
          while (idx < chunks.length) {
            const i = idx++
            const note = `（说明：这是同一份报告的第 ${i + 1}/${chunks.length} 部分。请仅就"本部分"内容执行复核，并【完整、逐处列出】本部分所有问题，标注页码/表名/附注号；跨表勾稽可参照下方"主表上下文"。照常输出"## 报告总览 / ## 财务数据复核 / ## 语法核查"结构。）`
            const body =
              i === 0
                ? `${note}\n\n${chunks[i]}`
                : `${note}\n\n【主表上下文（仅供跨表勾稽参照，请勿重复列出此处的问题）】\n${anchor}\n\n【需复核的本部分内容】\n${chunks[i]}`
            parts[i] = await postAnalyze(body, 'review', signal)
            done++
            onStage?.('crosscheck', { i: done, n: chunks.length })
          }
        }
        await Promise.all([worker(), worker()])
        reviewMd = mergeReview(parts)
      }
      // 健康度：基于首段（主表所在）单独一次
      let healthMd = ''
      if (want('analysis')) {
        onStage?.('risk')
        healthMd = await postAnalyze(chunks[0], 'analysis', signal)
      }
      onStage?.('compose')
      full = [reviewMd, healthMd].filter(Boolean).join('\n\n')
    }

    return {
      full,
      pageCount: pageCount ?? null,
      charCount: charCount ?? null,
      truncated: !!truncated,
      sourceText,
    }
  }

  /** 处理单份文件（不跳转，仅存档到历史）。用于批量模式。返回 'ok' | 'error' */
  const processOneFile = async (f: File, signal: AbortSignal): Promise<'ok' | 'error'> => {
    try {
      const { full, pageCount, charCount, truncated, sourceText } = await analyzeReport(f, signal)
      if (!full.trim()) return 'error'
      await saveReport({
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        ts: Date.now(),
        fileName: f.name,
        mode,
        standard,
        result: full,
        figures: '',
        sourceText,
        scope: { pageCount, charCount, truncated },
      })
      return 'ok'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      return 'error'
    }
  }

  const handleConfirm = async () => {
    setShowModal(false)
    if (files.length === 0) return
    setError('')
    setStreamedText('')
    setPartProgress(null)
    setStage('streaming')
    setCurrentStage('upload')

    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    // 批量模式：逐份处理并存档，完成后跳历史页
    if (files.length > 1) {
      try {
        const results: string[] = []
        for (let i = 0; i < files.length; i++) {
          setBatchProgress({ current: i + 1, total: files.length, name: files[i].name })
          const r = await processOneFile(files[i], signal)
          results.push(`${files[i].name}：${r === 'ok' ? '完成' : '失败'}`)
        }
        abortRef.current = null
        sessionStorage.setItem('batchSummary', JSON.stringify(results))
        setStage('done')
        router.push('/history')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : '批量处理出错')
        setStage('upload')
        setBatchProgress(null)
      }
      return
    }

    try {
      // 分段编排复核（每次服务端调用只处理一段，兼容 Vercel 免费版 60s 限制）。
      // 进度阶段由 analyzeReport 通过 onStage 回调推进；多段时显示"第 i/n 部分"。
      const { full, pageCount, charCount, truncated, sourceText: sourceSlice } = await analyzeReport(
        file,
        signal,
        (s, prog) => {
          setCurrentStage(s)
          if (prog) setPartProgress(prog)
        }
      )

      // 空结果保护：正文为空时不跳空白结果页，改为明确报错并停留。
      if (!full.trim()) {
        throw new Error(
          '分析未返回内容。常见原因：①所用大模型返回为空或模型名不可用；②网络/额度问题。建议重试；若持续，请在部署环境变量中将 MOONSHOT_MODEL 设为账号可用的长上下文模型。'
        )
      }

      const reportId =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const reportTs = Date.now()
      const scopeObj = {
        pageCount: pageCount ?? null,
        charCount: charCount ?? null,
        truncated: !!truncated,
      }

      sessionStorage.setItem('analysisResult', full)
      sessionStorage.setItem('analysisId', reportId)
      sessionStorage.setItem('analysisTs', String(reportTs))
      // 保存原文文本以支持"原文定位"（限长以规避 sessionStorage 配额）
      try {
        sessionStorage.setItem('analysisSourceText', sourceSlice)
      } catch {
        try { sessionStorage.removeItem('analysisSourceText') } catch {}
      }
      sessionStorage.setItem('analysisMode', mode)
      sessionStorage.setItem('fileName', file.name)
      sessionStorage.setItem('analysisStandard', standard)
      sessionStorage.setItem('analysisScope', JSON.stringify(scopeObj))

      // 本地存档到历史报告（IndexedDB，失败不阻断）
      await saveReport({
        id: reportId,
        ts: reportTs,
        fileName: file.name,
        mode,
        standard,
        result: full,
        figures: '',
        sourceText: sourceSlice,
        scope: scopeObj,
      })

      abortRef.current = null
      setStage('done')
      // 直接跳转到结果页（产品化体验）
      router.push('/results')
    } catch (err) {
      // 用户主动取消（abort）不视为错误
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : '分析过程中出现错误，请重试')
      setStage('upload')
    }
  }

  const handleReset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStage('upload')
    setStreamedText('')
    setPartProgress(null)
    setFiles([])
    setBatchProgress(null)
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
  /* 批量处理视图 */
  if ((stage === 'streaming' || stage === 'done') && batchProgress) {
    const pct = Math.round((batchProgress.current / batchProgress.total) * 100)
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
        <TopNav active="analyze" />
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px 64px' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>正在批量检查</div>
          <div style={{ fontSize: '13px', color: TEXT_MUTED, marginBottom: '20px' }}>
            第 {batchProgress.current} / {batchProgress.total} 份 · 当前：{batchProgress.name}
          </div>
          <div
            style={{
              backgroundColor: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: '14px',
              padding: '28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: TEXT_SECONDARY }}>整体进度</span>
              <span style={{ fontWeight: 700, color: BRAND }}>{pct}%</span>
            </div>
            <div style={{ height: '8px', backgroundColor: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${BRAND_LIGHT}, ${BRAND})`, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ fontSize: '12px', color: TEXT_MUTED, marginTop: '16px', lineHeight: 1.7 }}>
              逐份处理中，完成后将自动跳转到「历史报告」，可逐一查看结果。请勿关闭页面。
            </div>
            <button
              onClick={handleReset}
              style={{
                marginTop: '18px',
                backgroundColor: '#fff',
                border: `1px solid ${BORDER}`,
                color: TEXT_SECONDARY,
                padding: '8px 16px',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              取消批量
            </button>
          </div>
        </div>
      </div>
    )
  }

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
                {partProgress ? ` · 分段复核 ${partProgress.i}/${partProgress.n}` : ''}
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
              multiple
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
            />
            {files.length > 0 ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '6px' }}>✅</div>
                <div style={{ fontWeight: 700, color: '#047857', fontSize: '15px' }}>
                  {files.length === 1 ? files[0].name : `已选 ${files.length} 个文件，将批量逐份检查`}
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: '13px', marginTop: '4px' }}>
                  点击可继续添加；下方可逐项移除
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>📄</div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: TEXT_PRIMARY, marginBottom: '6px' }}>
                  拖拽 PDF 至此，或点击选择文件（支持多选批量）
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: '13px' }}>
                  当前仅支持上传 PDF 格式财务报告，单个文件最大 50MB
                </div>
              </div>
            )}
          </div>

          {/* 已选文件列表 */}
          {files.length > 0 && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {files.map((f, i) => (
                <div
                  key={f.name + f.size + i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    border: `1px solid ${BORDER}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ color: TEXT_SECONDARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i + 1}. {f.name}
                    <span style={{ color: TEXT_MUTED }}> · {(f.size / 1024 / 1024).toFixed(2)} MB</span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFileAt(i) }}
                    aria-label={`移除 ${f.name}`}
                    style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

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
              <div className="fg-grid-3" role="radiogroup" aria-label="会计准则">
                {standards.map((s) => {
                  const selected = standard === s.value
                  return (
                    <div
                      key={s.value}
                      role="radio"
                      aria-checked={selected}
                      tabIndex={0}
                      onClick={() => setStandard(selected ? '' : s.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setStandard(selected ? '' : s.value)
                        }
                      }}
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
          <div className="fg-grid-3" role="radiogroup" aria-label="分析模式">
            {modes.map((m) => {
              const selected = mode === m.value
              return (
                <div
                  key={m.value}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => setMode(m.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setMode(m.value)
                    }
                  }}
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
          disabled={files.length === 0}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: files.length ? BRAND_LIGHT : '#cbd5e1',
            color: files.length ? 'white' : '#64748b',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: files.length ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
            boxShadow: files.length ? '0 6px 18px rgba(37, 99, 235, 0.25)' : 'none',
          }}
        >
          {files.length > 1 ? `开始批量检查（${files.length} 份）` : '开始智能检查'}
        </button>

        <p style={{ color: TEXT_MUTED, fontSize: '12px', textAlign: 'center', marginTop: '12px' }}>
          报告内容将发送至第三方大模型服务商进行分析处理 · 建议优先上传已公开报告，内部草稿请先脱敏
        </p>

        <p style={{ textAlign: 'center', marginTop: '14px' }}>
          <Link href="/results?demo=true" style={{ color: BRAND_LIGHT, fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
            没有报告？先看示例结果 →
          </Link>
        </p>
      </div>

      {/* 上传确认 Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="上传确认"
          onClick={() => setShowModal(false)}
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
            onClick={(e) => e.stopPropagation()}
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
              请确认您有权上传此文件，并已了解：为完成分析，报告内容（含 PDF 原件）将通过网络发送至第三方大模型服务商（Kimi 月之暗面 / 智谱 GLM / DeepSeek / 火山方舟等）进行处理。我们不会主动留存您的报告，但无法对第三方服务商的数据处理作出担保。请勿上传涉密或未公开的敏感报告，内部草稿请先脱敏。
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
