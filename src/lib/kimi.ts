/* Kimi（Moonshot）文件解析工具：把 PDF 上传到 file-extract 接口，取回解析后的文本
 * （含扫描件 OCR、表格还原）。供 /api/kimi-extract 与 /api/analyze 复用。 */

export const MOONSHOT_BASE_URL = process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1'

/** 清洗 API key：去掉换行/空格等空白字符 */
export const cleanKey = (k?: string) => (k || '').replace(/\s/g, '')

/** 上传 PDF 到 Moonshot 并取回解析后的文本内容 */
export async function moonshotExtract(buf: Buffer, filename: string): Promise<string> {
  const key = cleanKey(process.env.MOONSHOT_API_KEY)
  if (!key) throw new Error('未配置 MOONSHOT_API_KEY')
  const form = new FormData()
  form.append('purpose', 'file-extract')
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'application/pdf' }), filename || 'report.pdf')
  const up = await fetch(`${MOONSHOT_BASE_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!up.ok) throw new Error(`文件上传失败（${up.status}）：${(await up.text()).slice(0, 200)}`)
  const upJson = (await up.json()) as { id?: string }
  const fileId = upJson.id
  if (!fileId) throw new Error('文件上传未返回 file id')
  const cont = await fetch(`${MOONSHOT_BASE_URL}/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!cont.ok) throw new Error(`文件解析失败（${cont.status}）：${(await cont.text()).slice(0, 200)}`)
  const raw = await cont.text()
  try {
    const j = JSON.parse(raw) as { content?: string; text?: string }
    return j.content || j.text || raw
  } catch {
    return raw
  }
}
