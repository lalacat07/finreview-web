import Link from 'next/link'

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f1f5f9' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #2d3048', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '18px' }}>
          <span style={{ color: '#3b82f6' }}>财报穿透</span>
          <span style={{ color: '#64748b', marginLeft: '8px', fontSize: '14px' }}>FinReview</span>
        </div>
        <Link href="/analyze" style={{ backgroundColor: '#3b82f6', color: 'white', padding: '8px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>开始分析</Link>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '80px 32px 60px' }}>
        <div style={{ display: 'inline-block', backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '20px', padding: '6px 16px', fontSize: '13px', color: '#93c5fd', marginBottom: '24px' }}>
          基于四大事务所审计方法论
        </div>
        <h1 style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1.2, marginBottom: '20px', maxWidth: '700px', margin: '0 auto 20px' }}>
          专业级财务报告
          <br /><span style={{ color: '#3b82f6' }}>审查与风险识别</span>平台
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '18px', maxWidth: '560px', margin: '0 auto 40px', lineHeight: 1.7 }}>
          智能识别数据错误、披露缺陷与财务风险信号，出具媲美四大水准的复核报告
        </p>
        <Link href="/analyze" style={{ backgroundColor: '#3b82f6', color: 'white', padding: '16px 36px', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '16px', display: 'inline-block' }}>
          立即上传报告 →
        </Link>

        {/* Trust bar */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '48px', flexWrap: 'wrap' }}>
          {['✓ IFRS · HKFRS · US GAAP · CAS', '✓ 零容忍尾差核验', '✓ Beneish M-Score 舞弊模型', '✓ CAS专项风险识别'].map(t => (
            <span key={t} style={{ color: '#64748b', fontSize: '13px' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Feature Cards */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {[
          {
            icon: '🔍', title: '穿透式复核',
            subtitle: 'Penetrating Review',
            desc: '深度扫描财务报告合规性、语言一致性、格式规范与数字勾稽，涵盖利润表、资产负债表、现金流量表及全部附注，逐层输出问题清单',
            items: ['语言与语法合规', '全表算术零容忍核验', '跨表金额一致性', '附注横纵双维度核验', 'EPS独立重算'],
          },
          {
            icon: '📊', title: '财务分析',
            subtitle: 'Financial Analysis',
            desc: '全套财务比率计算，结合Beneish M-Score舞弊模型和中国会计准则专项风险指标，识别利润质量问题、关联交易异常及债务结构风险',
            items: ['流动性/偿债/盈利/效率比率', '现金流质量评估', 'Beneish M-Score', '在建工程/预付款异常', '关联交易风险识别'],
          },
        ].map(card => (
          <div key={card.title} style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', padding: '28px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>{card.icon}</div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{card.title}</h3>
            <p style={{ color: '#3b82f6', fontSize: '13px', marginBottom: '12px' }}>{card.subtitle}</p>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>{card.desc}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {card.items.map(item => (
                <li key={item} style={{ color: '#64748b', fontSize: '13px', padding: '4px 0', borderTop: '1px solid #1e2132' }}>
                  <span style={{ color: '#3b82f6', marginRight: '8px' }}>›</span>{item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #2d3048', padding: '24px 32px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>
        财报穿透 FinReview © 2025 · 专业审计辅助工具 · 结果仅供参考，不构成正式审计意见
      </div>
    </div>
  )
}
