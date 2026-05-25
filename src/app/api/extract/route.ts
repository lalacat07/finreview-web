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

    let text = data.text
    let truncated = false
    if (text.length > 80000) {
      text = text.substring(0, 80000)
      truncated = true
    }

    return NextResponse.json({
      text,
      pageCount: data.numpages,
      truncated,
      charCount: text.length,
    })
  } catch (error) {
    console.error('PDF extraction error:', error)
    return NextResponse.json({ error: 'PDF解析失败，请确认文件格式正确' }, { status: 500 })
  }
}
