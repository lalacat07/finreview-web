import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/apiGuard'
import { moonshotExtract } from '@/lib/kimi'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * 用 Kimi(Moonshot) 原生解析 PDF 为文本（含扫描件 OCR、表格还原）。
 * 单次调用，便于前端"分段编排"：先取一次高质量文本，再分段送 /api/analyze。
 * 若未配置 MOONSHOT_API_KEY 或解析失败，前端应回退到 /api/extract（pdf-parse）。
 */
export async function POST(request: NextRequest) {
  const blocked = guard(request, { limit: 20, windowMs: 60_000, name: 'kimi-extract' })
  if (blocked) return blocked
  if (!process.env.MOONSHOT_API_KEY) {
    return NextResponse.json({ error: '未配置 MOONSHOT_API_KEY' }, { status: 400 })
  }
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '未找到文件' }, { status: 400 })
    }
    const buf = Buffer.from(await (file as File).arrayBuffer())
    const text = await moonshotExtract(buf, (file as File).name || 'report.pdf')
    return NextResponse.json({ text, charCount: text.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Kimi 解析失败：${msg}` }, { status: 500 })
  }
}
