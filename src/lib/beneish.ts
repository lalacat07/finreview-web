/**
 * Beneish M-Score —— 盈余操纵（财务造假）预警模型（纯 TS，确定性、可复核）
 *
 * 口径对齐 Beneish (1999) 原始 8 变量模型，便于在审阅平台标注"采用 Beneish 公开公式"。
 * 本模块只做计算，不取数；缺失变量以"中性值"代入（比率型指数取 1=无变化，TATA 取 0），
 * 并登记 warning，同时下调可靠性标记，绝不编造。
 *
 * M = -4.84 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI
 *        + 0.115·DEPI - 0.172·SGAI + 4.679·TATA - 0.327·LVGI
 *
 * 判别阈值（8 变量模型）：M > -1.78 → 存在盈余操纵嫌疑（manipulator）。
 * 注意：M-Score 为统计预警，高分仅代表"具备操纵财务特征"，不等于已确认造假，
 * 须结合底稿、管理层解释与外部信息进一步核实。
 */

export interface BeneishInput {
  // 本期
  revenue?: number
  grossProfit?: number
  accountsReceivable?: number
  currentAssets?: number
  ppeNet?: number // 固定资产净额（含使用权资产口径需统一）
  depreciation?: number // 本期折旧与摊销
  sga?: number // 销售费用 + 管理费用
  totalAssets?: number
  totalLiabilities?: number
  netProfit?: number
  operatingCashFlow?: number
  // 上期
  prevRevenue?: number
  prevGrossProfit?: number
  prevAccountsReceivable?: number
  prevCurrentAssets?: number
  prevPpeNet?: number
  prevDepreciation?: number
  prevSga?: number
  prevTotalAssets?: number
  prevTotalLiabilities?: number
}

export interface BeneishComponent {
  key: 'DSRI' | 'GMI' | 'AQI' | 'SGI' | 'DEPI' | 'SGAI' | 'LVGI' | 'TATA'
  label: string
  value: number
  weight: number
  contribution: number
  /** 是否因缺数据而以中性值代入 */
  imputed: boolean
}

export interface BeneishResult {
  m: number
  /** 是否触发操纵嫌疑阈值 */
  flagged: boolean
  threshold: number
  zoneLabel: string
  components: BeneishComponent[]
  /** 实际可计算（非中性代入）的变量个数，越高越可靠 */
  computedVars: number
  warnings: string[]
}

const WEIGHTS = {
  intercept: -4.84,
  DSRI: 0.92,
  GMI: 0.528,
  AQI: 0.404,
  SGI: 0.892,
  DEPI: 0.115,
  SGAI: -0.172,
  TATA: 4.679,
  LVGI: -0.327,
} as const

const THRESHOLD = -1.78

const num = (x: number | undefined): x is number => typeof x === 'number' && Number.isFinite(x)

function round(n: number, dp = 4): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * 计算 Beneish M-Score。任一指数缺数据则以中性值代入并登记 warning。
 * 返回 null 表示连最基本的本期/上期收入都缺失，无法给出有意义结果。
 */
