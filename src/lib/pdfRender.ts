/** 为 pdf.js 在 Node 运行时补齐缺失的浏览器全局对象（DOMMatrix 等） */
async function ensureCanvasGlobals(): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>
  if (g.DOMMatrix && g.Path2D && g.ImageData) return
  const canvas = (await import('@napi-rs/canvas')) as unknown as Record<string, unknown>
  for (const k of ['DOMMatrix', 'Path2D', 'ImageData', 'DOMPoint', 'DOMRect']) {
    if (!g[k] && canvas[k]) g[k] = canvas[k]
  }
}

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
  // 在加载 pdf.js 之前补齐浏览器全局对象：部分 Serverless Node 运行时（如 Vercel）
  // 缺少 DOMMatrix / Path2D / ImageData 等，pdf.js 渲染会抛 "DOMMatrix is not defined"。
  // 用 @napi-rs/canvas 提供的实现挂到 globalThis。
  await ensureCanvasGlobals()
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
