import { NextRequest } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60 // Vercel Pro allows up to 300s, Hobby allows 60s
export const dynamic = 'force-dynamic'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ARK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY
    ? 'https://api.deepseek.com'
    : 'https://ark.cn-beijing.volces.com/api/v3',
})

const MODEL = process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'doubao-1-5-pro-32k-250115'

const DATA_REVIEW_PROMPT = `你是一名专业财务报告复核专家，运用穿透式复核法对财务报告进行深度检查，帮助企业财务团队在发布前识别数字错误与风险信号。

请严格按以下层级执行复核，然后输出三个部分：报告总览、数据核查、语法核查。

【识别层】报告画像
识别：适用准则（IFRS/HKFRS/CAS/US GAAP）/ 所用准则体系（如PCAOB/ISA等，如适用）/ 申报场景（上市/年报/半年报/招股书等，以及是否为草稿）/ 语系（中文/英文/英式/美式等）

【语言层】语言合规检查（结果输出至"语法核查"部分）
- 语系统一：英式/美式英语全文一致（拼写、日期格式、标点习惯）
- 语法扫描：主谓一致、标点、大小写、句式完整性
- 专业术语：无非正式表达、无中式英语、无口语化用词
- 法定声明完整性核验（如适用）

【数据层】算术核验与跨表勾稽（结果输出至"数据核查"部分）
- 实体名称与报表名称一致性（IFRS下不应使用"Balance Sheet"）
- 占位符检查：[date]、DRAFT水印、空白栏位
- 利润表：毛利→营业利润→税前利润→净利润各环节逐行验算；归属母公司/少数股东拆分之和等于合计
- 资产负债表：流动/非流动资产合计、总资产、流动/非流动负债合计、负债合计、权益合计；资产=负债+权益等式
- 股东权益变动表：每列期初+本期变动=期末；期末余额与资产负债表权益行勾稽
- 所有附注表格：纵向（列合计）和横向（期初+变动=期末）双维度核验；最小差异须追溯
- EPS重算：归属于普通股股东净利润/加权平均股数；Basic与Diluted分别重算
- 现金流量表：期末余额=资产负债表现金；三类活动+汇率影响=净变动；间接法起点=利润表净利润
- 跨表勾稽：净利润↔现金流量表起点↔权益变动表；NCI金额三处一致

---

输出格式（严格按以下三部分，不得增删）：

## 报告总览
| 项目 | 内容 |
|------|------|
| 适用准则 | [IFRS/HKFRS/CAS/US GAAP] |
| 审计准则 | [PCAOB/ISA/其他，如不适用填"不适用"] |
| 申报场景 | [具体场景，如有DRAFT则注明] |
| 语系 | [中文/英文（英式）/英文（美式）等] |

## 数据核查
（只列出发现的差异或问题。每条格式：[风险级别] 位置：[页码/附注编号] | 问题：[具体描述] | 建议：[处理建议]）
（风险级别：🔴 高风险 / 🟡 中等风险 / ⚪ 低风险/格式问题）
（如未发现任何问题，输出：✅ 全部通过
已核验：[逐项列出已检查内容，例如"利润表各层级加总关系、资产负债表平衡等式、现金流量表三类活动汇总与期末余额、跨表勾稽一致性"]，未发现差异。）

## 语法核查
（只列出发现的语言/语法问题。格式同上）
（如未发现任何问题，输出：✅ 全部通过
已检查：[逐项列出已检查内容，例如"语系一致性、主谓一致、专业术语规范性、法定声明完整性"]，无语言问题。）`

