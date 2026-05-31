import Link from 'next/link'
import {
  NAV_BG, NAV_MUTED, BRAND, BRAND_LIGHT, BRAND_TINT, BORDER,
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
    title: '监管高频关注点扫描',
    items: [
      '控股股东 / 关联方资金占用与非经营性往来线索',
      '违规担保、对外担保披露一致性',
      '关联交易非关联化与港股关连交易（上市规则第 14A 章）披露',
      '收入确认（总额 / 净额法、确认时点、可变对价）',
      '商誉与长期资产减值充分性与时点',
      '研发支出资本化合理性、存货 / 应收减值计提充分性',
    ],
  },
  {
    title: '集团合并与准则专项',
    items: [
      '合并范围变动、合并抵销完整性',
      'VIE / 协议控制并表依据与披露',
      '分部报告勾稽与口径一致',
      '经调整 / Non-IFRS 指标与法定数桥接',
      '所得税费用调节表（ETR）与递延所得税',
      '新准则（收入 / 金融工具 / 租赁）首次执行过渡披露',
      'CAS 特有：扣非净利润、母公司报表、现金流量表补充资料',
      '港股特别项：强制 ESG 披露、股权高度集中、估值报告依赖、财务资助',
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

const DETERMINISTIC = [
  '盈利能力：毛利率、净利率、ROE（杜邦分解）、ROA',
  '偿债能力：资产负债率、流动比率、速动比率、利息保障倍数',
  '现金流质量：现金收益比、自由现金流',
  '营运能力：应收周转天数、存货周转天数、应付周转天数',
  '每股指标：基本每股收益重算',
  '成长性：营业收入、归母净利润同比（如有对比期）',
  'Altman Z-Score 破产 / 持续经营预警（公开公式，列出分项贡献）',
  'Beneish M-Score 盈余操纵预警（8 变量，需两期数据）',
]

const HEALTH_DIMS = [
  '盈利能力', '偿债能力', '现金流质量', '营运能力',
  '成长性', '重大异常波动', '持续经营与经营质量风险',
]

export default function MethodologyPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f8fb', color: TEXT_PRIMARY }}>
      {/* 顶部导航 */}
      <nav
        style={{
          backgroundColor: NAV_BG,
          padding: '14px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
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
          >
            FG
          </div>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>
            <span style={{ color: '#93c5fd' }}>Fin</span>
            <span style={{ color: '#ffffff' }}>Guard</span>
            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 500, color: NAV_MUTED }}>
              检测方法论
            </span>
          </div>
        </Link>
        <Link
          href="/analyze"
          style={{
            backgroundColor: BRAND_LIGHT,
            color: 'white',
            padding: '7px 18px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          进入工作台
        </Link>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 64px' }}>
        <Link href="/" style={{ color: TEXT_MUTED, textDecoration: 'none', fontSize: '13px' }}>
          ← 返回首页
        </Link>
        <h1 style={{ fontSize: '30px', fontWeight: 800, marginTop: '16px', marginBottom: '12px', letterSpacing: '-0.5px' }}>
          检测方法论与能力清单
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: '15px', lineHeight: 1.7, marginBottom: '28px' }}>
          本页透明列出系统执行的检查维度与计算口径，便于审计、财务与披露人员评估其适用范围。
          检测分两条主线：大模型负责<strong>结构识别、取数与文本一致性核对</strong>，确定性引擎负责<strong>按公开公式重算关键指标</strong>。
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
            本工具主要核查<strong>报告内部一致性、勾稽与披露完整性</strong>，<strong>不构成审计或鉴证</strong>，
            也<strong>无法识别内部自洽的实质性造假</strong>（如全套报告口径一致但数据本身虚假）。
            资金占用、关联交易公允性、减值充分性等需结合底稿、合同与外部信息的事项，仅作<strong>线索提示</strong>，归入「待管理层确认事项」。
            当前指标体系面向<strong>工商业企业</strong>，<strong>不针对银行 / 保险 / 证券等金融业</strong>（其资本充足率、偿付能力等专属指标不在覆盖范围）。
            另：当前依赖可复制文本，<strong>扫描件 / 图片型 PDF 暂不支持</strong>（会预警）。所有结论须经专业人员人工复核。
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

        {/* 确定性引擎 */}
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '14px' }}>确定性重算引擎（可逐项复核）</h2>
        <div
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderRadius: '12px',
            padding: '18px 20px',
            marginBottom: '32px',
          }}
        >
          <p style={{ color: TEXT_SECONDARY, fontSize: '13.5px', lineHeight: 1.7, marginBottom: '10px' }}>
            以下指标由程序按公开公式独立计算，并附「公式 + 代入数字 + 结果」，缺失或分母为零的项记为 N/A，绝不编造：
          </p>
          <ul style={{ margin: 0, paddingLeft: '18px', color: TEXT_SECONDARY, fontSize: '13.5px', lineHeight: 1.85 }}>
            {DETERMINISTIC.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </div>

        <div style={{ textAlign: 'center' }}>
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
