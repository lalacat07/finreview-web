import Link from 'next/link'
import { NAV_BG, NAV_MUTED, BRAND, BRAND_LIGHT } from '@/lib/theme'

export type NavKey = 'home' | 'methodology' | 'analyze' | 'history'

const LINKS: { key: NavKey; href: string; label: string }[] = [
  { key: 'home', href: '/', label: '产品介绍' },
  { key: 'methodology', href: '/methodology', label: '检测方法论' },
  { key: 'history', href: '/history', label: '历史报告' },
]

/** 全站统一顶部导航。active 指定当前页高亮，cta 控制是否显示"进入工作台"按钮。 */
export default function TopNav({ active }: { active?: NavKey }) {
  return (
    <nav
      style={{
        backgroundColor: NAV_BG,
        color: '#e2e8f0',
        padding: '14px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: `linear-gradient(135deg, ${BRAND_LIGHT}, ${BRAND})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 800,
            fontSize: '12px',
          }}
          aria-hidden="true"
        >
          FG
        </div>
        <div style={{ fontWeight: 700, fontSize: '16px' }}>
          <span style={{ color: '#93c5fd' }}>Fin</span>
          <span style={{ color: '#ffffff' }}>Guard</span>
          <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 500, color: NAV_MUTED }}>
            AI 财务报告审阅平台
          </span>
        </div>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', fontSize: '13px' }}>
        {LINKS.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            style={{
              color: active === l.key ? '#ffffff' : NAV_MUTED,
              textDecoration: 'none',
              fontWeight: active === l.key ? 700 : 500,
            }}
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/analyze"
          style={{
            backgroundColor: BRAND_LIGHT,
            color: 'white',
            padding: '7px 18px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          进入工作台
        </Link>
      </div>
    </nav>
  )
}
