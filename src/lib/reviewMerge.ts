/* 复核结果的分块与合并工具（服务端与前端共用）。
 * 前端"分段编排"时用这里的逻辑把各段复核结果合并成单一 markdown，
 * 与服务端多块合并保持完全一致。 */

/** 将长文本按段落边界切分为不超过 budget 的块 */
export function chunkText(text: string, budget: number): string[] {
  if (text.length <= budget) return [text]
  const chunks: string[] = []
  const paras = text.split(/\n{2,}/)
  let buf = ''
  for (const p of paras) {
    if (buf.length + p.length + 2 > budget && buf) {
      chunks.push(buf)
      buf = ''
    }
    // 单段本身超长时硬切
    if (p.length > budget) {
      if (buf) {
        chunks.push(buf)
        buf = ''
      }
      for (let i = 0; i < p.length; i += budget) chunks.push(p.slice(i, i + budget))
      continue
    }
    buf += (buf ? '\n\n' : '') + p
  }
  if (buf) chunks.push(buf)
  return chunks
}

/** 从一段复核 markdown 中提取指定 ## 章节下的 #### 问题卡片块 */
export function extractIssueCards(md: string, section: string): string[] {
  const re = new RegExp(`##\\s+${section}([\\s\\S]*?)(?=\\n##\\s|$)`)
  const m = md.match(re)
  if (!m) return []
  const body = m[1]
  return body.split(/(?=^####\s)/m).filter((b) => /^####\s/.test(b.trim()))
}

/** 重新编号问题卡片标题（#### 问题 N：xxx / #### 语法问题 N：xxx） */
export function renumberCards(cards: string[], prefix: string): string {
  return cards
    .map((c, i) => c.replace(/^####\s+.*?(?=[:：])/m, `#### ${prefix} ${i + 1}`).trim())
    .join('\n\n')
}

/** 多块复核结果合并为单一 markdown（总览/概述取首块，问题卡片全量合并去重编号） */
export function mergeReview(parts: string[]): string {
  const valid = parts.filter((p) => p && p.trim())
  if (valid.length === 0) return ''
  if (valid.length === 1) return valid[0]
  const first = valid[0]
  const dataCards: string[] = []
  const grammarCards: string[] = []
  valid.forEach((p) => {
    dataCards.push(...extractIssueCards(p, '财务数据复核'))
    grammarCards.push(...extractIssueCards(p, '语法核查'))
  })

  const overviewMatch = first.match(/(##\s+报告总览[\s\S]*?)(?=\n##\s)/)
  const overview = overviewMatch ? overviewMatch[1].trim() : ''

  const dataScopeMatch = first.match(/##\s+财务数据复核([\s\S]*?)###\s+需关注事项/)
  const dataHead = dataScopeMatch
    ? `## 财务数据复核${dataScopeMatch[1]}### 需关注事项`
    : '## 财务数据复核\n\n### 需关注事项'

  const grammarScopeMatch = first.match(/##\s+语法核查([\s\S]*?)###\s+需关注事项/)
  const grammarHead = grammarScopeMatch
    ? `## 语法核查${grammarScopeMatch[1]}### 需关注事项`
    : '## 语法核查\n\n### 需关注事项'

  const dataBody = dataCards.length
    ? '\n\n' + renumberCards(dataCards, '问题')
    : '\n\n✅ 本次复核未发现明显的数据勾稽异常或披露不一致问题。'
  const grammarBody = grammarCards.length
    ? '\n\n' + renumberCards(grammarCards, '语法问题')
    : '\n\n✅ 语言合规性检查未发现明显问题。'

  return [overview, dataHead + dataBody, grammarHead + grammarBody].filter(Boolean).join('\n\n')
}
