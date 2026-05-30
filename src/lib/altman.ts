/**
 * Altman Z-Score —— 破产 / 持续经营预警模型（纯 TS 实现，确定性、可复核）
 *
 * 公式口径对齐 Altman 原始论文及 FinanceToolkit 开源实现，便于在审计平台中标注
 * "采用 Altman 开源公式"，无需自证。本模块只做计算，不取数、不依赖任何外部库。
 *
 * 三种模型变体：
 *  - 'original' (Z, 1968)   上市制造业。X4 用「股权市值」。
 *  - 'private'  (Z', 1983)  非上市企业。X4 用「股东权益账面值」。
 *  - 'em'       (Z'', 1995) 非制造业 / 新兴市场。剔除 X5（资产周转），X4 用账面值。
 *
 * 选型建议（FinReview 客户多为 A 股 / H 股、且常无可靠市值）：
 *  - 非上市或缺市值     → 'private'
 *  - 非制造业 / 服务/消费 → 'em'（最广谱，默认推荐）
 *  - 上市制造业且有市值   → 'original'
 */

export type AltmanModel = 'original' | 'private' | 'em'
export type AltmanZone = 'safe' | 'grey' | 'distress'

/**
 * 计算所需的科目输入（单位需统一，币种需统一；本模块不做换币种 / 单位换算）。
 *
 * 中文财报（CAS / HKFRS）科目映射参考：
 *  totalAssets        资产总计 / Total assets
 *  totalLiabilities   负债合计 / Total liabilities
 *  workingCapital     营运资金 = 流动资产合计 − 流动负债合计
 *                     (current assets − current liabilities)
 *  retainedEarnings   未分配利润（+ 盈余公积，按口径）/ Retained earnings
 *  ebit               息税前利润 = 利润总额 + 利息支出
 *                     (Profit before tax + Finance costs/Interest expense)
 *                     若仅有营业利润，可作近似但需注明口径
 *  sales              营业收入 / Revenue（'em' 模型不使用）
 *  marketValueEquity  股权市值（仅 'original' 用；上市公司=收盘价×总股本）
 *  bookValueEquity    股东权益合计（'private' / 'em' 用 X4）
 */
export interface AltmanInput {
  totalAssets: number
  totalLiabilities: number
  workingCapital: number
  retainedEarnings: number
  ebit: number
  sales?: number
  marketValueEquity?: number
  bookValueEquity?: number
}

export interface AltmanComponent {
  key: 'X1' | 'X2' | 'X3' | 'X4' | 'X5'
  label: string
  /** 比率原值 (component ratio) */
  ratio: number
  /** 权重系数 */
  weight: number
  /** 加权贡献 = ratio × weight */
  contribution: number
}

export interface AltmanResult {
  model: AltmanModel
  z: number
  zone: AltmanZone
  /** 中文区间标签 */
  zoneLabel: string
  components: AltmanComponent[]
  /** 区间阈值 [distress 上界, safe 下界] */
  thresholds: { distressBelow: number; safeAbove: number }
  /** 计算过程中触发的口径警告（如缺市值回退、分母为零等） */
  warnings: string[]
}

/** 各模型权重与区间阈值 */
const SPEC: Record<
  AltmanModel,
  {
    w: { X1: number; X2: number; X3: number; X4: number; X5: number }
    distressBelow: number
    safeAbove: number
    useX5: boolean
    x4Source: 'market' | 'book'
  }
> = {
  original: {
    w: { X1: 1.2, X2: 1.4, X3: 3.3, X4: 0.6, X5: 1.0 },
    distressBelow: 1.81,
    safeAbove: 2.99,
    useX5: true,
    x4Source: 'market',
  },
  private: {
    w: { X1: 0.717, X2: 0.847, X3: 3.107, X4: 0.42, X5: 0.998 },
    distressBelow: 1.23,
    safeAbove: 2.9,
    useX5: true,
    x4Source: 'book',
  },
  em: {
    w: { X1: 6.56, X2: 3.26, X3: 6.72, X4: 1.05, X5: 0 },
    distressBelow: 1.1,
    safeAbove: 2.6,
    useX5: false,
    x4Source: 'book',
  },
}

