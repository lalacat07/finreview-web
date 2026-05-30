import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { computeRatios, type FigureInput, type RatioReport } from '@/lib/ratios'

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
  "weightedShares": 加权平均普通股股数,
  "marketValueEquity": 股权市值(如披露),
  "prevRevenue": 上期营业收入,
  "prevNetProfitToParent": 上期归母净利润,
  "prevOperatingCashFlow": 上期经营活动现金流净额,
  "_pages": { "字段名": "出处" }
}`

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

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()
    if (!text) return Response.json({ error: '缺少报告文本' }, { status: 400 })

    // 主要报表通常在前部，取前段足以覆盖三大表
    const slice = String(text).slice(0, process.env.DEEPSEEK_API_KEY ? 80000 : 26000)

    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
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
    return Response.json({ figures, ratios, pages })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Figures extraction error:', msg)
    return Response.json({ error: `指标重算失败：${msg}` }, { status: 500 })
  }
}
