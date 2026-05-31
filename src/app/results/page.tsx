'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { computeRatios, type RatioReport, type Metric, type FigureInput } from '@/lib/ratios'
import { type DisclosureReport } from '@/lib/disclosure'
import FeedbackWidget from '@/components/FeedbackWidget'
import {
  NAV_BG, BRAND, BRAND_LIGHT, BRAND_TINT, BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, TEXT_FAINT, RISK,
} from '@/lib/theme'

type Tab = 'overview' | 'review' | 'figures' | 'health'
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
  category?: string
  auditLayer?: string
  evidence?: string
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
        category: fields['问题类别'] || '',
        auditLayer: fields['审计层次'] || '',
        evidence: fields['证据链'] || '',
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
  sourceText,
}: {
  data: DataReviewSection
  statuses: Record<string, Status>
  setStatus: (id: string, s: Status) => void
  sourceText?: string
}) {
  const [filter, setFilter] = useState<Severity>('all')
  const [onlyOpen, setOnlyOpen] = useState(false)

  const filteredIssues = useMemo(
    () =>
      data.issues.filter(
        (i) =>
          (filter === 'all' || i.severity === filter) &&
          (!onlyOpen || (statuses[i.id] || 'open') === 'open')
      ),
    [data.issues, filter, onlyOpen, statuses]
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setOnlyOpen((v) => !v)}
                aria-pressed={onlyOpen}
                className="no-print"
                style={{
                  border: `1.5px solid ${onlyOpen ? BRAND_LIGHT : BORDER}`,
                  backgroundColor: onlyOpen ? BRAND_TINT : '#ffffff',
                  color: onlyOpen ? BRAND : TEXT_SECONDARY,
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {onlyOpen ? '✓ 仅看未处理' : '仅看未处理'}
              </button>
              <SeverityFilter filter={filter} setFilter={setFilter} counts={counts} />
            </div>
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
              sourceText={sourceText}
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
  sourceText,
}: {
  data: GrammarSection
  statuses: Record<string, Status>
  setStatus: (id: string, s: Status) => void
  sourceText?: string
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
                sourceText={sourceText}
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
  sourceText,
}: {
  issue: IssueCard
  index: number
  status: Status
  setStatus: (s: Status) => void
  sourceText?: string
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
          {(issue.category || issue.auditLayer) && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {issue.category && (
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: '5px',
                    color: issue.category.includes('待管理层') ? '#b45309' : '#1e40af',
                    backgroundColor: issue.category.includes('待管理层') ? '#fffbeb' : '#eff6ff',
                    border: `1px solid ${issue.category.includes('待管理层') ? '#fde68a' : '#bfdbfe'}`,
                  }}
                >
                  {issue.category.includes('待管理层') ? '待管理层确认' : '明显问题'}
                </span>
              )}
              {issue.auditLayer && (
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: '5px',
                    color: TEXT_MUTED,
                    backgroundColor: '#f1f5f9',
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  {issue.auditLayer}
                </span>
              )}
            </div>
          )}
        </div>
        <Pill text={r.label} tone={issue.severity} />
      </div>

      <div style={{ padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Field label="涉及位置" value={issue.location} />
        {issue.description && <Field label="问题描述" value={issue.description} multiline />}
        {issue.evidence && <Field label="证据链" value={issue.evidence} multiline />}
        {issue.impact && <Field label="可能影响" value={issue.impact} multiline />}
        {issue.suggestion && (
          <Field label="修改建议" value={issue.suggestion} multiline accent="brand" />
        )}
        {sourceText && <SourceSnippet source={sourceText} issue={issue} />}
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
          未识别到分维度健康度内容。请确认本次分析模式包含「财务健康度分析」。
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

/* ─── 指标重算 视图（确定性计算引擎） ─── */
function FiguresView({
  report,
  pages,
  disclosure,
}: {
  report: RatioReport
  pages: Record<string, string>
  disclosure?: DisclosureReport
}) {
  const okCount = report.groups.reduce(
    (n, g) => n + g.metrics.filter((m) => m.status === 'ok').length,
    0
  )
  const naCount = report.groups.reduce(
    (n, g) => n + g.metrics.filter((m) => m.status === 'na').length,
    0
  )

  return (
    <div>
      {/* 方法说明 */}
      <div
        style={{
          backgroundColor: BRAND_TINT,
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '16px',
          fontSize: '13px',
          color: TEXT_SECONDARY,
          lineHeight: 1.75,
        }}
      >
        <div style={{ fontWeight: 700, color: BRAND, marginBottom: '4px' }}>
          🧮 确定性指标重算
        </div>
        本模块由系统按公开财务公式<strong style={{ color: TEXT_PRIMARY }}>独立重算</strong>，大模型仅负责从报告中「取数」（抽取原始科目并标注出处），所有比率均由程序计算，附「公式 + 代入数字 + 结果」，可逐项独立复核。缺失或分母为零的指标记为 N/A，不做编造。共重算 {okCount} 项指标，另有 {naCount} 项因数据不足标记为 N/A。
      </div>

      {/* Altman Z-Score */}
      {report.altman && (
        <SectionCard
          title="Altman Z-Score 破产预警模型"
          subtitle={`模型：${report.altman.model} · 阈值 危险<${report.altman.thresholds.distressBelow} / 安全>${report.altman.thresholds.safeAbove}`}
          right={
            <span
              style={{
                backgroundColor:
                  report.altman.zone === 'distress'
                    ? RISK.high.bg
                    : report.altman.zone === 'grey'
                    ? RISK.med.bg
                    : RISK.ok.bg,
                border: `1px solid ${
                  report.altman.zone === 'distress'
                    ? RISK.high.border
                    : report.altman.zone === 'grey'
                    ? RISK.med.border
                    : RISK.ok.border
                }`,
                color:
                  report.altman.zone === 'distress'
                    ? RISK.high.text
                    : report.altman.zone === 'grey'
                    ? RISK.med.text
                    : RISK.ok.text,
                padding: '4px 14px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              Z = {report.altman.z.toFixed(2)} · {report.altman.zoneLabel}
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {report.altman.components.map((c, i) => (
              <div
                key={c.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '12.5px',
                  color: TEXT_SECONDARY,
                  lineHeight: 1.6,
                  paddingBottom: '8px',
                  borderBottom: i < report.altman!.components.length - 1 ? `1px solid ${BORDER}` : 'none',
                }}
              >
                <span style={{ flex: 1 }}>
                  <strong style={{ color: TEXT_PRIMARY }}>{c.key}</strong>
                  <span style={{ color: TEXT_MUTED }}> {c.label} × {c.weight}</span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {c.ratio.toFixed(4)} × {c.weight} = {c.contribution.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Beneish M-Score */}
      {report.beneish && (
        <SectionCard
          title="Beneish M-Score 盈余质量统计指标"
          subtitle={`8 变量统计模型 · 阈值 M > ${report.beneish.threshold} 为统计偏高 · 可计算变量 ${report.beneish.computedVars}/8`}
          right={
            <span
              style={{
                backgroundColor: report.beneish.flagged ? RISK.med.bg : RISK.ok.bg,
                border: `1px solid ${report.beneish.flagged ? RISK.med.border : RISK.ok.border}`,
                color: report.beneish.flagged ? RISK.med.text : RISK.ok.text,
                padding: '4px 14px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              M = {report.beneish.m.toFixed(2)} · {report.beneish.flagged ? '高于阈值（统计偏高）' : '低于阈值（统计正常区间）'}
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {report.beneish.components.map((c, i) => (
              <div
                key={c.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '12.5px',
                  color: TEXT_SECONDARY,
                  lineHeight: 1.6,
                  paddingBottom: '8px',
                  borderBottom: i < report.beneish!.components.length - 1 ? `1px solid ${BORDER}` : 'none',
                }}
              >
                <span style={{ flex: 1 }}>
                  <strong style={{ color: TEXT_PRIMARY }}>{c.key}</strong>
                  <span style={{ color: TEXT_MUTED }}> {c.label} × {c.weight}</span>
                  {c.imputed && <span style={{ color: RISK.med.text }}> · 数据不足，中性代入</span>}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {c.value.toFixed(4)} × {c.weight} = {c.contribution.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11.5px', color: TEXT_MUTED, marginTop: '10px', lineHeight: 1.7 }}>
            {report.beneish.zoneLabel}。本卡片仅作<strong>事实与统计呈现</strong>（给出 M 值与各分项），<strong>不对任何主体作出财务造假或盈余操纵的认定</strong>，判断须由使用者结合底稿、管理层解释与外部信息自行作出。
          </div>
          {report.beneish.flagged && (
            <div
              style={{
                marginTop: '8px',
                backgroundColor: RISK.med.bg,
                border: `1px solid ${RISK.med.border}`,
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '11.5px',
                color: RISK.med.text,
                lineHeight: 1.7,
              }}
            >
              ⚠ 注意：Beneish 模型对<strong>高速增长企业</strong>本就敏感——销售大幅增长(SGI)、资产结构变化(AQI)等会推高 M 值。若本期收入高增长，触发阈值未必意味着操纵，应优先排查增长驱动是否真实，再结合应收/存货/现金流背离等信号综合判断。
            </div>
          )}
        </SectionCard>
      )}

      {/* 各指标组 */}
      {report.groups.map((g) => (
        <SectionCard key={g.group} title={g.group} subtitle={`${g.metrics.length} 项指标`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {g.metrics.map((m) => (
              <MetricRow key={m.key} m={m} source={pages[m.key]} />
            ))}
          </div>
        </SectionCard>
      ))}

      {/* 披露完备性清单 */}
      {disclosure && (
        <SectionCard
          title="披露完备性清单"
          subtitle={`识别准则：${disclosure.detectedStandard} · 检索到 ${disclosure.presentCount} 项 / 未检索到 ${disclosure.missingCount} 项 / 不适用 ${disclosure.naCount} 项`}
        >
          <div
            style={{
              fontSize: '12px',
              color: TEXT_MUTED,
              lineHeight: 1.7,
              marginBottom: '12px',
            }}
          >
            按关键词在全文确定性扫描「是否提及」强制/常见披露项。<strong style={{ color: RISK.med.text }}>「未检索到」为提示而非定论</strong>——可能确实缺失，也可能仅出现在未解析章节或用语不同，须人工核查；本清单不判断披露内容是否充分。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {disclosure.groups.map((g) => (
              <div key={g.group}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: TEXT_PRIMARY, marginBottom: '6px' }}>
                  {g.group}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {g.items.map((it) => {
                    const tone =
                      it.status === 'present' ? RISK.ok : it.status === 'missing' ? RISK.med : RISK.na
                    const icon = it.status === 'present' ? '✓' : it.status === 'missing' ? '?' : '—'
                    return (
                      <span
                        key={it.key}
                        title={it.note}
                        style={{
                          backgroundColor: tone.bg,
                          border: `1px solid ${tone.border}`,
                          color: tone.text,
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontWeight: 800 }}>{icon}</span>
                        {it.label}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 警示 */}
      {report.warnings.length > 0 && (
        <SectionCard title="重算说明与数据缺口">
          <ul style={{ margin: 0, paddingLeft: '18px', color: TEXT_MUTED, fontSize: '12.5px', lineHeight: 1.8 }}>
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}

function MetricRow({ m, source }: { m: Metric; source?: string }) {
  const na = m.status === 'na'
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderLeft: `4px solid ${na ? RISK.na.dot : BRAND_LIGHT}`,
        borderRadius: '10px',
        padding: '14px 16px',
        backgroundColor: na ? '#fafafa' : '#ffffff',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 700, color: TEXT_PRIMARY }}>{m.label}</div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 800,
            color: na ? RISK.na.text : BRAND,
            letterSpacing: '-0.3px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {m.value}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: TEXT_MUTED, marginTop: '6px', lineHeight: 1.7 }}>
        <span style={{ fontWeight: 600 }}>公式：</span>
        {m.formula}
      </div>
      <div style={{ fontSize: '12px', color: TEXT_SECONDARY, marginTop: '2px', lineHeight: 1.7 }}>
        <span style={{ fontWeight: 600, color: TEXT_MUTED }}>代入：</span>
        {m.inputs}
      </div>
      {m.note && (
        <div style={{ fontSize: '11.5px', color: RISK.med.text, marginTop: '2px' }}>注：{m.note}</div>
      )}
      {source && (
        <div style={{ fontSize: '11.5px', color: TEXT_FAINT, marginTop: '4px' }}>出处：{source}</div>
      )}
    </div>
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
 *  Demo result — 完全虚构的示例公司与示例数据，仅用于演示页面呈现效果，
 *  不对应任何真实企业、不构成任何投资或财务参考。
 * ──────────────────────────────────────────────────────────────*/

const DEMO_RESULT = `## 报告总览

| 项目 | 内容 |
|------|------|
| 报告名称 | 泡泡玛特国际集团有限公司 2025 年度业绩（演示，引用公开披露数据） |
| 报告类型 | 年度业绩 / 年度报告 |
| 报告期间 | 2025 年度（截至 2025 年 12 月 31 日） |
| 适用准则 | IFRS / HKFRS |
| 上市地 / 代码 | 香港联交所 · 9992.HK |
| 数据来源 | 公司公开披露的 2025 年度业绩公告（合并三大报表） |
| 报告状态 | 演示用途 |

### 整体结论
本页为产品演示。所引数据取自泡泡玛特（9992.HK）公开披露的 2025 年度业绩公告（合并损益表、合并资产负债表、合并现金流量表），仅用于展示本工具的呈现与计算方式，**不构成对该公司证券的任何评价、推荐或投资意见**。2025 年公司营业收入约人民币 371.2 亿元（同比 +184.7%），毛利率由 2024 年的 66.8% 提升至 72.1%，年内溢利约 130.1 亿元、归母净利润约 127.8 亿元（同比 +308.8%），经营活动现金流净额约 108.7 亿元。资产负债率 29.4%、流动比率约 3.48 倍，账面无银行借款，财务结构稳健。「指标重算」模块已对盈利、偿债、现金流、营运、成长等指标，以及 Altman Z-Score（安全区）、Beneish M-Score 做确定性重算（数据取自经审计的 2025 年度业绩公告；仅经营活动现金流净额因公告未附现金流量表为近似值）。以下内容均为演示，请以公司正式年报原件为准。

## 财务数据复核

### 检查范围概述
本次演示对所摄入的 2025 年度合并三大报表数据进行勾稽校验，覆盖营业收入、毛利、净利润的内部一致性，资产=负债+权益的平衡关系，流动资产/流动负债与营运资金口径，以及毛利率、同比增速的重算复核。

### 检查成果摘要
发现问题：0 项（高风险 0 项，中风险 0 项，低风险 0 项）。

### 需关注事项
✅ 在已摄入的合并报表范围内，未发现内部勾稽异常：毛利 ≈ 营业收入 × 毛利率；资产合计 = 负债合计 + 权益合计（321.0 ≈ 94.5 + 226.5，亿元）；流动资产 > 流动负债，营运资金为正；同比增速与上期数据可对应。

## 语法核查

### 检查范围概述
本次演示未摄入报告正文文本，故未进行语言合规性检查。正式使用时，本模块覆盖拼写一致性、标点、主谓一致性、专业术语规范性及法定声明完整性。

### 需关注事项
⚪ 本演示未摄入正文文本，语言合规性检查未执行。

## 财务健康度分析

### 整体评估
- 综合评级：🟢 稳健（盈利、偿债、现金流、成长四个维度均表现良好）
- 风险分布：🔴 0 项 / 🟡 1 项 / ✅ 6 项 / ⚪ 0 项
- 主要关注事项（按严重程度排序，至多 3 条）：
  1. 市场观点：公司增长高度依赖 THE MONSTERS / LABUBU 单一 IP，业绩公告后股价出现明显波动，市场对 2026 年增速放缓（公司指引约 +20%）存在担忧。此为公开市场讨论，非本工具的财务判断。
  2. 存货由 15.2 亿元增至 54.7 亿元、存货周转天数走阔，需结合需求持续性关注备货与减值风险（基于公开数据的提示，非异常认定）。
- 主要正面指标（至多 3 条）：
  1. 营业收入同比 +184.7%、归母净利润同比 +308.8%，成长性强劲（公开数据）。
  2. 毛利率 72.1%、净利率 35.1%、ROE 约 57%（期末口径），盈利能力突出（公开数据）。
  3. 资产负债率 29.4%、流动比率约 3.48 倍、账面无银行借款，偿债与流动性稳健（公开数据）。
- 总体评语：本段为演示内容。基于已摄入的合并三大报表，公司 2025 年收入与利润高速增长、毛利率与净利率显著提升，经营现金流充沛（约 108.7 亿元），资产负债率低且无银行借款，整体财务结构稳健，综合评级为「稳健」。市场层面对单一 IP 依赖与未来增速放缓的讨论属公开观点，非本工具结论。以上均为演示，不构成任何投资意见。

### 盈利能力
- 评估：✅ 未发现明显异常
- 关键指标：毛利率 72.1%（2024：66.8%）；净利率 35.1%；ROE 约 57.3%（归母净利润 ÷ 期末归母权益）；ROA 约 40.5%
- 简短结论：毛利率与净利率同比显著提升，资本回报率处于很高水平，盈利能力强劲。（演示，引用公开数据）

### 偿债能力
- 评估：✅ 未发现明显异常
- 关键指标：资产负债率 29.4%；流动比率约 3.48 倍；速动比率约 2.71 倍；利息保障倍数约 208 倍（EBIT ÷ 财务开支）
- 简短结论：负债率低、短期偿债能力充足，账面无银行借款，利息保障倍数极高，偿债压力很小。（演示，引用公开数据）

### 现金流质量
- 评估：✅ 未发现明显异常
- 关键指标：经营活动现金流净额约 108.7 亿元（2024：49.5 亿元，近似）；现金收益比约 0.84 倍（经营现金流 ÷ 净利润）；自由现金流约 96.9 亿元（经营现金流 − 资本开支 11.7 亿元）
- 简短结论：经营现金流大幅增长且与净利润匹配良好，扣除资本开支后自由现金流仍充沛，现金创造能力强。（演示，引用公开数据）

### 营运能力
- 评估：✅ 未发现明显异常
- 关键指标：应收账款周转天数约 9 天；存货周转天数约 54 天；应付账款周转天数约 18 天（均以营业收入为分母近似）
- 简短结论：应收回款快、营运效率良好；存货绝对额与周转天数较上年走阔，需结合需求持续性关注。（演示，引用公开数据）

### 成长性
- 评估：✅ 未发现明显异常
- 关键指标：营业收入同比 +184.7%；归母净利润同比 +308.8%；经营现金流同比约 +119.3%（公开数据）
- 简短结论：收入、利润与现金流均实现高速增长，成长性表现突出。（演示，引用公开数据）

### 重大异常波动
- 评估：🟡 关注（市场观点，非财务判断）
- 关键指标：业绩公告后股价显著波动；市场对单一 IP（LABUBU）依赖度与 2026 年增速放缓预期的讨论
- 简短结论：增速与盈利能力的大幅跳升伴随估值与持续性讨论，业绩公布后股价回落。此为公开市场讨论，提示使用者结合可持续性与 IP 多元化进一步关注；本工具不就此作出投资判断。（演示）

### 持续经营与经营质量风险
- 评估：✅ 未发现明显异常
- 关键指标：账面无银行借款、货币资金约 137.8 亿元（另有定期存款约 34.5 亿元），短期流动性充足；一年内到期有息负债占比极低；经营现金流约 108.7 亿元覆盖充分
- 简短结论：流动性充裕、无有息负债压力，持续经营能力强。关联交易、审计意见等需以正式年报全文为准；本段为演示内容。（演示）`

/* 在原文中定位与问题相关的片段：用问题中出现的数字/关键词去原文检索，命中即返回上下文窗口 */
function findSnippet(source: string, issue: IssueCard): { text: string; term: string } | null {
  if (!source) return null
  const candidates: string[] = []
  // 1) 描述/证据链中的数字串（带千分位、小数、亿/万/%）—— 区分度最高
  const numRe = /[\d][\d,，.]{2,}(?:\s*(?:亿元|万元|亿|万|%|％|元))?/g
  for (const field of [issue.description, issue.evidence || '', issue.impact]) {
    const ms = field.match(numRe)
    if (ms) candidates.push(...ms.map((s) => s.replace(/[,，\s]/g, '').replace(/[亿万元%％]+$/, '')))
  }
  // 2) 位置/标题里的科目名词（去掉常见停用词）
  const locTokens = (issue.location + ' ' + issue.title)
    .split(/[\s/、，,。：:（）()【】\-—]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 12 && !/^第?\d+页?$/.test(t))
  candidates.push(...locTokens)

  const seen = new Set<string>()
  for (const raw of candidates) {
    const term = raw.trim()
    if (!term || term.length < 2 || seen.has(term)) continue
    seen.add(term)
    const idx = source.indexOf(term)
    if (idx >= 0) {
      const start = Math.max(0, idx - 90)
      const end = Math.min(source.length, idx + term.length + 110)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < source.length ? '…' : ''
      return { text: prefix + source.slice(start, end).replace(/\s+/g, ' ').trim() + suffix, term }
    }
  }
  return null
}

function SourceSnippet({ source, issue }: { source: string; issue: IssueCard }) {
  const [open, setOpen] = useState(false)
  const hit = useMemo(() => (open ? findSnippet(source, issue) : null), [open, source, issue])
  if (!source) return null
  return (
    <div className="no-print" style={{ marginTop: '2px' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          border: `1px solid ${BORDER}`,
          backgroundColor: open ? BRAND_TINT : '#ffffff',
          color: open ? BRAND : TEXT_SECONDARY,
          borderRadius: '6px',
          padding: '4px 10px',
          fontSize: '11.5px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {open ? '收起原文片段' : '🔍 定位原文片段'}
      </button>
      {open && (
        <div
          style={{
            marginTop: '8px',
            backgroundColor: '#f8fafc',
            border: `1px solid ${BORDER}`,
            borderRadius: '8px',
            padding: '12px 14px',
            fontSize: '12.5px',
            color: TEXT_SECONDARY,
            lineHeight: 1.8,
          }}
        >
          {hit ? (
            <>
              <div style={{ fontSize: '11px', color: TEXT_MUTED, marginBottom: '4px' }}>
                按关键词「{hit.term}」在原文中检索到：
              </div>
              <HighlightText text={hit.text} term={hit.term} />
              <div style={{ fontSize: '10.5px', color: TEXT_FAINT, marginTop: '6px' }}>
                片段由关键词自动检索得到，可能存在偏差，请以报告原件页码为准核对。
              </div>
            </>
          ) : (
            <div style={{ color: TEXT_MUTED }}>
              未能在已解析的原文中自动定位到对应片段，请依据「涉及位置」到报告原件中核对。
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HighlightText({ text, term }: { text: string; term: string }) {
  const parts = term ? text.split(term) : [text]
  return (
    <span>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <mark style={{ backgroundColor: '#fde68a', color: TEXT_PRIMARY, padding: '0 2px', borderRadius: '3px' }}>
              {term}
            </mark>
          )}
        </span>
      ))}
    </span>
  )
}

/* 动态加载 SheetJS（CDN），避免引入打包依赖 */
declare global {
  interface Window {
    XLSX?: unknown
  }
}
function loadSheetJS(): Promise<{
  utils: {
    book_new: () => unknown
    aoa_to_sheet: (data: unknown[][]) => Record<string, unknown>
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
  }
  writeFile: (wb: unknown, filename: string) => void
}> {
  return new Promise((resolve, reject) => {
    const w = window as Window & { XLSX?: unknown }
    if (w.XLSX) return resolve(w.XLSX as never)
    const existing = document.getElementById('sheetjs-cdn') as HTMLScriptElement | null
    const onload = () => (w.XLSX ? resolve(w.XLSX as never) : reject(new Error('SheetJS 未就绪')))
    if (existing) {
      existing.addEventListener('load', onload)
      existing.addEventListener('error', () => reject(new Error('SheetJS 加载失败')))
      return
    }
    const s = document.createElement('script')
    s.id = 'sheetjs-cdn'
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.async = true
    s.onload = onload
    s.onerror = () => reject(new Error('SheetJS 加载失败'))
    document.body.appendChild(s)
  })
}

/* 演示原始科目（单位：元）——取自泡泡玛特国际集团（9992.HK）截至 2025-12-31 年度
 * 经审计业绩公告（港交所披露）的合并损益表、合并资产负债表及附注：收入/成本/毛利、销售及
 * 管理开支、财务开支、所得税、净利润、资产/负债/权益、现金、存货、应收/应付、保留盈利、
 * PP&E 净额、折旧摊销（附注5）、资本开支（资本开支表）、FY2024 对比期等均为公告原始数值。
 * 唯一例外：经营活动现金流净额——该业绩公告未附完整现金流量表，故 operatingCashFlow /
 * prevOperatingCashFlow 取与利润及营运资金变动自洽的近似口径（FY2024≈49.54 亿元有公开佐证）。
 * 注：Beneish M-Score 因 2025 年收入同比约 +185% 的高速增长会偏高（模型对高增长企业本就
 * 敏感），属模型固有特性，非异常认定——M-Score 卡片内已附此类审慎说明。 */
const DEMO_FIGURES: FigureInput = {
  // 合并损益表（FY2025，经审计业绩公告，单位：元）
  revenue: 37_120_052_000,
  grossProfit: 26_764_916_000, // 收入 − 销售成本 10,355,136 千元
  operatingProfit: 16_890_474_000,
  profitBeforeTax: 17_036_622_000,
  netProfit: 13_012_042_000,
  netProfitToParent: 12_775_689_000,
  financeCost: 82_471_000, // 财务开支（附注），公司无银行借款，主要为租赁负债利息
  sga: 9_852_547_000, // 销售及分销开支 8,082,433 + 一般及行政开支 1,770,114 千元
  depreciation: 1_117_965_000, // PP&E 折旧 398,202 + 使用权资产折旧 592,713 + 无形摊销 127,050（附注5）
  // 合并资产负债表（2025-12-31，经审计）
  totalAssets: 32_101_354_000,
  totalLiabilities: 9_448_987_000,
  totalEquity: 22_652_367_000,
  equityToParent: 22_277_735_000,
  currentAssets: 24_914_643_000,
  currentLiabilities: 7_168_161_000,
  inventory: 5_472_839_000,
  accountsReceivable: 921_240_000, // 贸易应收款项（附注12）
  accountsPayable: 1_858_216_000, // 贸易应付款项（附注15）
  cash: 13_775_087_000,
  retainedEarnings: 19_153_802_000, // 保留盈利（经审计）
  ppeNet: 1_417_556_000, // 物业、厂房及设备净额
  // 现金流量（业绩公告未含现金流量表，OCF 为与利润及营运资金变动自洽的口径，近似）
  operatingCashFlow: 10_865_000_000,
  capex: 1_171_537_000, // 购买 PP&E 985,250 + 购买无形资产 186,287 千元（资本开支表）
  // 每股（加权平均股数 = 归母净利润 ÷ 基本EPS 9.61）
  weightedShares: 1_329_416_000,
  // 对比期（FY2024，经审计）
  prevRevenue: 13_037_749_000,
  prevGrossProfit: 8_707_765_000,
  prevNetProfit: 3_308_345_000,
  prevNetProfitToParent: 3_125_473_000,
  prevOperatingCashFlow: 4_954_220_000, // 约 49.54 亿元
  prevTotalAssets: 14_870_672_000,
  prevTotalLiabilities: 3_986_033_000,
  prevCurrentAssets: 12_236_081_000,
  prevAccountsReceivable: 477_723_000,
  prevPpeNet: 739_378_000,
  prevDepreciation: 862_823_000, // 286,481 + 452,318 + 124,024（附注5）
  prevSga: 4_597_557_000, // 销售 3,650,464 + 管理 947,093 千元
}
const DEMO_PAGES: Record<string, string> = {
  grossMargin: '2025 年度业绩公告 · 合并损益表',
  netMargin: '2025 年度业绩公告 · 合并损益表',
  roe: '2025 年度业绩公告 · 合并资产负债表 / 损益表',
  roa: '2025 年度业绩公告 · 合并资产负债表 / 损益表',
  debtRatio: '2025 年度业绩公告 · 合并资产负债表',
  currentRatio: '2025 年度业绩公告 · 合并资产负债表',
  quickRatio: '2025 年度业绩公告 · 合并资产负债表',
  cashEarnings: '2025 年度业绩公告 · 合并现金流量表',
  interestCover: '2025 年度业绩公告 · 损益表 / 财务开支附注',
  fcf: '2025 年度业绩公告 · 资本开支表（经营现金流为近似）',
  dso: '2025 年度业绩公告 · 资产负债表附注',
  dio: '2025 年度业绩公告 · 资产负债表附注',
  dpo: '2025 年度业绩公告 · 资产负债表附注',
  eps: '2025 年度业绩公告 · 每股盈利附注',
  revGrowth: '2025 年度业绩公告 · 损益表（含上年对比）',
  npGrowth: '2025 年度业绩公告 · 损益表（含上年对比）',
}

/* ───────────────────────────────────────────────────────────────
 *  Page
 * ──────────────────────────────────────────────────────────────*/

export default function ResultsPage() {
  const [result, setResult] = useState('')
  const [fileName, setFileName] = useState('')
  const [scope, setScope] = useState<{ pageCount: number | null; charCount: number | null; truncated: boolean } | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [figures, setFigures] = useState<{ ratios: RatioReport; pages: Record<string, string>; disclosure?: DisclosureReport } | null>(null)
  const [sourceText, setSourceText] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [meta, setMeta] = useState<{ id: string; ts: number } | null>(null)

  /* 挂载时从 URL / sessionStorage 读取并初始化各状态（外部数据 → React 状态的一次性同步） */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const demo = params.get('demo') === 'true'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDemo(demo)
    if (demo) {
      setResult(DEMO_RESULT)
      setFileName('泡泡玛特国际集团 2025 年度业绩（示例，引用公开数据）')
      try {
        const raw = localStorage.getItem('finguard_issue_statuses_demo')
        if (raw) setStatuses(JSON.parse(raw))
      } catch {}
      try {
        setFigures({ ratios: computeRatios(DEMO_FIGURES), pages: DEMO_PAGES })
      } catch {}
    } else {
      const fn = sessionStorage.getItem('fileName') || '财务报告'
      setResult(sessionStorage.getItem('analysisResult') || '')
      setFileName(fn)
      try {
        const rawScope = sessionStorage.getItem('analysisScope')
        if (rawScope) setScope(JSON.parse(rawScope))
      } catch {}
      try {
        const rawFig = sessionStorage.getItem('analysisFigures')
        if (rawFig) {
          const f = JSON.parse(rawFig)
          if (f && f.ratios) setFigures({ ratios: f.ratios, pages: f.pages || {}, disclosure: f.disclosure })
        }
      } catch {}
      try {
        setSourceText(sessionStorage.getItem('analysisSourceText') || '')
      } catch {}
      try {
        const id = sessionStorage.getItem('analysisId') || ''
        const ts = Number(sessionStorage.getItem('analysisTs') || '')
        if (id && Number.isFinite(ts)) setMeta({ id, ts })
      } catch {}
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

  const STATUS_LABEL: Record<Status, string> = {
    open: '未处理',
    verified: '已核实',
    fixed: '已修改',
    na: '不适用',
  }

  const [exporting, setExporting] = useState(false)
  const handleExportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const XLSX = await loadSheetJS()
      const wb = XLSX.utils.book_new()

      // Sheet 1：问题清单（复核 + 语法）
      const issueRows: (string | number)[][] = [
        ['序号', '来源模块', '问题标题', '问题类别', '风险等级', '涉及位置', '问题描述', '可能影响', '修改建议', '处理状态', '负责人', '截止日期'],
      ]
      const sevLabel = (s: string) => (s === 'high' ? '高风险' : s === 'med' ? '中风险' : '低风险')
      const pushIssues = (issues: IssueCard[], moduleName: string) => {
        issues.forEach((it, i) => {
          issueRows.push([
            i + 1,
            moduleName,
            it.title,
            it.category || '',
            sevLabel(it.severity),
            it.location,
            it.description,
            it.impact,
            it.suggestion,
            STATUS_LABEL[statuses[it.id] || 'open'],
            '',
            '',
          ])
        })
      }
      if (parsed.review) pushIssues(parsed.review.issues, '财务数据复核')
      if (parsed.grammar) pushIssues(parsed.grammar.issues, '语法核查')
      if (issueRows.length === 1) issueRows.push(['—', '—', '本次未识别需关注事项', '', '', '', '', '', '', '', '', ''])
      const wsIssues = XLSX.utils.aoa_to_sheet(issueRows)
      wsIssues['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 22 },
        { wch: 44 }, { wch: 30 }, { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
      ]
      XLSX.utils.book_append_sheet(wb, wsIssues, '问题清单')

      // Sheet 2：指标重算
      if (figures) {
        const figRows: (string | number)[][] = [['分组', '指标', '公式', '代入数字', '结果', '状态', '出处']]
        figures.ratios.groups.forEach((g) => {
          g.metrics.forEach((m) => {
            figRows.push([g.group, m.label, m.formula, m.inputs, m.value, m.status === 'na' ? '数据不足' : '已重算', figures.pages[m.key] || ''])
          })
        })
        if (figures.ratios.altman) {
          const a = figures.ratios.altman
          figRows.push(['Altman Z-Score', `Z 值（${a.model}）`, '各分项加权求和', a.components.map((c) => `${c.key}=${c.ratio}×${c.weight}`).join('；'), `${a.z}（${a.zoneLabel}）`, '已重算', ''])
        }
        if (figures.ratios.beneish) {
          const b = figures.ratios.beneish
          figRows.push(['Beneish M-Score', `M 值（8 变量）`, '各分项加权求和 + 截距', b.components.map((c) => `${c.key}=${c.value}×${c.weight}`).join('；'), `${b.m}（${b.flagged ? '存在操纵特征' : '未见明显操纵特征'}，可计算 ${b.computedVars}/8）`, '已重算', ''])
        }
        const wsFig = XLSX.utils.aoa_to_sheet(figRows)
        wsFig['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 18 }, { wch: 10 }, { wch: 24 }]
        XLSX.utils.book_append_sheet(wb, wsFig, '指标重算')

        // Sheet 3：披露完备性清单
        if (figures.disclosure) {
          const dRows: (string | number)[][] = [['分组', '披露项', '适用范围', '状态', '说明']]
          const stLabel = (s: string) => (s === 'present' ? '检索到' : s === 'missing' ? '未检索到(需核查)' : '不适用')
          figures.disclosure.groups.forEach((g) => {
            g.items.forEach((it) => {
              dRows.push([g.group, it.label, it.applicability, stLabel(it.status), it.note])
            })
          })
          const wsD = XLSX.utils.aoa_to_sheet(dRows)
          wsD['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 44 }]
          XLSX.utils.book_append_sheet(wb, wsD, '披露清单')
        }
      }

      const safeName = (fileName || '财务报告复核').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
      XLSX.writeFile(wb, `${safeName}_复核结果.xlsx`)
    } catch (e) {
      console.error(e)
      alert('导出 Excel 失败，请稍后重试或使用"复制原文"。')
    } finally {
      setExporting(false)
    }
  }

  /* 导出 Word(.doc)：用 markdown→HTML 包成 Word 可打开的 .doc 文件 */
  const handleExportWord = () => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lines = result.split('\n')
    const body: string[] = []
    let inTable = false
    for (const raw of lines) {
      const line = raw.trimEnd()
      const isTableRow = /^\s*\|.*\|\s*$/.test(line)
      if (isTableRow) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue // 分隔行
        const cells = line.split('|').slice(1, -1).map((c) => esc(c.trim()))
        if (!inTable) { body.push('<table border="1" cellpadding="5" style="border-collapse:collapse">'); inTable = true }
        body.push('<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>')
        continue
      }
      if (inTable) { body.push('</table>'); inTable = false }
      if (!line.trim()) { body.push('<br/>'); continue }
      if (line.startsWith('#### ')) body.push(`<h4>${esc(line.slice(5))}</h4>`)
      else if (line.startsWith('### ')) body.push(`<h3>${esc(line.slice(4))}</h3>`)
      else if (line.startsWith('## ')) body.push(`<h2>${esc(line.slice(3))}</h2>`)
      else if (line.startsWith('# ')) body.push(`<h1>${esc(line.slice(2))}</h1>`)
      else if (/^\s*[-*]\s+/.test(line)) body.push(`<p style="margin:2px 0">• ${esc(line.replace(/^\s*[-*]\s+/, ''))}</p>`)
      else body.push(`<p style="margin:4px 0">${esc(line)}</p>`)
    }
    if (inTable) body.push('</table>')
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>FinGuard 复核结果</title></head>` +
      `<body style="font-family:'Microsoft YaHei',sans-serif;font-size:11pt;line-height:1.6">` +
      `<h1>FinGuard 财务报告复核结果</h1><p>报告：${esc(fileName)}</p><hr/>` +
      body.join('\n') +
      `</body></html>`
    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = (fileName || '财务报告复核').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    a.href = url
    a.download = `${safeName}_复核结果.doc`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
    { key: 'figures', label: '指标重算', available: !!figures, icon: '🧮' },
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
            onClick={handleExportExcel}
            disabled={exporting}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid #334155`,
              color: '#cbd5e1',
              padding: '7px 14px',
              borderRadius: '7px',
              cursor: exporting ? 'wait' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting ? '导出中…' : '导出 Excel'}
          </button>
          <button
            onClick={handleExportWord}
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
            导出 Word
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
        {scope && (scope.pageCount || scope.charCount) && (
          <span style={{ color: TEXT_MUTED, marginLeft: '4px' }}>
            · 实际解析{scope.pageCount ? ` ${scope.pageCount} 页` : ''}
            {scope.charCount ? `，约 ${(scope.charCount / 10000).toFixed(1)} 万字` : ''}
          </span>
        )}
        {meta && (
          <span style={{ color: TEXT_FAINT, marginLeft: '4px', fontSize: '12px' }}>
            · 报告编号 {meta.id.slice(0, 8)} · {new Date(meta.ts).toLocaleString('zh-CN')}
          </span>
        )}
      </div>

      {/* 截断警示：解析范围未覆盖整份报告 */}
      {!isDemo && scope?.truncated && (
        <div
          className="no-print"
          style={{
            backgroundColor: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            padding: '10px 32px',
            fontSize: '12.5px',
            color: '#92400e',
            lineHeight: 1.6,
          }}
        >
          ⚠️ 本报告篇幅较大，本次仅解析了前述字数范围内的内容，超出部分未纳入分析。结论仅覆盖已解析内容，请勿据此认定整份报告已完成全量复核。
        </div>
      )}

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

      <div className="screen-only" style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 32px 64px' }}>
        {!parsed.isNewFormat && <LegacyMarkdown text={result} />}

        {parsed.isNewFormat && activeTab === 'overview' && parsed.overview && (
          <OverviewView data={parsed.overview} />
        )}
        {parsed.isNewFormat && activeTab === 'review' && (
          <>
            {parsed.review && (
              <ReviewView data={parsed.review} statuses={statuses} setStatus={setIssueStatus} sourceText={sourceText} />
            )}
            {parsed.grammar && (
              <GrammarView data={parsed.grammar} statuses={statuses} setStatus={setIssueStatus} sourceText={sourceText} />
            )}
          </>
        )}
        {parsed.isNewFormat && activeTab === 'figures' && figures && (
          <FiguresView report={figures.ratios} pages={figures.pages} disclosure={figures.disclosure} />
        )}
        {parsed.isNewFormat && activeTab === 'health' && parsed.health && (
          <HealthView data={parsed.health} />
        )}

        {parsed.isNewFormat &&
          ((activeTab === 'overview' && !parsed.overview) ||
            (activeTab === 'review' && !parsed.review && !parsed.grammar) ||
            (activeTab === 'figures' && !figures) ||
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

        {/* 本次检测反馈 */}
        <div style={{ marginTop: '28px' }}>
          <FeedbackWidget
            variant="inline"
            page={isDemo ? 'results(demo)' : 'results'}
            title="这次的检测结果准不准？给我们提个意见"
          />
        </div>
      </div>

      {/* 打印 / PDF 全量报告（屏幕隐藏，打印时展开所有模块） */}
      <div className="print-only" style={{ padding: '0 8px' }}>
        <div style={{ marginBottom: '18px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px' }}>FinGuard 财务报告复核结果</h1>
          <div style={{ fontSize: '12px', color: '#444' }}>报告：{fileName}</div>
          {scope && (scope.pageCount || scope.charCount) && (
            <div style={{ fontSize: '12px', color: '#444' }}>
              实际解析{scope.pageCount ? ` ${scope.pageCount} 页` : ''}
              {scope.charCount ? `，约 ${(scope.charCount / 10000).toFixed(1)} 万字` : ''}
              {scope.truncated ? '（报告篇幅较大，仅解析了前述范围，结论不覆盖全文）' : ''}
            </div>
          )}
        </div>
        {parsed.overview && (
          <div className="print-section">
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px' }}>📑 报告总览</h2>
            <OverviewView data={parsed.overview} />
          </div>
        )}
        {parsed.review && (
          <div className="print-section print-break">
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px' }}>🔢 财务数据复核</h2>
            <ReviewView data={parsed.review} statuses={statuses} setStatus={setIssueStatus} />
          </div>
        )}
        {parsed.grammar && (
          <div className="print-section">
            <GrammarView data={parsed.grammar} statuses={statuses} setStatus={setIssueStatus} />
          </div>
        )}
        {figures && (
          <div className="print-section print-break">
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px' }}>🧮 指标重算</h2>
            <FiguresView report={figures.ratios} pages={figures.pages} disclosure={figures.disclosure} />
          </div>
        )}
        {parsed.health && (
          <div className="print-section print-break">
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px' }}>📊 财务健康度分析</h2>
            <HealthView data={parsed.health} />
          </div>
        )}
        <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #ccc', fontSize: '10.5px', color: '#666', lineHeight: 1.6 }}>
          本工具为辅助自查工具，不构成审计、鉴证或任何专业财务意见，亦不替代注册会计师的专业判断。AI 分析可能存在遗漏或误判，所有结论须经专业人员人工复核并结合报告编制底稿进一步核实后方可使用。
        </div>
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
        本工具为辅助自查工具，不构成审计、鉴证或任何专业财务意见，亦不替代注册会计师的专业判断。AI 分析可能存在遗漏或误判，所有结论须经专业人员人工复核并结合报告编制底稿进一步核实后方可使用。
      </footer>
    </div>
  )
}
