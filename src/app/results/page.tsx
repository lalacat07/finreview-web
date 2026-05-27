'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

/* ───────────────────────────────────────────────────────────────
 *  颜色 token
 * ──────────────────────────────────────────────────────────────*/
const NAV_BG = '#0b1220'
const BRAND = '#1e40af'
const BRAND_LIGHT = '#2563eb'
const BRAND_TINT = '#eff6ff'
const BORDER = '#e2e8f0'
const TEXT_PRIMARY = '#0f172a'
const TEXT_SECONDARY = '#334155'
const TEXT_MUTED = '#64748b'
const TEXT_FAINT = '#94a3b8'

const RISK = {
  high: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', label: '高风险', dot: '#dc2626' },
  med: { bg: '#fffbeb', border: '#fde68a', text: '#b45309', label: '中风险', dot: '#f59e0b' },
  low: { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', label: '低风险', dot: '#94a3b8' },
  ok: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', label: '正常', dot: '#10b981' },
  na: { bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6', label: '数据不足', dot: '#a78bfa' },
}

type Tab = 'overview' | 'review' | 'health'
type Severity = 'all' | 'high' | 'med' | 'low'
type Status = 'open' | 'verified' | 'fixed' | 'na'

/* ───────────────────────────────────────────────────────────────
 *  Parsers — 新格式
 * ──────────────────────────────────────────────────────────────*/

interface OverviewSection {
  table: { label: string; value: string }[]
  conclusion: string
}

interface IssueCard {
  id: string
  title: string
  severity: 'high' | 'med' | 'low'
  location: string
  description: string
  impact: string
  suggestion: string
}

interface DataReviewSection {
  scope: string
  summary: { completed?: string; flagged?: string; distribution?: string; raw: string[] }
  passed: boolean
  passedText: string
  issues: IssueCard[]
}

interface GrammarSection {
  scope: string
  passed: boolean
  passedText: string
  issues: IssueCard[]
}

interface HealthDimension {
  key: string
  title: string
  assessment: 'ok' | 'med' | 'high' | 'na' | 'unknown'
  assessmentText: string
  metrics: string
  conclusion: string
  raw: string
}

interface HealthSection {
  overall: {
    rating: 'high' | 'med' | 'low' | 'na' | 'unknown'
    distribution: string
    concerns: string[]
    positives: string[]
    summary: string
  }
  dimensions: HealthDimension[]
}

interface ParsedResult {
  overview?: OverviewSection
  review?: DataReviewSection
  grammar?: GrammarSection
  health?: HealthSection
  isNewFormat: boolean
  raw: string
}

/* ─── 拆出 H2 块 ─── */
function splitH2(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = text.split('\n')
  let current = ''
  let buf: string[] = []
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/)
    if (m) {
      if (current) out[current] = buf.join('\n').trim()
      current = m[1].trim()
      buf = []
    } else if (current) {
      buf.push(line)
    }
  }
  if (current) out[current] = buf.join('\n').trim()
  return out
}

