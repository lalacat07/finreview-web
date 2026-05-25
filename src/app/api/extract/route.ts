import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: '未找到文件' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>
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
