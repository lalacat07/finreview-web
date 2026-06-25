/**
 * 将 PDF 渲染为逐页图像（PNG 的 base64 data URI）。
 * 用于把 PDF 交给"只吃图片"的视觉模型（如 GLM-4.5V）逐页审阅，
 * 既能识别扫描件/图片型报告，又能保留表格的行列版面。
 *
 * @param buffer PDF 字节
 * @param opts.maxPages 最多渲染页数（控制时延/内存/成本，超出部分忽略）
 * @param opts.scale 渲染倍率（越大越清晰但越大；1.5 对财报文字表格通常足够）
 */
export async function renderPdfToImages(
  buffer: Buffer,
  opts: { maxPages?: number; scale?: number } = {}
): Promise<{ images: string[]; total: number; rendered: number }> {
  const { maxPages = 40, scale = 1.5 } = opts
  // 动态导入：pdf-to-img 依赖原生 canvas，若该环境加载失败也只影响 GLM 渲染，
  // 不会让整个 /api/analyze 路由在模块加载阶段崩溃（文本兜底路径仍可用）。
  const { pdf } = await import('pdf-to-img')
  const doc = await pdf(buffer, { scale })
  const total = doc.length
  const images: string[] = []
  let i = 0
  for await (const page of doc) {
    i++
    if (i > maxPages) break
    images.push(`data:image/png;base64,${page.toString('base64')}`)
  }
  return { images, total, rendered: images.length }
}
