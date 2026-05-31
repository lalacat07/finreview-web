import { NextRequest } from 'next/server'

/**
 * 轻量 API 防护：按 IP 滑动窗口限流 + 同源校验。
 *
 * 说明：限流为进程内内存实现（best-effort）。serverless 多实例下不共享，
 * 但足以挡住单实例上的暴力刷接口；如需强一致请接入 Redis/Upstash。
 */

interface Bucket {
  count: number
  reset: number // epoch ms
}

const buckets = new Map<string, Bucket>()

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

/** 同源校验：仅当请求带 Origin 且其 host 与本站 host 不一致时判为跨站 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // 同源浏览器请求/服务端调用可能不带 Origin，放行
  try {
    const o = new URL(origin).host
    const host = req.headers.get('host') || ''
    return o === host
  } catch {
    return false
  }
}

export interface GuardOptions {
  /** 窗口内允许次数 */
  limit: number
  /** 窗口长度（毫秒） */
  windowMs: number
  /** 限流分桶名（区分不同接口） */
  name: string
  /** 是否要求同源（默认 true） */
  requireSameOrigin?: boolean
}

/**
 * 入口守卫：被拦截返回 Response（403/429），通过返回 null。
 */
export function guard(req: NextRequest, opts: GuardOptions): Response | null {
  if (opts.requireSameOrigin !== false && !isSameOrigin(req)) {
    return Response.json({ error: '跨站请求被拒绝' }, { status: 403 })
  }

  const now = Date.now()
  const key = `${opts.name}:${clientIp(req)}`
  const b = buckets.get(key)
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + opts.windowMs })
  } else {
    b.count += 1
    if (b.count > opts.limit) {
      const retryAfter = Math.ceil((b.reset - now) / 1000)
      return new Response(
        JSON.stringify({ error: `请求过于频繁，请 ${retryAfter} 秒后再试` }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) } }
      )
    }
  }

  // 偶发清理过期桶，避免内存无限增长
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k)
  }
  return null
}