/* ─── 拆出 H3 子块 ─── */
function splitH3(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = text.split('\n')
  let current = ''
  let buf: string[] = []
  for (const line of lines) {
    const m = line.match(/^###\s+(.+?)\s*$/)
    if (m) {
      if (current) out[current] = buf.join('\n').trim()
      current = m[1].trim()
      buf = []
    } else if (current) {
      buf.push(line)
    } else {
      // 头部段落归到 __intro
      out['__intro'] = (out['__intro'] || '') + line + '\n'
    }
  }
  if (current) out[current] = buf.join('\n').trim()
  if (out['__intro']) out['__intro'] = out['__intro'].trim()
  return out
}

/* ─── 报告总览 ─── */
function parseOverview(text: string): OverviewSection {
  const sub = splitH3(text)
  const tableSrc = sub['__intro'] || text
  const table: { label: string; value: string }[] = []
  tableSrc.split('\n').forEach((line) => {
    const cells = line.split('|').map((s) => s.trim()).filter((s) => s !== '')
    if (
      cells.length >= 2 &&
      !cells[0].startsWith('-') &&
      !cells[0].startsWith(':') &&
      cells[0] !== '项目'
    ) {
      // 跳过分隔行
      if (/^[-:|\s]+$/.test(cells.join(''))) return
      table.push({ label: cells[0], value: cells[1] })
    }
  })
  const conclusion = sub['整体结论'] || ''
  return { table, conclusion }
}

/* ─── 财务数据复核 ─── */
function parseReview(text: string): DataReviewSection {
  const sub = splitH3(text)
  const scope = sub['检查范围概述'] || ''
  const summaryRaw = sub['检查成果摘要'] || ''
  const issuesRaw = sub['需关注事项'] || ''

  // summary 解析
  const summaryLines = summaryRaw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  let completed = ''
  let flagged = ''
  let distribution = ''
  summaryLines.forEach((l) => {
    if (l.includes('已完成')) completed = stripBullet(l)
    if (l.includes('识别')) flagged = stripBullet(l)
    if (l.includes('风险分布') || (l.match(/🔴|🟡|⚪/) && !completed.includes('🔴'))) {
      if (!distribution) distribution = stripBullet(l)
    }
  })

  // 是否全部通过
  const passed = /^[\s\S]*?✅[^#]{0,800}(本次复核未发现|全部通过|未发现)/.test(issuesRaw)
  const passedText = passed
    ? issuesRaw
        .replace(/^[\s\S]*?✅/, '✅')
        .split('\n####')[0]
        .trim()
    : ''

  // 解析 #### 问题卡片
  const issues: IssueCard[] = []
  if (!passed) {
    const blocks = issuesRaw.split(/(?=^####\s)/m).filter((b) => /^####\s/.test(b.trim()))
    blocks.forEach((block, idx) => {
      const titleMatch = block.match(/^####\s+(.+?)\s*$/m)
      const title = titleMatch ? titleMatch[1].trim() : `问题 ${idx + 1}`
      const fields = parseIssueFields(block)
      issues.push({
        id: `issue-${idx + 1}`,
        title,
        severity: detectSeverity(fields['风险等级'] || ''),
        location: fields['涉及位置'] || '未注明',
        description: fields['问题描述'] || '',
        impact: fields['可能影响'] || '',
        suggestion: fields['修改建议'] || '',
      })
    })
  }

  return {
    scope,
    summary: { completed, flagged, distribution, raw: summaryLines },
    passed,
    passedText,
    issues,
  }
}

/* ─── 语法核查 ─── */
function parseGrammar(text: string): GrammarSection {
  const sub = splitH3(text)
  const scope = sub['检查范围概述'] || ''
  const issuesRaw = sub['需关注事项'] || ''

  const passed =
    issuesRaw.trim() === '' ||
    /✅[^#]{0,800}(未发现明显问题|全部通过|未发现)/.test(issuesRaw)
  const passedText = passed ? issuesRaw.trim() : ''

  const issues: IssueCard[] = []
  if (!passed) {
    const blocks = issuesRaw.split(/(?=^####\s)/m).filter((b) => /^####\s/.test(b.trim()))
    blocks.forEach((block, idx) => {
      const titleMatch = block.match(/^####\s+(.+?)\s*$/m)
      const title = titleMatch ? titleMatch[1].trim() : `语法问题 ${idx + 1}`
      const fields = parseIssueFields(block)
      issues.push({
        id: `grammar-${idx + 1}`,
        title,
        severity: detectSeverity(fields['风险等级'] || ''),
        location: fields['涉及位置'] || '未注明',
        description: fields['问题描述'] || '',
        impact: fields['可能影响'] || '',
        suggestion: fields['修改建议'] || '',
      })
    })
  }

  return { scope, passed, passedText, issues }
}

function stripBullet(l: string) {
  return l.replace(/^[-*•]\s*/, '').trim()
}

function parseIssueFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const lines = block.split('\n')
  let currentField = ''
  for (const line of lines) {
    const m = line.match(/^[-*•]\s*([^:：]+)[:：]\s*(.*)$/)
    if (m) {
      currentField = m[1].trim()
      fields[currentField] = m[2].trim()
    } else if (currentField && line.trim() && !line.startsWith('####')) {
      fields[currentField] += ' ' + line.trim()
    }
  }
  return fields
}

function detectSeverity(text: string): 'high' | 'med' | 'low' {
  if (text.includes('🔴') || text.includes('高风险')) return 'high'
  if (text.includes('🟡') || text.includes('中风险') || text.includes('中等风险')) return 'med'
  return 'low'
}

/* ─── 财务健康度 ─── */
const DIMENSION_ORDER = [
  '盈利能力',
  '偿债能力',
  '现金流质量',
  '营运能力',
  '成长性',
  '重大异常波动',
  '持续经营与经营质量风险',
]

const DIMENSION_ICONS: Record<string, string> = {
  盈利能力: '💰',
  偿债能力: '⚖️',
  现金流质量: '💧',
  营运能力: '⚙️',
  成长性: '📈',
  重大异常波动: '⚠️',
  持续经营与经营质量风险: '🛡️',
}

function parseHealth(text: string): HealthSection {
  const sub = splitH3(text)

  // 整体评估
  const overallRaw = sub['整体评估'] || ''
  const overallFields = parseIssueFields(overallRaw)
  const rating = detectOverallRating(overallFields['综合评级'] || overallRaw)
  const distribution = overallFields['风险分布'] || ''
  const summary = overallFields['总体评语'] || ''

  // 关注事项 / 正面指标 — 这两个是嵌套列表
  const concerns = extractNumberedList(overallRaw, '主要关注事项')
  const positives = extractNumberedList(overallRaw, '主要正面指标')

  // 维度
  const dimensions: HealthDimension[] = DIMENSION_ORDER.filter((k) => sub[k]).map((k) => {
    const raw = sub[k]
    const fields = parseIssueFields(raw)
    const assessmentText = fields['评估'] || ''
    return {
      key: k,
      title: k,
      assessment: detectDimensionAssessment(assessmentText),
      assessmentText,
      metrics: fields['关键指标'] || '',
      conclusion: fields['简短结论'] || '',
      raw,
    }
  })

  return {
    overall: { rating, distribution, concerns, positives, summary },
    dimensions,
  }
}

function detectOverallRating(text: string): HealthSection['overall']['rating'] {
  if (text.includes('🔴') || /高风险/.test(text)) return 'high'
  if (text.includes('🟡') || /中等风险|中风险/.test(text)) return 'med'
  if (text.includes('✅') || /低风险/.test(text)) return 'low'
  if (text.includes('⚪') || /数据不足/.test(text)) return 'na'
  return 'unknown'
}

function detectDimensionAssessment(text: string): HealthDimension['assessment'] {
  if (text.includes('🔴') || /显著风险/.test(text)) return 'high'
  if (text.includes('🟡') || /进一步关注|建议关注/.test(text)) return 'med'
  if (text.includes('✅') || /未发现明显异常/.test(text)) return 'ok'
  if (text.includes('⚪') || /数据不足/.test(text)) return 'na'
  return 'unknown'
}

function extractNumberedList(text: string, header: string): string[] {
  const re = new RegExp(`${header}[^:：]*[:：]?\\s*\\n([\\s\\S]*?)(?=\\n[-*]\\s|$)`, 'i')
  const m = text.match(re)
  if (!m) return []
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\.\s*/, '').trim())
    .filter((l) => l && !l.startsWith('-') && !l.match(/^[:：]/))
    .slice(0, 5)
}

/* ─── 顶层 parser ─── */
function parseResult(text: string): ParsedResult {
  const sections = splitH2(text)
  const isNew =
    !!sections['报告总览'] ||
    !!sections['财务数据复核'] ||
    !!sections['财务健康度分析'] ||
    !!sections['数据核查'] ||
    !!sections['财务健康度']

  const overviewRaw = sections['报告总览']
  const reviewRaw = sections['财务数据复核'] || sections['数据核查']
  const grammarRaw = sections['语法核查']
  const healthRaw = sections['财务健康度分析'] || sections['财务健康度']

  return {
    overview: overviewRaw ? parseOverview(overviewRaw) : undefined,
    review: reviewRaw ? parseReview(reviewRaw) : undefined,
    grammar: grammarRaw ? parseGrammar(grammarRaw) : undefined,
    health: healthRaw ? parseHealth(healthRaw) : undefined,
    isNewFormat: isNew,
    raw: text,
  }
}

/* ───────────────────────────────────────────────────────────────
 *  Components
 * ──────────────────────────────────────────────────────────────*/

function Pill({
  text,
  tone,
}: {
  text: string
  tone: 'brand' | 'high' | 'med' | 'low' | 'ok' | 'na'
}) {
  const palette =
    tone === 'brand'
      ? { bg: BRAND_TINT, border: '#bfdbfe', text: BRAND }
      : RISK[tone]
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        fontSize: '12px',
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: '999px',
      }}
    >
      {text}
    </span>
  )
}

function SectionCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: `1px solid ${BORDER}`,
        borderRadius: '14px',
        overflow: 'hidden',
        marginBottom: '16px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div
        style={{
          padding: '16px 22px',
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT_PRIMARY }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: '12.5px', color: TEXT_MUTED, marginTop: '2px' }}>{subtitle}</div>
          )}
        </div>
        {right}
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  )
}