const FINANCIAL_ANALYSIS_PROMPT = `你是一名具备CAS和IFRS专业知识的财务分析师。请对以下财务报告进行财务健康状况评估，识别风险信号。

使用风险评级：🔴 高风险 / 🟡 中等风险 / ✅ 正常。数据不足时注明"N/A（数据不足）"。所有计算须列明公式和数字。

---

输出格式（严格以下列部分开头）：

## 财务健康度

### 财务比率分析

**流动性**
- 流动比率 = 流动资产/流动负债 [<1.0: 🔴, 1.0-1.5: 🟡, >1.5: ✅]
- 速动比率 = (流动资产-存货)/流动负债
- 现金比率 = 货币资金/流动负债
- 经营现金流比率 = 经营活动现金流/流动负债

**偿债能力**
- 资产负债率 = 负债总额/资产总额 [>70%: 🔴, 60-70%: 🟡, <60%: ✅]
- 利息保障倍数 = EBIT/利息支出 [<2倍: 🔴, 2-3倍: 🟡, >3倍: ✅]
- 净债务/EBITDA

**盈利能力**
- 毛利率% [同比下降趋势: 🟡]
- 净利率%
- ROE（杜邦分解：净利率×资产周转率×权益乘数）
- ROA

**营运效率**
- 应收账款周转天数 DSO = 应收账款/营收×365 [同比增幅>20%: 🟡]
- 存货周转天数 = 存货/营业成本×365
- 应付账款周转天数 = 应付账款/营业成本×365
- 现金转换周期 = DSO + 存货天数 - 应付天数

**现金流质量**
- 现金收益比 = 经营现金流/净利润 [连续2年<0.8: 🔴]
- 自由现金流 = 经营现金流 - 资本支出
- 资本支出/折旧比率

### 风险信号

**利润质量**
- 应计项目比率 = (净利润-经营现金流)/平均总资产 [>5%: 🔴]
- 营收与应收账款增速背离（营收平稳但应收快速增长: 🔴）

**Beneish M-Score分量**（数据可用时计算）
- DSRI（应收账款指数）> 1.465: 🔴
- GMI（毛利率指数）> 1.193: 🟡
- AQI（资产质量指数）/ SGI（营收增长指数）/ DEPI（折旧指数）/ LVGI（杠杆指数）/ TATA（总应计/总资产）
- 综合M-Score > -1.78: 存在较高利润操纵风险 🔴

**专项高风险科目**
- 在建工程：占总资产比例，多年未转固情况 [>20%且无转固: 🔴]
- 预付账款：同比增速vs营收增速，关联方占比
- 其他应收款：余额规模、无法解释的大额、关联方内容
- 商誉：占净资产比例，历史减值情况
- 政府补助/净利润比 [>30%: 🟡，非经常性收益掩盖经营亏损: 🔴]

**关联交易与债务结构**
- 关联方收入占总营收比例；关联方应收款坏账计提充分性
- 短期债务/总债务 [>60%: 🔴]；一年内到期有息债务vs货币资金（再融资风险）

### 综合评级
- 整体财务健康评级：🔴 高风险 / 🟡 中等风险 / ✅ 低风险
- 风险统计：🔴 高风险 X项 / 🟡 中等风险 X项 / ✅ 正常 X项
- 前三位关键风险因素（按严重程度排序）
- 前三位正面指标
- 总体评语：[一段话总结]`

export async function POST(request: NextRequest) {
  try {
    const { text, mode, standard } = await request.json()
    if (!text) return new Response('缺少报告文本', { status: 400 })

    const standardNote = standard ? `报告适用准则：${standard}\n\n` : ''

    let systemPrompt = ''
    let userMessage = ''

    if (mode === 'review') {
      systemPrompt = DATA_REVIEW_PROMPT
      userMessage = `${standardNote}请对以下财务报告文本执行完整数据复核，输出报告总览、数据核查、语法核查三个部分：\n\n${text}`
    } else if (mode === 'analysis') {
      systemPrompt = FINANCIAL_ANALYSIS_PROMPT
      userMessage = `${standardNote}请对以下财务报告文本执行完整财务健康度分析：\n\n${text}`
    } else {
      systemPrompt = `${DATA_REVIEW_PROMPT}\n\n---\n\n${FINANCIAL_ANALYSIS_PROMPT}`
      userMessage = `${standardNote}请对以下财务报告文本同时执行：\n1. 完整数据复核（输出：报告总览、数据核查、语法核查）\n2. 完整财务健康度分析（输出：财务健康度）\n\n财务报告文本：\n\n${text}`
    }

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 8192,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content
          if (text) controller.enqueue(encoder.encode(text))
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Analysis error:', msg)
    return new Response(`分析失败：${msg}`, { status: 500 })
  }
}
