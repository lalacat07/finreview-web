import Link from 'next/link'
import TopNav from '@/components/TopNav'
import {
  BRAND, BRAND_LIGHT, BRAND_TINT, BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/theme'

type Capability = {
  title: string
  items: string[]
}

const REVIEW_CAPABILITIES: Capability[] = [
  {
    title: '主表与跨表勾稽（零容忍重算）',
    items: [
      '覆盖合并与母公司单体四张主表 + 全部附注，逐表纵横验算',
      '加减方向铁律：项目前未直接标注"加/减"一律按加法（如现金流量净额 = 流入小计 + 流出小计）',
      '利润表逐层验算：毛利→营业利润→税前利润→净利润→综合收益',
      '归母 / 少数股东损益拆分之和等于合计；所得税符号方向',
      '资产负债表平衡：资产 = 负债 + 权益；流动/非流动小计',
      '股东权益变动表：期初 + 本期变动 = 期末，并与资产负债表勾稽',
      '现金流量表：三类活动 + 汇率影响 = 净变动；期末余额回勾货币资金',
      'EPS（基本 / 稀释）按加权平均股数独立重算',
    ],
  },
  {
    title: '附注与披露一致性',
    items: [
      '附注表格纵向（列合计）与横向（期初 + 变动 = 期末）双维核验',
      '成本 / 累计折旧 / 账面净值三层结构验算',
      'Note 序号连续性、"幽灵索引"扫描',
      '简称定义一致性、正负号含义全文统一',
      'IFRS / HKFRS 报表线条规范（单实线 / 双实线 / 虚实线）',
      '占位符与草稿痕迹检查：[date]、DRAFT 水印、签字栏空白',
    ],
  },
  {
    title: '现金流量表逐行深度勾稽',
    items: [
      '间接法非现金调节项逐行勾稽（折旧、减值、股份支付、利息）',
      '营运资本变动三步法（剔除并购、汇率、减值、非流动部分）',
      '投资 / 筹资活动逐行勾稽与融资活动对账表核对',
    ],
  },
  {
    title: '格式与排版核查',
    items: [
      '跨页表格（表头未续、行项断裂、小计跨页）',
      '零金额是否以"-"列示（0 及 (0) 应统一为"-"）',
      '附注编号连续性与格式统一、附注号交叉引用正确',
      '页码连续性与交叉引用页码一致',
      '"产生/(使用)"等括号方向、千分位规范',
      '空白与占位符（页码 / 编号 / 内容空白、[date] 等）',
      '附注文字金额币种标注、四舍五入差错',
    ],
  },
  {
    title: '语言合规核查',
    items: [
      '中英文语系一致性（英式 / 美式拼写、日期格式、标点）',
      '主谓一致、句式完整、专业术语规范、无中式英语',
      '法定声明完整性',
    ],
  },
]

const HEALTH_DIMS = [
  '盈利能力', '偿债能力', '现金流质量', '营运能力',
  '成长性', '重大异常波动', '持续经营与经营质量风险',
]

export default function MethodologyPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
      <TopNav active="methodology" />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 64px' }}>
        <Link href="/" style={{ color: TEXT_MUTED, textDecoration: 'none', fontSize: '13px' }}>
          ← 返回首页
        </Link>
        <h1 style={{ fontSize: '30px', fontWeight: 800, marginTop: '16px', marginBottom: '12px', letterSpacing: '-0.5px' }}>
          检测方法论与能力清单
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: '15px', lineHeight: 1.7, marginBottom: '28px' }}>
          本页透明列出系统执行的检查维度，便于审计、财务与披露人员评估其适用范围。
          检测围绕两个产出：<strong>数据复核与披露检查</strong>（报表勾稽、附注一致性、语言合规）与<strong>财务健康度分析</strong>（7 维度审慎评估），均以事实呈现为主、判断权交给使用者。
        </p>

        {/* 能力边界 */}
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '12px',
            padding: '18px 20px',
            marginBottom: '28px',
            color: '#92400e',
            fontSize: '13.5px',
            lineHeight: 1.75,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>⚠️ 能力边界（请务必了解）</div>
          <div>
            本工具以<strong>事实与统计呈现</strong>为主（给出勾稽差异、比率、M-Score 数值与准则口径，判断权交给使用者），
            <strong>不对任何具名主体作出财务造假/舞弊的认定，也不构成审计、鉴证或证券投资建议</strong>。
            它主要核查<strong>报告内部一致性、勾稽与披露完整性</strong>，
            <strong>无法识别内部自洽的实质性造假</strong>（如全套报告口径一致但数据本身虚假）。
需结合底稿、合同与外部信息才能定性的事项，仅作<strong>线索提示</strong>，归入「待管理层确认事项」。
            另：当前依赖可复制文本，<strong>扫描件 / 图片型 PDF 暂不支持</strong>（会预警）；长报告分块解析，结论限于「已解析内容」。所有结论须经专业人员人工复核。
          </div>
        </div>

        {/* 模块一：数据复核 */}
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '14px' }}>模块一 · 数据复核与披露检查</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
          {REVIEW_CAPABILITIES.map((cap) => (
            <div
              key={cap.title}
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${BORDER}`,
                borderRadius: '12px',
                padding: '18px 20px',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 700, color: BRAND, marginBottom: '10px' }}>
                {cap.title}
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: TEXT_SECONDARY, fontSize: '13.5px', lineHeight: 1.85 }}>
                {cap.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 模块二：健康度 */}
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '14px' }}>模块二 · 财务健康度分析（7 维度）</h2>
        <div
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderRadius: '12px',
            padding: '18px 20px',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {HEALTH_DIMS.map((d) => (
            <span
              key={d}
              style={{
                backgroundColor: BRAND_TINT,
                color: BRAND,
                border: `1px solid #bfdbfe`,
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {d}
            </span>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <Link
            href="/analyze"
            style={{
              backgroundColor: BRAND_LIGHT,
              color: 'white',
              padding: '13px 32px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '15px',
              display: 'inline-block',
            }}
          >
            上传报告，开始检查 →
          </Link>
        </div>
      </div>
    </div>
  )
}