export function beneishMScore(f: BeneishInput): BeneishResult | null {
  if (!num(f.revenue) || !num(f.prevRevenue) || f.prevRevenue === 0) {
    return null
  }
  const warnings: string[] = []
  let computedVars = 0

  // DSRI 应收账款指数
  let dsri = 1
  if (num(f.accountsReceivable) && num(f.prevAccountsReceivable) && f.prevAccountsReceivable !== 0 && f.prevRevenue !== 0) {
    const cur = f.accountsReceivable / f.revenue
    const prev = f.prevAccountsReceivable / f.prevRevenue
    if (prev !== 0) { dsri = cur / prev; computedVars++ } else warnings.push('DSRI：上期应收/收入为 0，以中性值 1 代入')
  } else { warnings.push('DSRI（应收账款指数）数据不足，以中性值 1 代入'); }

  // GMI 毛利率指数 = 上期毛利率 / 本期毛利率
  let gmi = 1
  if (num(f.grossProfit) && num(f.prevGrossProfit) && f.revenue !== 0 && f.prevRevenue !== 0) {
    const gmCur = f.grossProfit / f.revenue
    const gmPrev = f.prevGrossProfit / f.prevRevenue
    if (gmCur !== 0) { gmi = gmPrev / gmCur; computedVars++ } else warnings.push('GMI：本期毛利率为 0，以中性值 1 代入')
  } else { warnings.push('GMI（毛利率指数）数据不足，以中性值 1 代入') }

  // AQI 资产质量指数
  let aqi = 1
  if (num(f.currentAssets) && num(f.ppeNet) && num(f.totalAssets) && num(f.prevCurrentAssets) && num(f.prevPpeNet) && num(f.prevTotalAssets) && f.totalAssets !== 0 && f.prevTotalAssets !== 0) {
    const cur = 1 - (f.currentAssets + f.ppeNet) / f.totalAssets
    const prev = 1 - (f.prevCurrentAssets + f.prevPpeNet) / f.prevTotalAssets
    if (prev !== 0) { aqi = cur / prev; computedVars++ } else warnings.push('AQI：上期基数为 0，以中性值 1 代入')
  } else { warnings.push('AQI（资产质量指数）数据不足，以中性值 1 代入') }

  // SGI 销售增长指数
  let sgi = 1
  {
    sgi = f.revenue / f.prevRevenue
    computedVars++
  }

  // DEPI 折旧指数 = 上期折旧率 / 本期折旧率，折旧率 = 折旧/(折旧+PPE净额)
  let depi = 1
  if (num(f.depreciation) && num(f.ppeNet) && num(f.prevDepreciation) && num(f.prevPpeNet)) {
    const rateCur = f.depreciation / (f.depreciation + f.ppeNet)
    const ratePrev = f.prevDepreciation / (f.prevDepreciation + f.prevPpeNet)
    if (rateCur !== 0 && Number.isFinite(rateCur) && Number.isFinite(ratePrev)) { depi = ratePrev / rateCur; computedVars++ } else warnings.push('DEPI：折旧率为 0/无效，以中性值 1 代入')
  } else { warnings.push('DEPI（折旧指数）数据不足，以中性值 1 代入') }

  // SGAI 销管费用指数
  let sgai = 1
  if (num(f.sga) && num(f.prevSga) && f.revenue !== 0 && f.prevRevenue !== 0) {
    const cur = f.sga / f.revenue
    const prev = f.prevSga / f.prevRevenue
    if (prev !== 0) { sgai = cur / prev; computedVars++ } else warnings.push('SGAI：上期销管/收入为 0，以中性值 1 代入')
  } else { warnings.push('SGAI（销管费用指数）数据不足，以中性值 1 代入') }

  // LVGI 杠杆指数 = 本期资产负债率 / 上期资产负债率
  let lvgi = 1
  if (num(f.totalLiabilities) && num(f.totalAssets) && num(f.prevTotalLiabilities) && num(f.prevTotalAssets) && f.totalAssets !== 0 && f.prevTotalAssets !== 0) {
    const cur = f.totalLiabilities / f.totalAssets
    const prev = f.prevTotalLiabilities / f.prevTotalAssets
    if (prev !== 0) { lvgi = cur / prev; computedVars++ } else warnings.push('LVGI：上期资产负债率为 0，以中性值 1 代入')
  } else { warnings.push('LVGI（杠杆指数）数据不足，以中性值 1 代入') }

  // TATA 总应计/总资产 = (净利润 - 经营现金流) / 总资产
  let tata = 0
  if (num(f.netProfit) && num(f.operatingCashFlow) && num(f.totalAssets) && f.totalAssets !== 0) {
    tata = (f.netProfit - f.operatingCashFlow) / f.totalAssets
    computedVars++
  } else { warnings.push('TATA（总应计指数）数据不足，以中性值 0 代入') }

  const comps: BeneishComponent[] = [
    { key: 'DSRI', label: '应收账款指数', value: dsri, weight: WEIGHTS.DSRI, contribution: dsri * WEIGHTS.DSRI, imputed: dsri === 1 },
    { key: 'GMI', label: '毛利率指数', value: gmi, weight: WEIGHTS.GMI, contribution: gmi * WEIGHTS.GMI, imputed: gmi === 1 },
    { key: 'AQI', label: '资产质量指数', value: aqi, weight: WEIGHTS.AQI, contribution: aqi * WEIGHTS.AQI, imputed: aqi === 1 },
    { key: 'SGI', label: '销售增长指数', value: sgi, weight: WEIGHTS.SGI, contribution: sgi * WEIGHTS.SGI, imputed: false },
    { key: 'DEPI', label: '折旧指数', value: depi, weight: WEIGHTS.DEPI, contribution: depi * WEIGHTS.DEPI, imputed: depi === 1 },
    { key: 'SGAI', label: '销管费用指数', value: sgai, weight: WEIGHTS.SGAI, contribution: sgai * WEIGHTS.SGAI, imputed: sgai === 1 },
    { key: 'TATA', label: '总应计/总资产', value: tata, weight: WEIGHTS.TATA, contribution: tata * WEIGHTS.TATA, imputed: tata === 0 },
    { key: 'LVGI', label: '杠杆指数', value: lvgi, weight: WEIGHTS.LVGI, contribution: lvgi * WEIGHTS.LVGI, imputed: lvgi === 1 },
  ]

  const m = WEIGHTS.intercept + comps.reduce((s, c) => s + c.contribution, 0)
  const flagged = m > THRESHOLD

  if (computedVars < 5) {
    warnings.push(`仅 ${computedVars}/8 个变量可由报告数据计算，其余以中性值代入，M-Score 仅供参考，可靠性较低`)
  }

  return {
    m: round(m),
    flagged,
    threshold: THRESHOLD,
    zoneLabel: flagged
      ? '高于阈值 -1.78：存在盈余操纵财务特征，建议结合底稿核实'
      : '低于阈值 -1.78：未呈现明显盈余操纵特征',
    components: comps.map((c) => ({ ...c, value: round(c.value), contribution: round(c.contribution) })),
    computedVars,
    warnings,
  }
}
