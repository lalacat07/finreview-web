/**
 * 披露完备性检查清单引擎（纯 TS，确定性、可复核）。
 *
 * 设计：不依赖大模型，按关键词在报告全文中扫描"强制/常见披露项"是否出现。
 * - status='present'：检索到相关披露线索
 * - status='missing'：未检索到 → 提示"建议核查是否缺失"（关键词法可能漏检，故为提示而非定论）
 * - status='na'：依据识别到的会计准则，该项对本报告不适用
 *
 * 注意：本引擎只判断"是否提及"，不判断披露内容是否充分、准确——后者由大模型复核与人工判断。
 */

export type DisclosureStatus = 'present' | 'missing' | 'na'
export type Applicability = 'common' | 'CAS' | 'IFRS/HKFRS'

export interface DisclosureItem {
  key: string
  label: string
  applicability: Applicability
  status: DisclosureStatus
  /** 命中的关键词（便于复核）或缺失提示 */
  note: string
}

export interface DisclosureGroup {
  group: string
  items: DisclosureItem[]
}

export interface DisclosureReport {
  detectedStandard: 'CAS' | 'IFRS/HKFRS' | '未明确'
  groups: DisclosureGroup[]
  presentCount: number
  missingCount: number
  naCount: number
  summary: string
}

interface ItemDef {
  key: string
  label: string
  group: string
  applicability: Applicability
  keywords: string[]
}

/* 关键词为"任一命中即视为已披露"。英文关键词以小写匹配。 */
const ITEMS: ItemDef[] = [
  // 会计政策与估计
  { key: 'accPolicy', label: '重要会计政策', group: '会计政策与估计', applicability: 'common', keywords: ['重要会计政策', '主要会计政策', 'significant accounting policies', 'material accounting policies'] },
  { key: 'accEstimate', label: '重要会计估计与判断', group: '会计政策与估计', applicability: 'common', keywords: ['会计估计', '重大判断', '关键判断', 'accounting estimates', 'critical judgements', 'critical accounting'] },
  { key: 'newStandard', label: '新准则/会计政策变更影响', group: '会计政策与估计', applicability: 'common', keywords: ['会计政策变更', '首次执行', '准则的影响', 'newly adopted', 'first-time adoption', 'change in accounting policy'] },

  // 审计与治理
  { key: 'auditReport', label: '审计/核数师报告与意见类型', group: '审计与治理', applicability: 'common', keywords: ['审计报告', '审计意见', '无保留意见', '保留意见', '核数师', "auditor's report", 'opinion'] },
  { key: 'kam', label: '关键审计事项 (KAM)', group: '审计与治理', applicability: 'common', keywords: ['关键审计事项', 'key audit matters'] },
  { key: 'remuneration', label: '董事/关键管理人员薪酬', group: '审计与治理', applicability: 'common', keywords: ['董事薪酬', '关键管理人员', '高级管理人员薪酬', 'key management', 'directors’ remuneration', 'directors\' emoluments'] },

  // 关联方与交易
  { key: 'relatedParty', label: '关联方及关联交易', group: '关联方与交易', applicability: 'common', keywords: ['关联方', '关联交易', 'related part'] },
  { key: 'connectedTxn', label: '关连交易/上市规则第14A章', group: '关联方与交易', applicability: 'IFRS/HKFRS', keywords: ['关连交易', '持续关连交易', 'connected transaction', 'chapter 14a', '14a'] },
  { key: 'guarantee', label: '对外担保与或有事项', group: '关联方与交易', applicability: 'common', keywords: ['对外担保', '担保', '或有负债', '或有事项', 'contingent', 'guarantee'] },
  { key: 'commitment', label: '承诺事项（资本/经营承诺）', group: '关联方与交易', applicability: 'common', keywords: ['承诺事项', '资本承诺', '经营租赁承诺', 'commitment'] },

  // 金融工具与公允价值
  { key: 'finRisk', label: '金融工具风险（信用/流动性/市场）', group: '金融工具与公允价值', applicability: 'common', keywords: ['信用风险', '流动性风险', '市场风险', 'credit risk', 'liquidity risk', 'market risk'] },
  { key: 'ecl', label: '预期信用损失 (ECL)', group: '金融工具与公允价值', applicability: 'common', keywords: ['预期信用损失', '信用减值', 'expected credit loss', 'ecl'] },
  { key: 'fvHierarchy', label: '公允价值层级（Level 1/2/3）', group: '金融工具与公允价值', applicability: 'common', keywords: ['公允价值层', '公允价值层次', 'fair value hierarchy', 'level 3', 'level 1'] },

  // 经营与资产
  { key: 'segment', label: '分部报告', group: '经营与资产', applicability: 'common', keywords: ['分部', '经营分部', '报告分部', 'segment'] },
  { key: 'revenue', label: '收入确认政策与收入分解', group: '经营与资产', applicability: 'common', keywords: ['收入确认', '收入分拆', '收入分解', 'revenue recognition', 'disaggregation of revenue'] },
  { key: 'goodwill', label: '商誉及减值测试', group: '经营与资产', applicability: 'common', keywords: ['商誉', 'goodwill'] },
  { key: 'deferredTax', label: '递延所得税', group: '经营与资产', applicability: 'common', keywords: ['递延所得税', 'deferred tax'] },
  { key: 'sbc', label: '股份支付/股权激励', group: '经营与资产', applicability: 'common', keywords: ['股份支付', '股权激励', 'share-based', 'share option'] },
  { key: 'subsequent', label: '资产负债表日后/期后事项', group: '经营与资产', applicability: 'common', keywords: ['期后事项', '日后事项', '资产负债表日后', 'subsequent event', 'events after'] },

  // CAS 特有
  { key: 'nonRecurring', label: '非经常性损益/扣非净利润', group: 'CAS 特别披露', applicability: 'CAS', keywords: ['非经常性损益', '扣除非经常性', '扣非'] },
  { key: 'parentOnly', label: '母公司财务报表', group: 'CAS 特别披露', applicability: 'CAS', keywords: ['母公司资产负债表', '母公司利润表', '母公司现金流量表', '母公司财务报表'] },
  { key: 'cfsSupplement', label: '现金流量表补充资料（间接法）', group: 'CAS 特别披露', applicability: 'CAS', keywords: ['现金流量表补充资料', '将净利润调节为经营活动', '补充资料'] },
  { key: 'govGrant', label: '政府补助', group: 'CAS 特别披露', applicability: 'CAS', keywords: ['政府补助', '财政补贴'] },

  // 港股特有
  { key: 'esg', label: 'ESG/环境社会及管治报告', group: '港股特别披露', applicability: 'IFRS/HKFRS', keywords: ['环境、社会及管治', '环境社会及管治', 'esg', '可持续发展报告', 'sustainability report'] },
  { key: 'corpGov', label: '企业管治报告', group: '港股特别披露', applicability: 'IFRS/HKFRS', keywords: ['企业管治', '企业管治守则', 'corporate governance'] },
]

