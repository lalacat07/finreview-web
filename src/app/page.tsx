import Link from 'next/link'

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f1f5f9' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #2d3048', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '-0.5px' }}>
          <span style={{ color: '#3b82f6' }}>Fin</span><span style={{ color: '#f1f5f9' }}>Guard</span>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '80px 32px 60px' }}>
        <h1 style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1.2, marginBottom: '20px', maxWidth: '700px', margin: '0 auto 20px' }}>
          专业级财务报告
          <br /><span style={{ color: '#3b82f6' }}>自查与风险识别</span>平台
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '18px', maxWidth: '560px', margin: '0 auto 40px', lineHeight: 1.7 }}>
          帮助企业财务团队在发布前自查，识别数字错误、披露缺陷与风险信号
        </p>
        <Link href="/analyze" style={{ backgroundColor: '#3b82f6', color: 'white', padding: '16px 36px', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '16px', display: 'inline-block' }}>
          立即上传报告 →
        </Link>

        {/* Trust bar */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '48px', flexWrap: 'wrap', alignItems: 'center' }}>
          {['IFRS / HKFRS', 'CAS 中国会计准则', 'US GAAP'].map(t => (
            <span key={t} style={{
              backgroundColor: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: '6px',
              padding: '5px 14px',
              color: '#93c5fd',
              fontSize: '13px',
              fontWeight: 500,
            }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Feature Cards */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {[
          {
            icon: '🔍', title: '数据检查',
            subtitle: '数字核验 · 跨表勾稽 · 一致性核查',
            items: ['全表算术加总零容忍核验', '跨表金额一致性勾稽', '现金流量表与资产负债表勾稽', '附注纵横双维度核验', '语言语法合规检查'],
          },
          {
            icon: '📊', title: '财务健康度',
            subtitle: '财务比率 · 风险信号 · 综合评级',
            items: ['流动性/偿债/盈利/效率比率', '现金流质量评估', 'Beneish M-Score舞弊模型', '在建工程/预付款异常识别', '关联交易风险识别'],
          },
        ].map(card => (
          <div key={card.title} style={{ backgroundColor: '#1a1d27', border: '1px solid #2d3048', borderRadius: '12px', padding: '28px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>{card.icon}</div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{card.title}</h3>
            <p style={{ color: '#3b82f6', fontSize: '13px', marginBottom: '20px' }}>{card.subtitle}</p>
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
        <div>FinGuard © 2026 · 结果仅供参考，不构成正式财务意见</div>
        <div style={{ marginTop: '8px', color: '#374151' }}>文件仅用于本次分析，不做存储或训练 · 分析完成后自动删除</div>
      </div>
    </div>
  )
}
