/**
 * 确定性财务指标重算引擎（纯 TS，不依赖大模型，结果可复核、可追溯）。
 *
 * 设计原则：
 *  - 大模型只负责"取数"（从报告抽取原始科目并标注页码），不负责"算数"。
 *  - 本模块对取到的原始科目做确定性计算，输出"公式 + 代入数字 + 结果"，
 *    任何人可据此独立复核，避免 LLM 心算带来的幻觉。
 *  - 缺失/分母为零的项以 N/A 处理并登记原因，绝不编造。
 */

import { altmanZScore, type AltmanModel, type AltmanResult } from './altman'
import { beneishMScore, type BeneishResult } from './beneish'

/** 由大模型抽取的原始科目（单位、币种需统一；本模块不做换算）。
 *  全部可选——缺失项相关指标记为 N/A。 */
export interface FigureInput {
  // 利润表
  revenue?: number // 营业收入
  grossProfit?: number // 毛利
  operatingProfit?: number // 营业利润
  profitBeforeTax?: number // 利润总额
  netProfit?: number // 净利润
  netProfitToParent?: number // 归母净利润
  financeCost?: number // 利息/财务费用
  // 资产负债表
  totalAssets?: number
  totalLiabilities?: number
  totalEquity?: number // 股东权益合计
  equityToParent?: number // 归母股东权益
  currentAssets?: number
  currentLiabilities?: number
  inventory?: number
  accountsReceivable?: number
  accountsPayable?: number
  cash?: number // 货币资金
  retainedEarnings?: number // 未分配利润(+盈余公积)
  shortTermDebt?: number // 短期借款/一年内到期有息负债
  // 现金流量表
  operatingCashFlow?: number // 经营活动现金流净额
  capex?: number // 购建固定资产等支付的现金（正数表示流出）
  // 每股 / 市值
  weightedShares?: number // 加权平均普通股股数
  marketValueEquity?: number // 股权市值（上市且可得时）
  // 折旧摊销与销管费用（Beneish 用）
  depreciation?: number // 本期折旧与摊销
  ppeNet?: number // 固定资产净额
  sga?: number // 销售费用+管理费用
  // 对比期（用于增长率，可选）
  prevRevenue?: number
  prevNetProfitToParent?: number
  prevOperatingCashFlow?: number
  // 对比期（Beneish M-Score 多期口径，可选）
  prevGrossProfit?: number
  prevAccountsReceivable?: number
  prevCurrentAssets?: number
  prevTotalAssets?: number
  prevTotalLiabilities?: number
  prevPpeNet?: number
  prevDepreciation?: number
  prevSga?: number
  prevNetProfit?: number
}

export type MetricStatus = 'ok' | 'na'

export interface Metric {
  key: string
  label: string
  /** 计算公式（人类可读） */
  formula: string
  /** 代入的原始数字说明 */
  inputs: string
  /** 计算结果（已格式化） */
  value: string
  /** 原始数值（便于前端进一步处理） */
  raw: number | null
  unit: '%' | '倍' | '天' | '元' | ''
  status: MetricStatus
  note?: string
}

export interface RatioGroup {
  group: string
  metrics: Metric[]
}

export interface RatioReport {
  groups: RatioGroup[]
  altman?: AltmanResult
  beneish?: BeneishResult
  warnings: string[]
}

