import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

/* ─────────────────────────────────────────────────────────────────────────────
 * 用户意见反馈接收端
 *  - 默认：追加写入本地 JSONL（每行一条 JSON），路径可由 FEEDBACK_FILE 配置，
 *    默认 <项目根>/feedback.jsonl。适合本地 / 自部署；serverless 平台磁盘不持久。
 *  - 可选：设置 FEEDBACK_WEBHOOK_URL 后同时转发到群机器人 / Slack（best-effort）；
 *    通过 FEEDBACK_WEBHOOK_TYPE 选择载荷格式：feishu | dingtalk | wework | slack | raw。
 *  - 可选：设置 RESEND_API_KEY + FEEDBACK_EMAIL_TO（+可选 FEEDBACK_EMAIL_FROM）后，
 *    每条反馈通过 Resend 邮件 API 发送到指定邮箱。
 * ────────────────────────────────────────────────────────────────────────────*/

interface FeedbackPayload {
  rating?: number
  category?: string
  message?: string
  contact?: string
  page?: string
  ua?: string
}

const MAX_LEN = 4000

function clampStr(v: unknown, max = MAX_LEN): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

function buildWebhookBody(type: string, summary: string): unknown {
  switch (type) {
    case 'feishu':
      return { msg_type: 'text', content: { text: summary } }
    case 'dingtalk':
    case 'wework':
      return { msgtype: 'text', text: { content: summary } }
    case 'slack':
      return { text: summary }
    default: // raw
      return { text: summary }
  }
}

async function forwardWebhook(record: Record<string, unknown>) {
  const url = process.env.FEEDBACK_WEBHOOK_URL
  if (!url) return
  const type = (process.env.FEEDBACK_WEBHOOK_TYPE || 'raw').toLowerCase()
  const stars = typeof record.rating === 'number' && record.rating > 0 ? '⭐'.repeat(record.rating as number) : '未评分'
  const summary =
    `【FinGuard 用户反馈】\n` +
    `评分：${stars}\n` +
    `分类：${record.category || '未填'}\n` +
    `页面：${record.page || '未知'}\n` +
    `内容：${record.message || '（无）'}\n` +
    `联系：${record.contact || '（未留）'}\n` +
    `时间：${record.ts}`
  const body = type === 'raw' ? { ...record, text: summary } : buildWebhookBody(type, summary)
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.error('Feedback webhook forward failed:', e instanceof Error ? e.message : String(e))
  }
}

async function forwardEmail(record: Record<string, unknown>) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.FEEDBACK_EMAIL_TO
  if (!apiKey || !to) return
  const from = process.env.FEEDBACK_EMAIL_FROM || 'FinGuard <onboarding@resend.dev>'
  const stars = typeof record.rating === 'number' && record.rating > 0 ? '★'.repeat(record.rating as number) : '未评分'
  const rows: [string, string][] = [
    ['评分', stars],
    ['分类', String(record.category || '未填')],
    ['页面', String(record.page || '未知')],
    ['内容', String(record.message || '（无）')],
    ['联系方式', String(record.contact || '（未留）')],
    ['时间', String(record.ts)],
  ]
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html =
    `<h2>FinGuard 用户反馈</h2><table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td style="border:1px solid #ddd;font-weight:bold">${k}</td><td style="border:1px solid #ddd;white-space:pre-wrap">${esc(v)}</td></tr>`).join('') +
    `</table>`
  const text = rows.map(([k, v]) => `${k}：${v}`).join('\n')
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: to.split(',').map((s) => s.trim()),
        subject: `【FinGuard 反馈】${stars}${record.category ? ' · ' + record.category : ''}`,
        html,
        text,
      }),
    })
    if (!res.ok) {
      console.error('Feedback email failed:', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.error('Feedback email error:', e instanceof Error ? e.message : String(e))
  }
}

async function appendToFile(record: Record<string, unknown>) {
  const file = process.env.FEEDBACK_FILE || path.join(process.cwd(), 'feedback.jsonl')
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.appendFile(file, JSON.stringify(record) + '\n', 'utf8')
  } catch (e) {
    // serverless 只读文件系统等情况下忽略，不阻断；已有 webhook 兜底
    console.error('Feedback file write failed:', e instanceof Error ? e.message : String(e))
  }
}

/* 查看反馈：需 FEEDBACK_ADMIN_TOKEN 校验（未配置则拒绝，避免公开暴露）。
 * 用法：GET /api/feedback?token=xxx 或带请求头 x-admin-token。 */
export async function GET(request: NextRequest) {
  const adminToken = process.env.FEEDBACK_ADMIN_TOKEN
  if (!adminToken) {
    return Response.json(
      { ok: false, error: '未配置 FEEDBACK_ADMIN_TOKEN，反馈查看接口已禁用' },
      { status: 403 }
    )
  }
  const url = new URL(request.url)
  const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || ''
  if (token !== adminToken) {
    return Response.json({ ok: false, error: '令牌无效' }, { status: 401 })
  }

  const file = process.env.FEEDBACK_FILE || path.join(process.cwd(), 'feedback.jsonl')
  try {
    const raw = await fs.readFile(file, 'utf8')
    const items = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .reverse() // 最新在前
    return Response.json({ ok: true, count: items.length, items })
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err && err.code === 'ENOENT') {
      return Response.json({ ok: true, count: 0, items: [], note: '暂无反馈文件（还没有人提交，或部署在不持久化文件系统上）' })
    }
    return Response.json({ ok: false, error: '读取反馈失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as FeedbackPayload
    const rating = typeof raw.rating === 'number' && raw.rating >= 1 && raw.rating <= 5 ? Math.round(raw.rating) : 0
    const category = clampStr(raw.category, 40)
    const message = clampStr(raw.message)
    const contact = clampStr(raw.contact, 200)

    // 至少要有评分或文字，否则视为空反馈
    if (!rating && !message) {
      return Response.json({ ok: false, error: '请至少填写评分或反馈内容' }, { status: 400 })
    }

    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      rating,
      category,
      message,
      contact,
      page: clampStr(raw.page, 120),
      ua: clampStr(raw.ua, 300),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
    }

    await appendToFile(record)
    await Promise.all([forwardWebhook(record), forwardEmail(record)])

    return Response.json({ ok: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Feedback error:', msg)
    return Response.json({ ok: false, error: '提交失败，请稍后重试' }, { status: 500 })
  }
}