function detectStandard(text: string): DisclosureReport['detectedStandard'] {
  const t = text
  const lower = text.toLowerCase()
  const hk = /香港财务报告准则|核数师|联交所|香港交易所|上市规则|关连交易/.test(t) || /hkfrs|hong kong financial reporting|listing rules/.test(lower)
  const ifrs = /国际财务报告准则/.test(t) || /international financial reporting|\bifrs\b/.test(lower)
  const cas = /企业会计准则|财政部|非经常性损益|母公司资产负债表|证券监督管理委员会/.test(t)
  if (cas && !(hk || ifrs)) return 'CAS'
  if (hk || ifrs) return 'IFRS/HKFRS'
  if (cas) return 'CAS'
  return '未明确'
}

/** 在文本中检测某项披露是否出现，返回命中的关键词或空串 */
function findKeyword(text: string, lower: string, keywords: string[]): string {
  for (const kw of keywords) {
    const k = kw.toLowerCase()
    if (/[a-z]/.test(k)) {
      if (lower.includes(k)) return kw
    } else if (text.includes(kw)) {
      return kw
    }
  }
  return ''
}

export function checkDisclosures(text: string): DisclosureReport {
  const detectedStandard = detectStandard(text)
  const lower = text.toLowerCase()

  const applicable = (a: Applicability): boolean => {
    if (a === 'common') return true
    if (detectedStandard === '未明确') return true // 准则不明时全部检查，避免漏判
    if (a === 'CAS') return detectedStandard === 'CAS'
    return detectedStandard === 'IFRS/HKFRS'
  }

  const groupMap = new Map<string, DisclosureItem[]>()
  let presentCount = 0
  let missingCount = 0
  let naCount = 0

  for (const def of ITEMS) {
    let item: DisclosureItem
    if (!applicable(def.applicability)) {
      item = { key: def.key, label: def.label, applicability: def.applicability, status: 'na', note: `按识别准则（${detectedStandard}）不适用` }
      naCount++
    } else {
      const hit = findKeyword(text, lower, def.keywords)
      if (hit) {
        item = { key: def.key, label: def.label, applicability: def.applicability, status: 'present', note: `命中关键词「${hit}」` }
        presentCount++
      } else {
        item = { key: def.key, label: def.label, applicability: def.applicability, status: 'missing', note: '未检索到相关披露，建议核查是否缺失或仅在未解析章节' }
        missingCount++
      }
    }
    const arr = groupMap.get(def.group) ?? []
    arr.push(item)
    groupMap.set(def.group, arr)
  }

  const groups: DisclosureGroup[] = Array.from(groupMap.entries()).map(([group, items]) => ({ group, items }))

  return {
    detectedStandard,
    groups,
    presentCount,
    missingCount,
    naCount,
    summary: `识别准则：${detectedStandard}。已检索 ${presentCount + missingCount} 项适用披露，其中检索到 ${presentCount} 项，${missingCount} 项未检索到（提示需核查），${naCount} 项按准则不适用。关键词法仅判断"是否提及"，不代表披露充分，须结合人工复核。`,
  }
}