const fmt = (n: number, dp = 2) => {
  const f = 10 ** dp
  return (Math.round(n * f) / f).toLocaleString('zh-CN', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

function has(...xs: (number | undefined)[]): boolean {
  return xs.every((x) => typeof x === 'number' && Number.isFinite(x))
}

function naMetric(key: string, label: string, formula: string, missing: string): Metric {
  return {
    key,
    label,
    formula,
    inputs: `缺少：${missing}`,
    value: 'N/A（数据不足）',
    raw: null,
    unit: '',
    status: 'na',
  }
}

/** 计算单个比率指标（分母为零或缺失 → N/A） */
function ratio(
  key: string,
  label: string,
  formula: string,
  numerator: number | undefined,
  denominator: number | undefined,
  opts: { unit: Metric['unit']; scale?: number; dp?: number; missing: string; numLabel: string; denLabel: string }
): Metric {
  if (!has(numerator, denominator)) {
    return naMetric(key, label, formula, opts.missing)
  }
  if (denominator === 0) {
    return { ...naMetric(key, label, formula, opts.missing), inputs: '分母为 0，无法计算', note: '分母为零' }
  }
  const scale = opts.scale ?? 1
  const r = ((numerator as number) / (denominator as number)) * scale
  const dp = opts.dp ?? 2
  return {
    key,
    label,
    formula,
    inputs: `${opts.numLabel}=${fmt(numerator as number, 0)}；${opts.denLabel}=${fmt(denominator as number, 0)}`,
    value: `${fmt(r, dp)}${opts.unit}`,
    raw: r,
    unit: opts.unit,
    status: 'ok',
  }
}

/** 主计算入口 */
export function computeRatios(f: FigureInput): RatioReport {
  const warnings: string[] = []
  const groups: RatioGroup[] = []

  /* 盈利能力 */
  groups.push({
    group: '盈利能力',
    metrics: [
      ratio('grossMargin', '毛利率', '毛利 ÷ 营业收入', f.grossProfit, f.revenue, {
        unit: '%', scale: 100, missing: '毛利或营业收入', numLabel: '毛利', denLabel: '营业收入',
      }),
      ratio('netMargin', '净利率', '净利润 ÷ 营业收入', f.netProfit, f.revenue, {
        unit: '%', scale: 100, missing: '净利润或营业收入', numLabel: '净利润', denLabel: '营业收入',
      }),
      ratio('roe', 'ROE（净资产收益率）', '归母净利润 ÷ 归母股东权益', f.netProfitToParent ?? f.netProfit, f.equityToParent ?? f.totalEquity, {
        unit: '%', scale: 100, missing: '归母净利润或归母股东权益', numLabel: '归母净利润', denLabel: '归母股东权益',
      }),
      ratio('roa', 'ROA（总资产收益率）', '净利润 ÷ 总资产', f.netProfit, f.totalAssets, {
        unit: '%', scale: 100, missing: '净利润或总资产', numLabel: '净利润', denLabel: '总资产',
      }),
    ],
  })

  /* 偿债能力 */
  const interestCoverNum = has(f.profitBeforeTax, f.financeCost)
    ? (f.profitBeforeTax as number) + (f.financeCost as number)
    : undefined // EBIT 近似 = 利润总额 + 利息费用
  groups.push({
    group: '偿债能力',
    metrics: [
      ratio('debtRatio', '资产负债率', '负债合计 ÷ 总资产', f.totalLiabilities, f.totalAssets, {
        unit: '%', scale: 100, missing: '负债合计或总资产', numLabel: '负债合计', denLabel: '总资产',
      }),
      ratio('currentRatio', '流动比率', '流动资产 ÷ 流动负债', f.currentAssets, f.currentLiabilities, {
        unit: '倍', missing: '流动资产或流动负债', numLabel: '流动资产', denLabel: '流动负债',
      }),
      ratio('quickRatio', '速动比率', '(流动资产 − 存货) ÷ 流动负债',
        has(f.currentAssets, f.inventory) ? (f.currentAssets as number) - (f.inventory as number) : undefined,
        f.currentLiabilities, {
          unit: '倍', missing: '流动资产、存货或流动负债', numLabel: '流动资产−存货', denLabel: '流动负债',
        }),
      ratio('interestCover', '利息保障倍数', '(利润总额 + 利息费用) ÷ 利息费用', interestCoverNum, f.financeCost, {
        unit: '倍', missing: '利润总额或利息费用', numLabel: 'EBIT', denLabel: '利息费用',
      }),
    ],
  })

  /* 现金流质量 */
  const fcf = has(f.operatingCashFlow, f.capex)
    ? (f.operatingCashFlow as number) - Math.abs(f.capex as number)
    : undefined
  groups.push({
    group: '现金流质量',
    metrics: [
      ratio('cashEarnings', '现金收益比', '经营活动现金流净额 ÷ 净利润', f.operatingCashFlow, f.netProfit, {
        unit: '倍', missing: '经营现金流或净利润', numLabel: '经营现金流', denLabel: '净利润',
      }),
      has(f.operatingCashFlow, f.capex)
        ? {
            key: 'fcf', label: '自由现金流', formula: '经营活动现金流净额 − 资本支出',
            inputs: `经营现金流=${fmt(f.operatingCashFlow as number, 0)}；资本支出=${fmt(Math.abs(f.capex as number), 0)}`,
            value: `${fmt(fcf as number, 0)} 元`, raw: fcf as number, unit: '元' as const, status: 'ok' as const,
          }
        : naMetric('fcf', '自由现金流', '经营活动现金流净额 − 资本支出', '经营现金流或资本支出'),
    ],
  })

  /* 营运能力（周转天数，按 365 天） */
  groups.push({
    group: '营运能力',
    metrics: [
      ratio('dso', '应收账款周转天数', '应收账款 ÷ 营业收入 × 365', f.accountsReceivable, f.revenue, {
        unit: '天', scale: 365, dp: 0, missing: '应收账款或营业收入', numLabel: '应收账款', denLabel: '营业收入',
      }),
      ratio('dio', '存货周转天数', '存货 ÷ 营业收入 × 365', f.inventory, f.revenue, {
        unit: '天', scale: 365, dp: 0, missing: '存货或营业收入', numLabel: '存货', denLabel: '营业收入',
        // 说明：严格应以营业成本为分母，缺营业成本时以营业收入近似
      }),
      ratio('dpo', '应付账款周转天数', '应付账款 ÷ 营业收入 × 365', f.accountsPayable, f.revenue, {
        unit: '天', scale: 365, dp: 0, missing: '应付账款或营业收入', numLabel: '应付账款', denLabel: '营业收入',
      }),
    ],
  })

  /* 每股指标 */
  groups.push({
    group: '每股指标',
    metrics: [
      ratio('eps', '基本每股收益（重算）', '归母净利润 ÷ 加权平均普通股股数', f.netProfitToParent ?? f.netProfit, f.weightedShares, {
        unit: '元', dp: 4, missing: '归母净利润或加权平均股数', numLabel: '归母净利润', denLabel: '加权平均股数',
      }),
    ],
  })

  /* 成长性（如有对比期） */
  const growth: Metric[] = []
  if (has(f.revenue, f.prevRevenue) && (f.prevRevenue as number) !== 0) {
    const g = ((f.revenue as number) - (f.prevRevenue as number)) / Math.abs(f.prevRevenue as number) * 100
    growth.push({
      key: 'revGrowth', label: '营业收入同比', formula: '(本期收入 − 上期收入) ÷ |上期收入|',
      inputs: `本期=${fmt(f.revenue as number, 0)}；上期=${fmt(f.prevRevenue as number, 0)}`,
      value: `${fmt(g, 1)}%`, raw: g, unit: '%', status: 'ok',
    })
  }
  if (has(f.netProfitToParent, f.prevNetProfitToParent) && (f.prevNetProfitToParent as number) !== 0) {
    const g = ((f.netProfitToParent as number) - (f.prevNetProfitToParent as number)) / Math.abs(f.prevNetProfitToParent as number) * 100
    growth.push({
      key: 'npGrowth', label: '归母净利润同比', formula: '(本期 − 上期) ÷ |上期|',
      inputs: `本期=${fmt(f.netProfitToParent as number, 0)}；上期=${fmt(f.prevNetProfitToParent as number, 0)}`,
      value: `${fmt(g, 1)}%`, raw: g, unit: '%', status: 'ok',
    })
  }
  if (growth.length) groups.push({ group: '成长性', metrics: growth })

  /* Altman Z-Score（破产/持续经营预警） */
  let altman: AltmanResult | undefined
  const ebit = interestCoverNum
  const workingCapital = has(f.currentAssets, f.currentLiabilities)
    ? (f.currentAssets as number) - (f.currentLiabilities as number)
    : undefined
  if (has(f.totalAssets, f.totalLiabilities, workingCapital, f.retainedEarnings, ebit)) {
    const model: AltmanModel = f.marketValueEquity != null ? 'original' : 'em'
    altman = altmanZScore(
      {
        totalAssets: f.totalAssets as number,
        totalLiabilities: f.totalLiabilities as number,
        workingCapital: workingCapital as number,
        retainedEarnings: f.retainedEarnings as number,
        ebit: ebit as number,
        sales: f.revenue,
        marketValueEquity: f.marketValueEquity,
        bookValueEquity: f.totalEquity,
      },
      model
    )
    warnings.push(...altman.warnings)
  } else {
    warnings.push('原始科目不足，未计算 Altman Z-Score（需总资产、总负债、营运资金、留存收益、EBIT）')
  }

  /* Beneish M-Score（盈余操纵预警，需本期与上期数据） */
  const beneish = beneishMScore({
    revenue: f.revenue,
    grossProfit: f.grossProfit,
    accountsReceivable: f.accountsReceivable,
    currentAssets: f.currentAssets,
    ppeNet: f.ppeNet,
    depreciation: f.depreciation,
    sga: f.sga,
    totalAssets: f.totalAssets,
    totalLiabilities: f.totalLiabilities,
    netProfit: f.netProfit,
    operatingCashFlow: f.operatingCashFlow,
    prevRevenue: f.prevRevenue,
    prevGrossProfit: f.prevGrossProfit,
    prevAccountsReceivable: f.prevAccountsReceivable,
    prevCurrentAssets: f.prevCurrentAssets,
    prevPpeNet: f.prevPpeNet,
    prevDepreciation: f.prevDepreciation,
    prevSga: f.prevSga,
    prevTotalAssets: f.prevTotalAssets,
    prevTotalLiabilities: f.prevTotalLiabilities,
  }) ?? undefined
  if (!beneish) {
    warnings.push('缺少本期或上期营业收入，未计算 Beneish M-Score（盈余操纵预警需至少两期数据）')
  } else {
    warnings.push(...beneish.warnings)
  }

  return { groups, altman, beneish, warnings }
}
