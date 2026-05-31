import { NextRequest, NextResponse } from 'next/server'

// Use the inner lib directly to avoid pdf-parse index.js running test code
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  buffer: Buffer,
  options?: object
) => Promise<{ text: string; numpages: number }>

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: '未找到文件' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await pdfParse(buffer)

    // 保留更长的原文以支持分块分析；仅在极端超长（>240k 字）时硬截断兜底。
    const HARD_CAP = 240000
    let text = data.text
    let truncated = false
    if (text.length > HARD_CAP) {
      text = text.substring(0, HARD_CAP)
      truncated = true
    }

    // 图片型/扫描型 PDF 检测：可提取文本的 PDF 每页通常有数百至上千字符，
    // 若每页平均字符过低，极可能是扫描件/图片版，pdf-parse 抽不到正文，
    // 会导致"未发现问题"的假阴性。需明确预警（当前未接 OCR）。
    const pageCount = data.numpages || 0
    const charsPerPage = pageCount > 0 ? text.length / pageCount : text.length
    const lowText = pageCount > 0 && charsPerPage < 80 && text.trim().length < 1000

    return NextResponse.json({
      text,
      pageCount: data.numpages,
      truncated,
      charCount: text.length,
      lowText,
      charsPerPage: Math.round(charsPerPage),
    })
  } catch (error) {
    console.error('PDF extraction error:', error)
    return NextResponse.json({ error: 'PDF解析失败，请确认文件格式正确' }, { status: 500 })
  }
}