/* ─── 报告总览 视图 ─── */
function OverviewView({ data }: { data: OverviewSection }) {
  if (!data) return null
  const fieldOrder = [
    '报告名称',
    '报告类型',
    '报告期间',
    '适用准则',
    '审计机构',
    '签字注册会计师',
    '报告状态',
  ]
  const map = Object.fromEntries(data.table.map((r) => [r.label, r.value]))

  return (
    <div>
      {/* 大卡：报告名称 + 整体结论 */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: `1px solid ${BORDER}`,
          borderRadius: '14px',
          padding: '24px 26px',
          marginBottom: '16px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              backgroundColor: BRAND_TINT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0,
            }}
          >
            📑
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: TEXT_MUTED, fontWeight: 600, marginBottom: '4px' }}>
              报告总览
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: TEXT_PRIMARY,
                lineHeight: 1.35,
                marginBottom: '4px',
              }}
            >
              {map['报告名称'] || '未识别报告名称'}
            </div>
            <div style={{ fontSize: '13px', color: TEXT_SECONDARY }}>
              {map['报告类型'] || '财务报告'} · {map['报告期间'] || '未明确期间'}
            </div>
          </div>
        </div>
        {data.conclusion && (
          <div
            style={{
              marginTop: '18px',
              paddingTop: '18px',
              borderTop: `1px solid ${BORDER}`,
              fontSize: '13.5px',
              color: TEXT_SECONDARY,
              lineHeight: 1.75,
              backgroundColor: '#f8fafc',
              margin: '18px -26px -24px',
              padding: '18px 26px 24px',
            }}
          >
            <div style={{ fontSize: '12px', color: TEXT_MUTED, fontWeight: 600, marginBottom: '6px' }}>
              整体结论
            </div>
            <InlineRich text={data.conclusion} />
          </div>
        )}
      </div>

      {/* 字段卡组 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
        }}
      >
        {fieldOrder.map((k) => {
          const v = map[k]
          if (!v) return null
          return (
            <div
              key={k}
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${BORDER}`,
                borderRadius: '10px',
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: TEXT_MUTED,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                {k}
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: TEXT_PRIMARY, lineHeight: 1.5 }}>
                {v}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── 财务数据复核 视图 ─── */
function ReviewView({
  data,
  statuses,
  setStatus,
}: {
  data: DataReviewSection
  statuses: Record<string, Status>
  setStatus: (id: string, s: Status) => void
}) {
  const [filter, setFilter] = useState<Severity>('all')

  const filteredIssues = useMemo(
    () => (filter === 'all' ? data.issues : data.issues.filter((i) => i.severity === filter)),
    [data.issues, filter]
  )

  const counts = useMemo(
    () => ({
      high: data.issues.filter((i) => i.severity === 'high').length,
      med: data.issues.filter((i) => i.severity === 'med').length,
      low: data.issues.filter((i) => i.severity === 'low').length,
    }),
    [data.issues]
  )

  return (
    <div>
      {/* 检查范围概述 */}
      {data.scope && (
        <SectionCard title="检查范围概述" subtitle="系统已对整份报告进行的复核覆盖">
          <p style={{ fontSize: '13.5px', color: TEXT_SECONDARY, lineHeight: 1.8, margin: 0 }}>
            <InlineRich text={data.scope} />
          </p>
        </SectionCard>
      )}

      {/* 检查成果摘要 — 数字仪表盘 */}
      <SectionCard title="检查成果摘要">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
          }}
        >
          <StatTile label="已识别需关注事项" value={String(data.issues.length)} tone="brand" />
          <StatTile label="🔴 高风险" value={String(counts.high)} tone="high" />
          <StatTile label="🟡 中风险" value={String(counts.med)} tone="med" />
          <StatTile label="⚪ 低风险" value={String(counts.low)} tone="low" />
        </div>
        {data.summary.raw.length > 0 && (
          <div
            style={{
              marginTop: '14px',
              fontSize: '12.5px',
              color: TEXT_MUTED,
              lineHeight: 1.7,
            }}
          >
            {data.summary.raw.map((l, i) => (
              <div key={i}>· {l}</div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 需关注事项 */}
      <SectionCard
        title="需关注事项"
        subtitle={data.passed ? '本次复核未发现明显问题' : `共 ${data.issues.length} 项`}
        right={
          !data.passed && data.issues.length > 0 ? (
            <SeverityFilter filter={filter} setFilter={setFilter} counts={counts} />
          ) : undefined
        }
      >
        {data.passed && (
          <div
            style={{
              backgroundColor: RISK.ok.bg,
              border: `1px solid ${RISK.ok.border}`,
              borderRadius: '10px',
              padding: '16px 18px',
              color: RISK.ok.text,
              fontSize: '13.5px',
              lineHeight: 1.7,
            }}
          >
            <InlineRich text={data.passedText || '✅ 本次复核未发现明显的数据勾稽异常或披露不一致问题。'} />
          </div>
        )}

        {!data.passed && filteredIssues.length === 0 && (
          <div style={{ color: TEXT_MUTED, fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
            当前筛选下无对应事项
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredIssues.map((issue, i) => (
            <IssueCardView
              key={issue.id}
              issue={issue}
              index={i + 1}
              status={statuses[issue.id] || 'open'}
              setStatus={(s) => setStatus(issue.id, s)}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

/* ─── 语法核查 视图 ─── */
function GrammarView({
  data,
  statuses,
  setStatus,
}: {
  data: GrammarSection
  statuses: Record<string, Status>
  setStatus: (id: string, s: Status) => void
}) {
  return (
    <div style={{ marginTop: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT_PRIMARY }}>🔤 语法核查</div>
        {data.passed ? (
          <span
            style={{
              backgroundColor: RISK.ok.bg,
              border: `1px solid ${RISK.ok.border}`,
              color: RISK.ok.text,
              fontSize: '11.5px',
              fontWeight: 700,
              padding: '2px 10px',
              borderRadius: '999px',
            }}
          >
            ✅ 通过
          </span>
        ) : (
          <span
            style={{
              backgroundColor: RISK.low.bg,
              border: `1px solid ${RISK.low.border}`,
              color: RISK.low.text,
              fontSize: '11.5px',
              fontWeight: 700,
              padding: '2px 10px',
              borderRadius: '999px',
            }}
          >
            {data.issues.length} 项待关注
          </span>
        )}
      </div>

      {data.scope && (
        <SectionCard title="检查范围概述" subtitle="语法与语言合规审查覆盖">
          <p style={{ fontSize: '13.5px', color: TEXT_SECONDARY, lineHeight: 1.8, margin: 0 }}>
            <InlineRich text={data.scope} />
          </p>
        </SectionCard>
      )}

      <SectionCard
        title="需关注事项"
        subtitle={data.passed ? '语言合规检查通过' : `共 ${data.issues.length} 项`}
      >
        {data.passed && (
          <div
            style={{
              backgroundColor: RISK.ok.bg,
              border: `1px solid ${RISK.ok.border}`,
              borderRadius: '10px',
              padding: '16px 18px',
              color: RISK.ok.text,
              fontSize: '13.5px',
              lineHeight: 1.7,
            }}
          >
            <InlineRich
              text={data.passedText || '✅ 语言合规性检查未发现明显问题。'}
            />
          </div>
        )}
        {!data.passed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.issues.map((issue, i) => (
              <IssueCardView
                key={issue.id}
                issue={issue}
                index={i + 1}
                status={statuses[issue.id] || 'open'}
                setStatus={(s) => setStatus(issue.id, s)}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'brand' | 'high' | 'med' | 'low'
}) {
  const palette = tone === 'brand' ? { bg: BRAND_TINT, border: '#bfdbfe', text: BRAND } : RISK[tone]
  return (
    <div
      style={{
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: '10px',
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: '11.5px', color: palette.text, fontWeight: 700, marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: palette.text, letterSpacing: '-0.5px' }}>
        {value}
      </div>
    </div>
  )
}

function SeverityFilter({
  filter,
  setFilter,
  counts,
}: {
  filter: Severity
  setFilter: (s: Severity) => void
  counts: { high: number; med: number; low: number }
}) {
  const buttons: { value: Severity; label: string; count?: number }[] = [
    { value: 'all', label: '全部', count: counts.high + counts.med + counts.low },
    { value: 'high', label: '🔴 高', count: counts.high },
    { value: 'med', label: '🟡 中', count: counts.med },
    { value: 'low', label: '⚪ 低', count: counts.low },
  ]
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {buttons.map((b) => {
        const selected = filter === b.value
        return (
          <button
            key={b.value}
            onClick={() => setFilter(b.value)}
            style={{
              padding: '5px 11px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${selected ? BRAND_LIGHT : BORDER}`,
              backgroundColor: selected ? BRAND_LIGHT : '#ffffff',
              color: selected ? 'white' : TEXT_SECONDARY,
              transition: 'all 0.15s',
            }}
          >
            {b.label}
            {b.count !== undefined && <span style={{ marginLeft: '4px', opacity: 0.85 }}>· {b.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

function IssueCardView({
  issue,
  index,
  status,
  setStatus,
}: {
  issue: IssueCard
  index: number
  status: Status
  setStatus: (s: Status) => void
}) {
  const r = RISK[issue.severity]
  const isMarked = status !== 'open'
  return (
    <div
      style={{
        border: `1px solid ${isMarked ? BORDER : r.border}`,
        borderLeft: `4px solid ${r.dot}`,
        borderRadius: '10px',
        backgroundColor: isMarked ? '#fafafa' : '#ffffff',
        overflow: 'hidden',
        opacity: isMarked ? 0.75 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div
        style={{
          padding: '14px 18px 8px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div
            style={{
              fontSize: '11px',
              color: TEXT_MUTED,
              fontWeight: 600,
              marginBottom: '3px',
            }}
          >
            问题 {String(index).padStart(2, '0')}
          </div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: TEXT_PRIMARY,
              lineHeight: 1.45,
              textDecoration: status === 'na' ? 'line-through' : 'none',
            }}
          >
            {issue.title}
          </div>
        </div>
        <Pill text={r.label} tone={issue.severity} />
      </div>

      <div style={{ padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Field label="涉及位置" value={issue.location} />
        {issue.description && <Field label="问题描述" value={issue.description} multiline />}
        {issue.impact && <Field label="可能影响" value={issue.impact} multiline />}
        {issue.suggestion && (
          <Field label="修改建议" value={issue.suggestion} multiline accent="brand" />
        )}
      </div>

      {/* 状态标记栏 */}
      <div
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          backgroundColor: '#fbfcfe',
        }}
      >
        <div style={{ fontSize: '11.5px', color: TEXT_MUTED }}>
          {status === 'open' && '未处理'}
          {status === 'verified' && '✓ 已核实'}
          {status === 'fixed' && '✓ 已修改'}
          {status === 'na' && '— 不适用'}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(
            [
              { v: 'verified' as Status, label: '已核实' },
              { v: 'fixed' as Status, label: '已修改' },
              { v: 'na' as Status, label: '不适用' },
            ] as const
          ).map((s) => (
            <button
              key={s.v}
              onClick={() => setStatus(status === s.v ? 'open' : s.v)}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${status === s.v ? BRAND_LIGHT : BORDER}`,
                backgroundColor: status === s.v ? BRAND_TINT : '#ffffff',
                color: status === s.v ? BRAND : TEXT_SECONDARY,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  multiline,
  accent,
}: {
  label: string
  value: string
  multiline?: boolean
  accent?: 'brand'
}) {
  return (
    <div
      style={{
        display: multiline ? 'block' : 'flex',
        gap: '10px',
        fontSize: '13px',
        lineHeight: 1.7,
      }}
    >
      <div
        style={{
          color: TEXT_MUTED,
          fontWeight: 600,
          fontSize: '12px',
          minWidth: multiline ? 'auto' : '70px',
          marginBottom: multiline ? '3px' : 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: accent === 'brand' ? BRAND : TEXT_SECONDARY,
          flex: 1,
          fontWeight: accent === 'brand' ? 600 : 400,
        }}
      >
        <InlineRich text={value} />
      </div>
    </div>
  )
}

/* ─── 财务健康度 视图 ─── */
function HealthView({ data }: { data: HealthSection }) {
  const overall = data.overall
  const ratingMap = {
    high: { ...RISK.high, label: '高风险' },
    med: { ...RISK.med, label: '中等风险' },
    low: { ...RISK.ok, label: '低风险' },
    na: { ...RISK.na, label: '数据不足' },
    unknown: { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569', label: '未评级' },
  }
  const rating = ratingMap[overall.rating]

  return (
    <div>
      {/* 整体评估 */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: `1px solid ${BORDER}`,
          borderRadius: '14px',
          padding: '24px 26px',
          marginBottom: '16px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT_PRIMARY }}>整体评估</div>
          <span
            style={{
              backgroundColor: rating.bg,
              border: `1px solid ${rating.border}`,
              color: rating.text,
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            综合评级：{rating.label}
          </span>
          {overall.distribution && (
            <span style={{ fontSize: '12.5px', color: TEXT_MUTED }}>{overall.distribution}</span>
          )}
        </div>

        {overall.summary && (
          <p
            style={{
              fontSize: '13.5px',
              color: TEXT_SECONDARY,
              lineHeight: 1.8,
              marginBottom: '16px',
              backgroundColor: '#f8fafc',
              padding: '12px 14px',
              borderRadius: '8px',
              margin: '0 0 16px',
            }}
          >
            <InlineRich text={overall.summary} />
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
          }}
        >
          {overall.concerns.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: RISK.high.text, fontWeight: 700, marginBottom: '8px' }}>
                ⚠ 主要关注事项
              </div>
              <ol style={{ paddingLeft: '18px', margin: 0, color: TEXT_SECONDARY, fontSize: '13px', lineHeight: 1.7 }}>
                {overall.concerns.map((c, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    <InlineRich text={c} />
                  </li>
                ))}
              </ol>
            </div>
          )}
          {overall.positives.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: RISK.ok.text, fontWeight: 700, marginBottom: '8px' }}>
                ✓ 主要正面指标
              </div>
              <ol style={{ paddingLeft: '18px', margin: 0, color: TEXT_SECONDARY, fontSize: '13px', lineHeight: 1.7 }}>
                {overall.positives.map((c, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    <InlineRich text={c} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* 七个维度 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '12px',
        }}
      >
        {data.dimensions.map((d) => (
          <DimensionCard key={d.key} d={d} />
        ))}
      </div>

      {data.dimensions.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '32px',
            color: TEXT_MUTED,
            fontSize: '13px',
            backgroundColor: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderRadius: '14px',
          }}
        >
          未识别到分维度健康度内容。请确认本次分析模式包含"财务健康度分析"。
        </div>
      )}
    </div>
  )
}

function DimensionCard({ d }: { d: HealthDimension }) {
  const palette =
    d.assessment === 'high'
      ? RISK.high
      : d.assessment === 'med'
      ? RISK.med
      : d.assessment === 'ok'
      ? RISK.ok
      : d.assessment === 'na'
      ? RISK.na
      : { bg: '#f8fafc', border: BORDER, text: TEXT_MUTED }

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: `1px solid ${BORDER}`,
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: palette.bg,
          borderBottom: `1px solid ${palette.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '18px' }}>{DIMENSION_ICONS[d.title] || '📌'}</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: TEXT_PRIMARY, flex: 1 }}>{d.title}</span>
        <span
          style={{
            fontSize: '11.5px',
            fontWeight: 700,
            color: palette.text,
            backgroundColor: '#ffffff',
            border: `1px solid ${palette.border}`,
            padding: '3px 9px',
            borderRadius: '999px',
          }}
        >
          {simplifyAssessment(d.assessmentText)}
        </span>
      </div>
      <div style={{ padding: '14px 18px' }}>
        {d.metrics && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: TEXT_MUTED, fontWeight: 600, marginBottom: '4px' }}>
              关键指标
            </div>
            <div style={{ fontSize: '12.5px', color: TEXT_SECONDARY, lineHeight: 1.65 }}>
              <InlineRich text={d.metrics} />
            </div>
          </div>
        )}
        {d.conclusion && (
          <div>
            <div style={{ fontSize: '11px', color: TEXT_MUTED, fontWeight: 600, marginBottom: '4px' }}>
              简短结论
            </div>
            <div style={{ fontSize: '13px', color: TEXT_PRIMARY, lineHeight: 1.7 }}>
              <InlineRich text={d.conclusion} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function simplifyAssessment(text: string): string {
  if (!text) return '未评级'
  // 去掉 emoji 之外的冗余
  return text.replace(/^.*?(✅|🟡|🔴|⚪)/, '$1').trim().slice(0, 14) || '未评级'
}

/* ─── 行内富文本：粗体 + 数字高亮 ─── */
function InlineRich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} style={{ fontWeight: 700, color: TEXT_PRIMARY }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

/* ───────────────────────────────────────────────────────────────
 *  Legacy markdown renderer — 旧格式 fallback
 * ──────────────────────────────────────────────────────────────*/

function LegacyMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const els: React.ReactNode[] = []
  lines.forEach((line, i) => {
    if (line.startsWith('# ')) {
      els.push(
        <h1 key={i} style={{ fontSize: '20px', fontWeight: 800, color: TEXT_PRIMARY, marginTop: '24px' }}>
          {line.slice(2)}
        </h1>
      )
    } else if (line.startsWith('## ')) {
      els.push(
        <h2 key={i} style={{ fontSize: '16px', fontWeight: 700, color: BRAND, marginTop: '20px' }}>
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      els.push(
        <h3 key={i} style={{ fontSize: '13px', fontWeight: 700, color: TEXT_MUTED, marginTop: '14px', textTransform: 'uppercase' }}>
          {line.slice(4)}
        </h3>
      )
    } else if (line.match(/^[-*]\s/)) {
      els.push(
        <div key={i} style={{ display: 'flex', gap: '6px', fontSize: '13px', color: TEXT_SECONDARY, padding: '2px 0' }}>
          <span style={{ color: BRAND_LIGHT }}>›</span>
          <InlineRich text={line.slice(2)} />
        </div>
      )
    } else if (line.trim() === '') {
      els.push(<div key={i} style={{ height: '6px' }} />)
    } else {
      els.push(
        <p key={i} style={{ fontSize: '13px', color: TEXT_SECONDARY, lineHeight: 1.7, margin: '2px 0' }}>
          <InlineRich text={line} />
        </p>
      )
    }
  })
  return <div>{els}</div>
}

/* ───────────────────────────────────────────────────────────────
 *  Demo result — 华晟科技集团有限公司 (1234.HK) 2025 年报（虚构）
 * ──────────────────────────────────────────────────────────────*/

const DEMO_RESULT = `## 报告总览

| 项目 | 内容 |
|------|------|
| 报告名称 | 华晟科技集团有限公司 2025 年度报告 |
| 报告类型 | 年度报告 |
| 报告期间 | 2025 年度（截至 2025 年 12 月 31 日） |
| 适用准则 | IFRS / HKFRS |
| 审计机构 | 毕马威会计师事务所 |
| 签字注册会计师 | 陈志远、李明华 |
| 报告状态 | 正式版 |

### 整体结论
系统已对华晟科技集团有限公司（股票代码：1234.HK）2025 年度报告进行全量数据勾稽、附注一致性及语言合规性检查。共识别需关注事项 3 项（高风险 1 项、中风险 2 项），另发现语言合规性问题 1 项。主要问题集中于综合收益表与损益表归母净利润口径不一致，建议编制方结合工作底稿进一步核实并修订相关报表脚注。

## 财务数据复核

### 检查范围概述
本次已对整份年度报告进行全量复核，覆盖合并损益表、综合收益表、资产负债表、现金流量表及股东权益变动表五大主表的加总平衡关系，以及附注 4（收入分类）、附注 12（商誉）、附注 18（金融资产）、附注 23（借款）等关键附注表格的纵横向勾稽，并重算了基本 EPS 及摊薄 EPS。除下列需关注事项外，其余检查项目暂未发现明显异常。

### 检查成果摘要
发现问题：3 项（高风险 1 项，中风险 2 项，低风险 0 项）

### 需关注事项

#### 问题 1：综合收益表归母净利润与损益表数据不一致
- 风险等级：🔴 高风险
- 涉及位置：综合收益表第 3 行 / 合并损益表第 22 行
- 问题描述：综合收益表列示归属于母公司股东净利润为 HK$2,341,800 千元，而合并损益表同项目列示为 HK$2,318,600 千元，差异 HK$23,200 千元（约占净利润 1.0%），两处数据不一致且无对账说明。
- 可能影响：两表口径不一致将导致审计师重点关注，影响报告整体可信度；香港交易所对上市公司年报数据一致性有明确要求，可能引发交易所问询。
- 修改建议：逐项核查综合收益表与损益表归母净利润的计算来源，确认是否存在权益法调整未完整抵消或内部交易存在遗漏，并在附注中补充说明差异成因或更正数据。

#### 问题 2：附注 12 商誉期初余额与上期报告期末余额不勾稽
- 风险等级：🟡 中风险
- 涉及位置：附注 12（商誉及减值测试）
- 问题描述：本年度报告附注 12 列示商誉期初账面净额为 HK$5,820,000 千元，但 2024 年度报告同科目期末余额为 HK$5,756,400 千元，两者相差 HK$63,600 千元，报告未说明差异原因（如汇率折算差异或业务整合调整）。
- 可能影响：商誉跨期余额不勾稽属于重要披露缺失，影响减值测试起点的准确性，审计师将对此重点核实，可能导致审计程序延长。
- 修改建议：补充披露商誉期初余额与上期期末差异的原因，若为汇率折算差异，应在附注中列示汇率调整明细；若为业务整合原因，应在合并层面说明。

#### 问题 3：摊薄 EPS 四舍五入规则与基本 EPS 不一致
- 风险等级：⚪ 低风险
- 涉及位置：损益表 EPS 列示 / 附注 8（每股收益）
- 问题描述：报告披露基本 EPS 为 HK$0.42，按归母净利润 HK$2,318,600 千元 ÷ 加权平均股数 5,521,428 千股重算为 HK$0.41993，四舍五入后与披露值一致；摊薄 EPS 按附注披露潜在稀释股数 48,600 千股调整后重算为 HK$0.4106，但报告披露为 HK$0.41，差异 HK$0.0006，单位四舍五入精度规则不一致。
- 可能影响：差异金额极小，不具实质重大性，但建议统一四舍五入规则以保持报告内部一致性。
- 修改建议：在附注 8 中明确说明每股收益的四舍五入政策（如均保留两位小数），确保基本 EPS 与摊薄 EPS 采用同一精度规则。

## 语法核查

### 检查范围概述
本次已对报告英文正文（含管理层讨论与分析、董事会报告及附注）进行全面语言合规性审查，覆盖英式/美式拼写一致性、日期格式、标点使用、主谓一致性、专业术语规范性及法定声明完整性。除下列问题外，整体语言表达专业，未发现其他明显合规性问题。

### 需关注事项

#### 语法问题 1：英式与美式拼写混用
- 风险等级：⚪ 低风险
- 涉及位置：管理层讨论与分析第 3 页、附注正文第 27 页
- 问题描述：正文同时出现 "recognised"（英式）和 "recognized"（美式）两种拼法，另有 "programme" 与 "program" 混用，拼写体系不统一。
- 可能影响：不影响财务数据准确性，但影响报告专业度。香港上市公司年报惯例应统一采用英式拼写。
- 修改建议：全文统一使用英式拼写（recognised、programme、favour 等），建议通过全局查找替换后人工复核。

## 财务健康度分析

### 整体评估
- 综合评级：🟡 中等风险
- 风险分布：🔴 0 项 / 🟡 3 项 / ✅ 3 项 / ⚪ 1 项
- 主要关注事项（按严重程度排序，至多 3 条）：
  1. 经营现金流与净利润背离明显，现金收益比 0.63，盈利质量存疑
  2. 资产负债率同比上升 2.8 个百分点至 54.1%，一年内到期有息负债占比升至 31%
  3. 应收账款周转天数同比延长约 18 天，营运资金占用增加
- 主要正面指标（至多 3 条）：
  1. 营业收入同比增长 12.3%，主营业务成长性良好
  2. 毛利率维持 38.6%，同比基本稳定，定价能力尚可
  3. 货币资金覆盖一年内到期有息负债 1.4 倍，短期流动性压力相对可控
- 总体评语：华晟科技集团 2025 年度收入规模持续扩张，盈利能力基本稳定，但经营现金流质量及营运资金效率有所下降，偿债端杠杆率有所上升，需重点关注现金流质量及应收账款回款情况。综合评级为中等风险。

### 盈利能力
- 评估：✅ 未发现明显异常
- 关键指标：毛利率 38.6%（2024: 38.2%）；净利率 11.8%（2024: 12.4%）；ROE = 净利率 11.8% × 资产周转率 0.61 × 权益乘数 2.18 = 15.7%；ROA = 7.2%
- 简短结论：盈利能力整体相对稳定，毛利率维持在 38% 以上，净利率小幅下降 0.6 个百分点，主要受期间费用略有增加影响。ROE 维持在 15.7%，处于行业中等偏上水平。建议结合同行业可比公司进一步横向比较。

### 偿债能力
- 评估：🟡 建议进一步关注
- 关键指标：资产负债率 54.1%（2024: 51.3%）；流动比率 1.38；速动比率 1.02；利息保障倍数 6.2 倍；净债务/EBITDA = 2.1 倍
- 简短结论：资产负债率较上年上升约 2.8 个百分点，流动比率及速动比率处于行业偏低水平，一年内到期有息负债占比升至约 31%，再融资需求较大。利息保障倍数 6.2 倍仍在安全区间，但较去年有所下降。建议关注银行授信续期安排及现金流与偿债时序的匹配情况。

### 现金流质量
- 评估：🟡 建议进一步关注
- 关键指标：现金收益比 = HK$1,456,200 千 / HK$2,318,600 千 = 0.63；自由现金流 = HK$842,000 千（经营现金流 HK$1,456,200 千 - 资本支出 HK$614,200 千）；资本支出/折旧 = 2.1 倍
- 简短结论：现金收益比 0.63，低于通常 0.80 以上的健康阈值，盈利与现金流存在明显背离。应收账款及存货增加是主要原因。自由现金流为正，但资本支出较折旧高 2.1 倍，反映扩张性资本投入较为积极。建议深入了解应收账款账龄及收款周期变化原因。

### 营运能力
- 评估：🟡 建议进一步关注
- 关键指标：DSO = 68 天（2024: 50 天）；存货周转天数 = 42 天（2024: 38 天）；应付账款周转天数 = 55 天（2024: 58 天）；现金转换周期 = 55 天（2024: 30 天）
- 简短结论：应收账款周转天数同比延长约 18 天，现金转换周期由 30 天扩大至 55 天，营运资金占用显著增加。存货周转亦有所下降，整体营运效率下降值得关注。建议结合客户账期政策及存货管理情况作进一步说明。

### 成长性
- 评估：✅ 未发现明显异常
- 关键指标：营业收入同比 +12.3%；归母净利润同比 +6.8%；扣非净利润同比 +5.2%；经营性现金流同比 -8.4%
- 简短结论：收入端保持双位数增长，成长性尚可。净利润增速低于收入增速，反映利润弹性有所减弱。扣非净利润增速进一步放缓，需留意非经常性损益贡献比重。经营现金流同比下降且与收入增长形成背离，是本年度需持续关注的核心风险之一。

### 重大异常波动
- 评估：✅ 未发现明显异常
- 关键指标：商誉/净资产 = 28.4%；在建工程无长期挂账异常；其他应收款/总资产 = 2.1%；政府补助/净利润 = 3.6%；Beneish M-Score = N/A（数据不足）
- 简短结论：商誉占净资产约 28%，处于可接受范围，已披露减值测试情况。未见在建工程长期不转固异常。政府补助占净利润比例较低，非经常性损益依赖度有限。因部分应计项目数据未完整披露，M-Score 无法完整计算，建议关注应计项目比率的跨期变化。

### 持续经营与经营质量风险
- 评估：✅ 未发现明显异常
- 关键指标：短期借款/总债务 = 31%；一年内到期有息负债 HK$3,240,000 千 vs 货币资金 HK$4,520,000 千（覆盖 1.4 倍）；关联交易/营业收入 = 4.2%；审计意见：无保留意见
- 简短结论：审计师出具标准无保留意见，报告整体披露质量合规。一年内到期有息负债由货币资金基本覆盖，短期偿债压力相对可控。关联交易占比较低，未见明显利益输送信号。建议持续关注有息负债到期节奏与经营现金流的匹配情况。`

/* ───────────────────────────────────────────────────────────────
 *  Page
 * ──────────────────────────────────────────────────────────────*/

export default function ResultsPage() {
  const [result, setResult] = useState('')
  const [fileName, setFileName] = useState('')
  const [isDemo, setIsDemo] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [statuses, setStatuses] = useState<Record<string, Status>>({})

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const demo = params.get('demo') === 'true'
    setIsDemo(demo)
    if (demo) {
      setResult(DEMO_RESULT)
      setFileName('华晟科技集团 2025 年报（示例）')
      try {
        const raw = localStorage.getItem('finguard_issue_statuses_demo')
        if (raw) setStatuses(JSON.parse(raw))
      } catch {}
    } else {
      const fn = sessionStorage.getItem('fileName') || '财务报告'
      setResult(sessionStorage.getItem('analysisResult') || '')
      setFileName(fn)
      try {
        const raw = localStorage.getItem(`finguard_issue_statuses_${fn}`)
        if (raw) setStatuses(JSON.parse(raw))
      } catch {}
    }
  }, [])

  const setIssueStatus = (id: string, s: Status) => {
    setStatuses((prev) => {
      const next = { ...prev, [id]: s }
      try {
        const key = isDemo ? 'finguard_issue_statuses_demo' : `finguard_issue_statuses_${fileName}`
        localStorage.setItem(key, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const parsed = useMemo(() => parseResult(result), [result])

  const handleCopy = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* ─ 空结果 ─ */
  if (!result) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f6f8fb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: TEXT_PRIMARY,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <p style={{ color: TEXT_SECONDARY, marginBottom: '20px', fontSize: '14px' }}>
            未找到分析结果，请重新上传报告
          </p>
          <Link
            href="/analyze"
            style={{
              backgroundColor: BRAND_LIGHT,
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            返回工作台
          </Link>
        </div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; available: boolean; icon: string }[] = [
    { key: 'overview', label: '报告总览', available: !!parsed.overview, icon: '📑' },
    { key: 'review', label: '财务数据复核', available: !!parsed.review, icon: '🔢' },
    { key: 'health', label: '财务健康度分析', available: !!parsed.health, icon: '📊' },
  ]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
      {/* 顶部导航 */}
      <nav
        className="no-print"
        style={{
          backgroundColor: NAV_BG,
          color: '#e2e8f0',
          padding: '14px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Link
          href="/"
          style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: `linear-gradient(135deg, ${BRAND_LIGHT}, ${BRAND})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 800,
              fontSize: '12px',
            }}
          >
            FG
          </div>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>
            <span style={{ color: '#93c5fd' }}>Fin</span>
            <span style={{ color: '#ffffff' }}>Guard</span>
            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>
              AI 财务报告审阅平台
            </span>
          </div>
        </Link>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleCopy}
            style={{
              backgroundColor: copied ? '#10b981' : 'transparent',
              border: `1px solid ${copied ? '#10b981' : '#334155'}`,
              color: copied ? 'white' : '#cbd5e1',
              padding: '7px 14px',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {copied ? '✓ 已复制' : '复制原文'}
          </button>
          <button
            onClick={() => window.print()}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid #334155`,
              color: '#cbd5e1',
              padding: '7px 14px',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            导出 PDF
          </button>
          <Link
            href="/analyze"
            style={{
              backgroundColor: BRAND_LIGHT,
              color: 'white',
              padding: '7px 14px',
              borderRadius: '7px',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            重新分析
          </Link>
        </div>
      </nav>

      {/* 文件名条 */}
      <div
        className="no-print"
        style={{
          backgroundColor: '#ffffff',
          borderBottom: `1px solid ${BORDER}`,
          padding: '12px 32px',
          fontSize: '13px',
          color: TEXT_SECONDARY,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ color: TEXT_MUTED }}>当前报告：</span>
        <strong style={{ color: TEXT_PRIMARY }}>{fileName}</strong>
      </div>

      {/* 示例模式横幅 */}
      {isDemo && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            padding: '10px 32px',
            fontSize: '13px',
            color: '#92400e',
            fontWeight: 600,
          }}
        >
          📋 示例模式 — 以下为虚构演示数据，非真实分析结果
        </div>
      )}

      {/* Tab 切换 */}
      {parsed.isNewFormat && (
        <div
          className="no-print"
          style={{
            backgroundColor: '#ffffff',
            borderBottom: `1px solid ${BORDER}`,
            padding: '0 32px',
            display: 'flex',
            gap: '0',
            position: 'sticky',
            top: 0,
            zIndex: 5,
          }}
        >
          {tabs.map((t) => {
            const active = activeTab === t.key
            return (
              <button
                key={t.key}
                onClick={() => t.available && setActiveTab(t.key)}
                disabled={!t.available}
                style={{
                  padding: '14px 18px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: t.available ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: active ? 700 : 600,
                  color: !t.available ? TEXT_FAINT : active ? BRAND : TEXT_SECONDARY,
                  borderBottom: active ? `2px solid ${BRAND_LIGHT}` : '2px solid transparent',
                  marginBottom: '-1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s',
                }}
              >
                <span>{t.icon}</span>
                {t.label}
                {!t.available && (
                  <span style={{ fontSize: '11px', color: TEXT_FAINT, marginLeft: '2px' }}>
                    （本次未生成）
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 32px 64px' }}>
        {!parsed.isNewFormat && <LegacyMarkdown text={result} />}

        {parsed.isNewFormat && activeTab === 'overview' && parsed.overview && (
          <OverviewView data={parsed.overview} />
        )}
        {parsed.isNewFormat && activeTab === 'review' && (
          <>
            {parsed.review && (
              <ReviewView data={parsed.review} statuses={statuses} setStatus={setIssueStatus} />
            )}
            {parsed.grammar && (
              <GrammarView data={parsed.grammar} statuses={statuses} setStatus={setIssueStatus} />
            )}
          </>
        )}
        {parsed.isNewFormat && activeTab === 'health' && parsed.health && (
          <HealthView data={parsed.health} />
        )}

        {parsed.isNewFormat &&
          ((activeTab === 'overview' && !parsed.overview) ||
            (activeTab === 'review' && !parsed.review && !parsed.grammar) ||
            (activeTab === 'health' && !parsed.health)) && (
            <div
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${BORDER}`,
                borderRadius: '14px',
                padding: '40px',
                textAlign: 'center',
                color: TEXT_MUTED,
                fontSize: '13px',
              }}
            >
              本次分析未生成此模块内容
            </div>
          )}
      </div>

      {/* 底部安抚 */}
      <footer
        className="no-print"
        style={{
          borderTop: `1px solid ${BORDER}`,
          backgroundColor: '#ffffff',
          padding: '20px 32px',
          textAlign: 'center',
          color: TEXT_MUTED,
          fontSize: '12px',
        }}
      >
        结果仅供参考，不构成正式财务意见。建议结合报告编制底稿进一步核实。
      </footer>
    </div>
  )
}
