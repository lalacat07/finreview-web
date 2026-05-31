export const dynamic = 'force-dynamic'

/* 「指标重算」功能已下线。此路由保留为占位，统一返回 410 Gone。
 * 可在本机删除整个 src/app/api/figures 目录。 */
export async function POST() {
  return Response.json({ error: '指标重算功能已下线' }, { status: 410 })
}