const ZONE_LABEL: Record<AltmanZone, string> = {
  safe: '安全区（破产风险低）',
  grey: '灰色区（需关注）',
  distress: '危险区（破产/持续经营预警）',
}

/** 安全除法：分母为 0 或非有限值时返回 0 并登记警告 */
function safeDiv(n: number, d: number, warnings: string[], label: string): number {
  if (!Number.isFinite(d) || d === 0) {
    warnings.push(`${label} 分母为 0 或无效，该项以 0 计入，请核对原始数据`)
    return 0
  }
  return n / d
}

function classify(z: number, distressBelow: number, safeAbove: number): AltmanZone {
  if (z < distressBelow) return 'distress'
  if (z > safeAbove) return 'safe'
  return 'grey'
}

/**
 * 计算 Altman Z-Score。
 * @param input 已统一单位/币种的科目数值
 * @param model 模型变体，默认 'em'（最广谱）
 */
export function altmanZScore(input: AltmanInput, model: AltmanModel = 'em'): AltmanResult {
  const spec = SPEC[model]
  const warnings: string[] = []
  const TA = input.totalAssets

  // X4 取数来源：original 用市值，其余用账面权益；缺失时回退并警告
  let x4Numerator: number
  if (spec.x4Source === 'market') {
    if (input.marketValueEquity == null) {
      x4Numerator = input.bookValueEquity ?? 0
      warnings.push("缺少股权市值，X4 已回退使用股东权益账面值（更接近 Z'/Z'' 口径，结果偏保守）")
    } else {
      x4Numerator = input.marketValueEquity
    }
  } else {
    if (input.bookValueEquity == null) {
      warnings.push('缺少股东权益账面值，X4 以 0 计入，请补充数据')
      x4Numerator = 0
    } else {
      x4Numerator = input.bookValueEquity
    }
  }

  const x1 = safeDiv(input.workingCapital, TA, warnings, 'X1 营运资金/总资产')
  const x2 = safeDiv(input.retainedEarnings, TA, warnings, 'X2 留存收益/总资产')
  const x3 = safeDiv(input.ebit, TA, warnings, 'X3 EBIT/总资产')
  const x4 = safeDiv(x4Numerator, input.totalLiabilities, warnings, 'X4 权益/总负债')
  const x5 = spec.useX5
    ? safeDiv(input.sales ?? 0, TA, warnings, 'X5 营业收入/总资产')
    : 0
  if (spec.useX5 && input.sales == null) {
    warnings.push('缺少营业收入，X5 以 0 计入')
  }

  const components: AltmanComponent[] = [
    { key: 'X1', label: '营运资金 / 总资产', ratio: x1, weight: spec.w.X1, contribution: x1 * spec.w.X1 },
    { key: 'X2', label: '留存收益 / 总资产', ratio: x2, weight: spec.w.X2, contribution: x2 * spec.w.X2 },
    { key: 'X3', label: 'EBIT / 总资产', ratio: x3, weight: spec.w.X3, contribution: x3 * spec.w.X3 },
    {
      key: 'X4',
      label: spec.x4Source === 'market' ? '股权市值 / 总负债' : '股东权益账面值 / 总负债',
      ratio: x4,
      weight: spec.w.X4,
      contribution: x4 * spec.w.X4,
    },
  ]
  if (spec.useX5) {
    components.push({ key: 'X5', label: '营业收入 / 总资产', ratio: x5, weight: spec.w.X5, contribution: x5 * spec.w.X5 })
  }

  const z = components.reduce((s, c) => s + c.contribution, 0)
  const zone = classify(z, spec.distressBelow, spec.safeAbove)

  return {
    model,
    z: round(z, 4),
    zone,
    zoneLabel: ZONE_LABEL[zone],
    components: components.map((c) => ({
      ...c,
      ratio: round(c.ratio, 4),
      contribution: round(c.contribution, 4),
    })),
    thresholds: { distressBelow: spec.distressBelow, safeAbove: spec.safeAbove },
    warnings,
  }
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
