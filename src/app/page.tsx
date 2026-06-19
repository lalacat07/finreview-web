import Link from 'next/link'
import TopNav from '@/components/TopNav'
import {
  BRAND, BRAND_LIGHT, BRAND_TINT, BRAND_STRONG_BG,
  BORDER, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/theme'

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
      <TopNav active="home" />

      {/* ───── Hero 区 ───── */}
      <section
        style={{
          background: `linear-gradient(180deg, #0b1220 0%, #0f172a 75%, #f6f8fb 100%)`,
          padding: '64px 32px 0',
          position: 'relative',
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span
              style={{
                display: 'inline-block',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(96, 165, 250, 0.3)',
                color: '#93c5fd',
                fontSize: '12px',
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: '20px',
                marginBottom: '20px',
                letterSpacing: '0.02em',
              }}
            >
              企业级 · 财务报告智能审阅
            </span>
            <h1
              style={{
                fontSize: '44px',
                fontWeight: 800,
                lineHeight: 1.2,
                marginBottom: '20px',
                color: '#ffffff',
                letterSpacing: '-0.5px',
              }}
            >
              AI 财务报告
              <span style={{ color: '#60a5fa' }}> 审阅</span>
              <span style={{ color: '#e2e8f0' }}> 与 </span>
              <span style={{ color: '#60a5fa' }}>风险提示</span>
              <span style={{ color: '#e2e8f0' }}>平台</span>
            </h1>
            <p
              style={{
                color: '#cbd5e1',
                fontSize: '17px',
                maxWidth: '720px',
                margin: '0 auto 32px',
                lineHeight: 1.7,
              }}
            >
              上传财务报告后，系统自动进行数据一致性复核、披露完整性检查及财务风险识别，
              辅助企业提升报告编制质量与合规自查效率。
            </p>
            <div
              style={{
                display: 'flex',
                gap: '14px',
                justifyContent: 'center',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href="/analyze"
                style={{
                  backgroundColor: BRAND_LIGHT,
                  color: 'white',
                  padding: '14px 32px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '15px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 24px rgba(37, 99, 235, 0.35)',
                }}
              >
                上传财务报告，立即开始智能检查
                <span style={{ fontSize: '18px' }}>→</span>
              </Link>
              <Link
                href="/results?demo=true"
                style={{
                  backgroundColor: 'transparent',
                  color: '#cbd5e1',
                  padding: '13px 22px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  border: '1px solid #334155',
                }}
              >
                查看示例报告
              </Link>
            </div>

            {/* 准则标签 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                marginTop: '32px',
                flexWrap: 'wrap',
              }}
            >
              {['CAS 中国企业会计准则', 'IFRS / HKFRS', 'US GAAP'].map((t) => (
                <span
                  key={t}
                  style={{
                    backgroundColor: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '5px',
                    padding: '5px 12px',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Hero 下方价值条 — 浮在过渡区上 */}
          <div
            className="fg-grid-4"
            style={{
              backgroundColor: '#ffffff',
              border: `1px solid ${BORDER}`,
              borderRadius: '14px',
              padding: '24px 32px',
              boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
              marginBottom: '-40px',
              position: 'relative',
            }}
          >
            {[
              { num: '1–2min', label: '通常完成已解析内容复核' },
              { num: '多维', label: '勾稽、披露与语言合规检查' },
              { num: '7', label: '财务健康度分析维度' },
              { num: '3', label: '适配准则体系（CAS·IFRS·US GAAP）' },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 800,
                    color: BRAND,
                    letterSpacing: '-0.5px',
                  }}
                >
                  {s.num}
                </div>
                <div style={{ fontSize: '12px', color: TEXT_MUTED, marginTop: '4px' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── 两大核心模块 ───── */}
      <section
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '88px 32px 24px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2
            style={{
              fontSize: '26px',
              fontWeight: 800,
              color: TEXT_PRIMARY,
              marginBottom: '10px',
            }}
          >
            两大核心能力，覆盖报告自查全流程
          </h2>
          <p style={{ color: TEXT_MUTED, fontSize: '15px', maxWidth: '640px', margin: '0 auto' }}>
            围绕「数据复核」与「风险识别」，从报表勾稽到经营质量，系统化辅助报告编制与披露自查。
          </p>
        </div>

        <div className="fg-grid-2">
          {[
            {
              icon: '🔢',
              tag: '数据复核 · 披露自查',
              title: '财务数据复核',
              subtitle:
                '系统化核验报表勾稽、附注一致性、关键指标计算与前后文披露口径。',
              items: [
                '全主表 + 全附注纵横加总，加减方向铁律核验',
                '跨表勾稽（净利润 ↔ 现金流量表 ↔ 权益变动表）',
                '附注表格纵横双维度核验',
                '格式排版：跨页表格、零金额"-"、附注编号、页码、千分位',
                '括号方向、币种标注、空白占位符与四舍五入核查',
              ],
            },
            {
              icon: '📊',
              tag: '风险识别 · 经营质量洞察',
              title: '财务健康度分析',
              subtitle:
                '从盈利、偿债、现金流、营运、成长、异常波动与持续经营 7 个维度审慎评估。',
              items: [
                '盈利能力（毛利率、ROE 杜邦分解）',
                '偿债能力（流动比率、利息保障倍数）',
                '现金流质量（现金收益比、自由现金流）',
                '营运能力（DSO、存货周转、现金转换周期）',
                '异常波动与持续经营风险（商誉、现金流背离等）',
              ],
            },
          ].map((card) => (
            <div
              key={card.title}
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${BORDER}`,
                borderRadius: '14px',
                padding: '28px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: BRAND_TINT,
                  color: BRAND,
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                }}
              >
                <span style={{ fontSize: '14px' }}>{card.icon}</span>
                {card.tag}
              </div>
              <h3
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: TEXT_PRIMARY,
                  marginBottom: '8px',
                  letterSpacing: '-0.3px',
                }}
              >
                {card.title}
              </h3>
              <p
                style={{
                  color: TEXT_SECONDARY,
                  fontSize: '14px',
                  lineHeight: 1.65,
                  marginBottom: '18px',
                }}
              >
                {card.subtitle}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {card.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      color: TEXT_SECONDARY,
                      fontSize: '13.5px',
                      padding: '9px 0',
                      borderTop: `1px solid ${BORDER}`,
                      display: 'flex',
                      gap: '10px',
                      lineHeight: 1.55,
                    }}
                  >
                    <span
                      style={{
                        color: BRAND_LIGHT,
                        flexShrink: 0,
                        fontWeight: 700,
                      }}
                    >
                      ›
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ───── 差异化能力 ───── */}
      <section
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '28px 32px 8px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: TEXT_PRIMARY, marginBottom: '8px' }}>
            事实呈现，可追溯复核
          </h2>
          <p style={{ color: TEXT_MUTED, fontSize: '14px', maxWidth: '640px', margin: '0 auto' }}>
            只陈述可独立验证的客观差异与勾稽结果，附原文定位，判断权交给使用者——不下「造假」结论。
          </p>
        </div>
        <div className="fg-grid-4" style={{ gap: '14px' }}>
          {[
            { icon: '🔢', title: '勾稽零容忍', desc: '主表加总、平衡等式、跨表勾稽、EPS 重算逐项核验，差异附原始数字' },
            { icon: '🔗', title: '披露一致性', desc: '附注纵横双维核验、前后文口径、占位符 / 草稿痕迹、报表线条规范' },
            { icon: '🅰️', title: '语言合规核查', desc: '中英文语系一致性、术语规范、法定声明完整性——双语年报尤其适用' },
            { icon: '🔍', title: '原文定位 + 风险分级', desc: '每个问题附证据链与原文片段，分"明显问题"与"待管理层确认"，可追溯' },
          ].map((c) => (
            <div
              key={c.title}
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${BORDER}`,
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div style={{ fontSize: '22px', marginBottom: '8px' }} aria-hidden="true">{c.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: TEXT_PRIMARY, marginBottom: '6px' }}>
                {c.title}
              </div>
              <div style={{ fontSize: '12.5px', color: TEXT_MUTED, lineHeight: 1.6 }}>{c.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link
            href="/methodology"
            style={{
              color: BRAND_LIGHT,
              fontWeight: 600,
              fontSize: '14px',
              textDecoration: 'none',
            }}
          >
            查看完整检测方法论与能力清单 →
          </Link>
        </div>
      </section>

      {/* ───── 使用流程 ───── */}
      <section
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '40px 32px 32px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: TEXT_PRIMARY,
              marginBottom: '8px',
            }}
          >
            四步完成专业级报告复核
          </h2>
        </div>
        <div className="fg-grid-4" style={{ gap: '14px' }}>
          {[
            { step: '01', title: '上传报告', desc: '上传 PDF 格式财务报告' },
            { step: '02', title: '自动识别', desc: '识别报告类型、期间、准则、审计师' },
            { step: '03', title: '智能检查', desc: '数据复核 + 披露检查 + 风险识别' },
            { step: '04', title: '查看结果', desc: '模块化呈现问题与修改建议' },
          ].map((s) => (
            <div
              key={s.step}
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${BORDER}`,
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: BRAND_LIGHT,
                  marginBottom: '8px',
                  letterSpacing: '0.06em',
                }}
              >
                STEP {s.step}
              </div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  marginBottom: '4px',
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: '13px', color: TEXT_MUTED, lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── CTA ───── */}
      <section
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '32px 32px 64px',
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_STRONG_BG} 100%)`,
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center',
            color: 'white',
          }}
        >
          <h3
            style={{
              fontSize: '24px',
              fontWeight: 800,
              marginBottom: '10px',
              letterSpacing: '-0.3px',
            }}
          >
            现在就上传报告，快速获得复核与风险提示
          </h3>
          <p
            style={{
              color: '#bfdbfe',
              fontSize: '14px',
              maxWidth: '560px',
              margin: '0 auto 22px',
              lineHeight: 1.6,
            }}
          >
            报告内容将发送至第三方大模型服务商进行分析处理。建议优先上传已公开发布的报告，内部草稿请先脱敏。结果可直接交付报告编制人员处理。
          </p>
          <Link
            href="/analyze"
            style={{
              backgroundColor: 'white',
              color: BRAND,
              padding: '13px 32px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '15px',
              display: 'inline-block',
            }}
          >
            立即开始智能检查 →
          </Link>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: '24px 32px',
          textAlign: 'center',
          color: TEXT_MUTED,
          fontSize: '12.5px',
          backgroundColor: '#ffffff',
        }}
      >
        <div style={{ marginBottom: '6px' }}>
          FinGuard © 2026 · AI 财务报告审阅与风险提示平台
        </div>
        <div style={{ color: '#94a3b8', maxWidth: '760px', margin: '0 auto 6px', lineHeight: 1.7 }}>
本工具为辅助自查工具，以事实与统计呈现为主，<strong>不对任何主体作出财务造假或舞弊的认定，也不构成审计、鉴证、证券投资建议</strong>或任何专业财务意见，亦不替代注册会计师的专业判断。AI 分析可能存在遗漏或误判，所有结论均须经专业人员人工复核后方可使用。
        </div>
        <div style={{ color: '#94a3b8' }}>
          报告内容将发送至第三方大模型服务商进行分析处理 · 建议优先上传已公开报告，内部草稿请先脱敏
        </div>
      </footer>
    </div>
  )
}
