import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { computeRatios, type FigureInput, type RatioReport } from '@/lib/ratios'
import { checkDisclosures } from '@/lib/disclosure'
import { guard } from '@/lib/apiGuard'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ARK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY
    ? 'https://api.deepseek.com'
    : 'https://ark.cn-beijing.volces.com/api/v3',
})
const MODEL = process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'doubao-1-5-pro-32k-250115'

/* 仅做"取数"，不做"算数"。要求模型输出严格 JSON。 */
const EXTRACT_PROMPT = `你是财务报表数据抽取引擎。请从财务报告文本中抽取以下原始科目的本期数值，仅做取数，不要做任何计算或推断。

【严格要求】
- 只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块标记。
- 所有金额使用同一单位（元）。如报告以"千元/百万元/万元"列示，请换算为元后填写。
- 股数填实际股数（股）。
- 仅填写报告中能直接读到的数字；读不到的字段一律省略该键（不要填 0、不要编造）。
- 对每个填写的字段，在 "_pages" 对象中记录其页码/出处（字符串，如"第48页 合并资产负债表"）。

JSON 结构（所有字段可选）：
{
  "revenue": 营业收入,
  "grossProfit": 毛利,
  "operatingProfit": 营业利润,
  "profitBeforeTax": 利润总额,
  "netProfit": 净利润,
  "netProfitToParent": 归母净利润,
  "financeCost": 利息费用/财务费用中的利息支出,
  "totalAssets": 资产总计,
  "totalLiabilities": 负债合计,
  "totalEquity": 股东权益合计,
  "equityToParent": 归母股东权益,
  "currentAssets": 流动资产合计,
  "currentLiabilities": 流动负债合计,
  "inventory": 存货,
  "accountsReceivable": 应收账款,
  "accountsPayable": 应付账款,
  "cash": 货币资金,
  "retainedEarnings": 未分配利润(可加盈余公积),
  "shortTermDebt": 短期借款及一年内到期有息负债,
  "operatingCashFlow": 经营活动产生的现金流量净额,
  "capex": 购建固定资产无形资产等支付的现金,
  "depreciation": 本期折旧与摊销(固定资产折旧+无形资产摊销，现金流量表附表或附注),
  "ppeNet": 固定资产净额(账面价值),
  "sga": 销售费用与管理费用之和,
  "weightedShares": 加权平均普通股股数,
  "marketValueEquity": 股权市值(如披露),
  "prevRevenue": 上期营业收入,
  "prevNetProfit": 上期净利润,
  "prevNetProfitToParent": 上期归母净利润,
  "prevOperatingCashFlow": 上期经营活动现金流净额,
  "prevGrossProfit": 上期毛利,
  "prevAccountsReceivable": 上期应收账款,
  "prevCurrentAssets": 上期流动资产合计,
  "prevTotalAssets": 上期资产总计,
  "prevTotalLiabilities": 上期负债合计,
  "prevPpeNet": 上期固定资产净额,
  "prevDepreciation": 上期折旧与摊销,
  "prevSga": 上期销售费用与管理费用之和,
  "_pages": { "字段名": "出处" }
}

【取数提示】财务报告通常在同一张报表中并列列示"本期/上期"两列，请尽量同时取本期与上期数值（上期值用于盈余操纵与增长率分析）。折旧摊销多在现金流量表附表（间接法）或固定资产附注中。`

function safeParseJson(s: string): Record<string, unknown> | null {
  // 去掉可能的 ```json 包裹
  const cleaned = s.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * 多区段采样：三大表通常在报告前部，但折旧/固定资产/分部/关联方等关键附注常在后段。
 * 仅取前 N 字符会漏掉这些数据，导致 Beneish 等多期指标无法计算。
 * 策略：头部窗口（覆盖三大表）+ 按关键词定位若干附注窗口，去重拼接，控制在预算内。
 */
function sampleRelevantText(text: string, budget: number): string {
  if (text.length <= budget) return text
  const head = Math.min(text.length, Math.floor(budget * 0.6))
  const segments: Array<[number, number]> = [[0, head]]

  const keywords = [
    '折旧', '摊销', '固定资产', '使用权资产',
    '现金流量表补充资料', '将净利润调节', '间接法',
    '分部', '经营分部', '报告分部',
    '应收账款', '坏账', '预期信用损失',
    '关联方', '关联交易', '其他应收款',
    '销售费用', '管理费用',
  ]
  const win = 4000
  const remaining = budget - head
  let used = 0
  const lower = text
  for (const kw of keywords) {
    if (used >= remaining) break
    const idx = lower.indexOf(kw, head) // 只在头部窗口之后找，避免重复
    if (idx === -1) continue
    const start = Math.max(head, idx - 500)
    const end = Math.min(text.length, idx + win)
    segments.push([start, end])
    used += end - start
  }

  // 合并重叠区间并按序拼接
  segments.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (last && seg[0] <= last[1]) {
      last[1] = Math.max(last[1], seg[1])
    } else {
      merged.push([...seg] as [number, number])
    }
  }
  return merged.map(([s, e]) => text.slice(s, e)).join('\n\n…（节选）…\n\n').slice(0, budget)
}

export async function POST(request: NextRequest) {
  const blocked = guard(request, { limit: 15, windowMs: 60_000, name: 'figures' })
  if (blocked) return blocked
  try {
    const { text } = await request.json()
    if (!text) return Response.json({ error: '缺少报告文本' }, { status: 400 })

    // 多区段采样：头部三大表 + 按关键词定位的附注窗口
    const slice = sampleRelevantText(String(text), process.env.DEEPSEEK_API_KEY ? 80000 : 26000)

    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 3072,
      stream: false,
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: `请从以下财务报告文本抽取原始科目，输出严格 JSON：\n\n${slice}` },
      ],
    })
    const content = res.choices[0]?.message?.content || ''
    const parsed = safeParseJson(content)
    if (!parsed) {
      return Response.json({ error: '未能从报告中结构化抽取财务数据', figures: null, ratios: null })
    }

    const pages = (parsed['_pages'] as Record<string, string>) || {}
    delete (parsed as Record<string, unknown>)['_pages']

    // 仅保留数值字段
    const figures: FigureInput = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        ;(figures as Record<string, number>)[k] = v
      }
    }

    const ratios: RatioReport = computeRatios(figures)
    // 披露完备性清单：在全文上做确定性关键词扫描（不受 LLM 取数切片限制）
    const disclosure = checkDisclosures(String(text))
    return Response.json({ figures, ratios, pages, disclosure })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Figures extraction error:', msg)
    return Response.json({ error: `指标重算失败：${msg}` }, { status: 500 })
  }
}
