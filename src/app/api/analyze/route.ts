import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { guard } from '@/lib/apiGuard'
import { renderPdfToImages } from '@/lib/pdfRender'

export const maxDuration = 300 // Vercel Pro 上限 300s；大报告分块分析需要更长时间
export const dynamic = 'force-dynamic'

/** 清洗 API key：去掉换行/空格等空白字符（防止环境变量误带换行导致 Header 非法） */
const cleanKey = (k?: string) => (k || '').replace(/\s/g, '')

const client = new OpenAI({
  apiKey: cleanKey(process.env.DEEPSEEK_API_KEY || process.env.ARK_API_KEY),
  baseURL: process.env.DEEPSEEK_API_KEY
    ? 'https://api.deepseek.com'
    : 'https://ark.cn-beijing.volces.com/api/v3',
})

const MODEL = process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'doubao-1-5-pro-32k-250115'

/* ─────────────────────────────────────────────────────────────────────────────
 * Claude 视觉路径（原生读取 PDF）
 *  当配置 ANTHROPIC_API_KEY 且可直接传入 PDF 时，使用 Claude 的 document 块
 *  让模型逐页"看"版面：既能识别扫描件/图片型 PDF，又能保留表格行列结构，
 *  显著提升横纵向勾稽与格式（跨页表格、千分位、零金额"-"等）的检出能力。
 * ────────────────────────────────────────────────────────────────────────────*/
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: cleanKey(process.env.ANTHROPIC_API_KEY) })
  : null
const VISION_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
// Claude 单次请求 PDF 限制：≤100 页且 ≤32MB；超出则回退到纯文本路径
const VISION_MAX_PAGES = 100
const VISION_MAX_BYTES = 30 * 1024 * 1024

/* ─────────────────────────────────────────────────────────────────────────────
 * GLM-4.5V 视觉路径（国内多模态，OpenAI 兼容）
 *  GLM 视觉接口只吃图片，故服务端先把 PDF 逐页渲染成图像，再分批送入模型。
 *  GLM-4.5V 上下文 64K，单次只能放有限页数，故按 GLM_PAGES_PER_CALL 分批并合并。
 * ────────────────────────────────────────────────────────────────────────────*/
const glm = process.env.ZHIPUAI_API_KEY
  ? new OpenAI({
      apiKey: cleanKey(process.env.ZHIPUAI_API_KEY),
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    })
  : null
const GLM_MODEL = process.env.ZHIPU_MODEL || 'glm-4.5v'
const GLM_MAX_PAGES = Number(process.env.GLM_MAX_PAGES || 40) // 渲染上限，超出忽略
const GLM_PAGES_PER_CALL = Number(process.env.GLM_PAGES_PER_CALL || 8) // 单次请求页数（受 64K 上下文限制）
/* ─────────────────────────────────────────────────────────────────────────────
 * Kimi（Moonshot）路径：原生解析 PDF（含扫描件 OCR、表格还原），256K 长上下文，
 * 无需服务端渲染——最适合长财报（如 200+ 页年报）。
 * 流程：上传 PDF 到 /files(purpose=file-extract) → 取解析内容 → 长上下文模型流式复核。
 * ────────────────────────────────────────────────────────────────────────────*/
const MOONSHOT_BASE_URL = process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1'
const MOONSHOT_MODEL = process.env.MOONSHOT_MODEL || 'kimi-k2.5'
const moonshot = process.env.MOONSHOT_API_KEY
  ? new OpenAI({ apiKey: cleanKey(process.env.MOONSHOT_API_KEY), baseURL: MOONSHOT_BASE_URL })
  : null

// 视觉引擎显式选择：'kimi' | 'glm' | 'claude'（留空=自动：Kimi > GLM > Claude）
const VISION_PROVIDER = (process.env.VISION_PROVIDER || '').toLowerCase()

/* ─────────────────────────────────────────────────────────────────────────────
 * SYSTEM ROLE
 *  统一身份：企业级财务报告智能审阅平台。
 *  必须直接输出最终产品化结果，不得出现"遵照指令""我将输出""根据你的要求"等模型化语言；
 *  不得使用聊天式开场白或结尾客套；不得输出推理过程或思考。
 * ────────────────────────────────────────────────────────────────────────────*/

const SYSTEM_ROLE = `你是企业级"AI 财务报告审阅与风险提示平台"的核心分析引擎。
你的输出将直接作为产品页面内容呈现给企业财务、审计、董办与上市公司报告编制人员。

【严格输出要求】
1. 直接输出结构化结果，不得使用"遵照指令""我将输出""根据你的要求""以下是我的分析""作为AI""好的"等模型化或聊天式表达。
2. 不要解释你将要做什么，也不要在结尾添加客套话或免责声明（除非属于报告页面要求的正式审慎用语）。
3. 严格遵守输出模板的章节标题和字段结构，不得增删一级章节。
4. 财务健康度分析需采用审慎表述，避免"公司财务状况良好""不存在风险"等过度绝对化判断；可使用"未发现明显异常""建议进一步关注""需结合管理层解释和底稿进一步核实"等表述。
5. 数据缺失时填"未披露"或"N/A（数据不足）"，不得编造。
6. 所有金额、指标计算需可追溯，必要时列出公式与原始数字。
7. 【事实呈现而非定性指控】对具名主体一律以"事实呈现 + 线索提示"为主：只陈述可由报告文本与数字独立验证的客观差异、勾稽结果、统计指标与准则口径，把判断权交给使用者。严禁对任何具名公司直接作出"财务造假""舞弊""盈余操纵""虚增"等定性指控；凡涉及此类可能性，须改用"该差异需进一步核实""存在需关注的线索""建议结合底稿与管理层解释判断"等审慎中性表述，并归入"待管理层确认事项"。本平台不构成审计、鉴证、证券投资建议或对造假的认定。`

/* ─────────────────────────────────────────────────────────────────────────────
 * 模块一 — 数据复核 prompt
 * 输出：## 报告总览  +  ## 财务数据复核
 * ────────────────────────────────────────────────────────────────────────────*/

const DATA_REVIEW_PROMPT = `${SYSTEM_ROLE}

请运用穿透式复核法对财务报告进行结构识别、数据复核与披露一致性检查。

【识别层】自动识别报告画像
- 报告名称（如：XX股份有限公司 2024 年度报告）
- 报告类型（年度报告 / 半年度报告 / 季度报告 / 审计报告 / 招股说明书 / 其他）
- 报告期间（如：2024 年度 / 2024 年 1-6 月）
- 适用会计准则（IFRS / HKFRS / CAS 企业会计准则 / US GAAP / 其他，若报告中未明示则根据科目命名与披露习惯审慎判断并注明"系统推断"）
- 审计机构（如：XX 会计师事务所）
- 签字注册会计师（如有披露）
- 是否为草稿（如出现 DRAFT 水印、[date]、空白栏位等）

【数据层·加减运算铁律（最高优先级，先判方向再验算）】
- 复核范围必须覆盖：合并及公司（母公司单体）层面的资产负债表、利润表、股东权益变动表、现金流量表四张主表，以及全部附注表格——是全部，不得抽样或仅取主要报表。
- 判断每个加总项的运算方向时，只看该明细项目名称前是否直接标注"加"或"减"（"减："/"减:"/"Less:"/"加："等）：
  · 明细前直接标注"减"（或 Less:）→ 该项以减法参与；
  · 明细前直接标注"加"，或未直接标注任何加减字样 → 一律按加法参与（默认加法）。
- 关键推论：现金流量表"流出小计""使用的现金"等科目，其明细本身已以负数列示，且小计行通常未标注"减"，故"净额 = 流入小计 + 流出小计"（两者相加，流出小计为负数自然抵减），不得写成"净额 = 流入小计 − 流出小计"。
  · 正确：经营活动现金流量净额 215,920 = 658,727 + (−442,807)。
  · 错误（须报为问题）：215,920 写成 658,727 − (−442,807) = 1,101,534。
- 利润表中"减：营业成本""减：税金及附加"等已标注"减"的项目按减法；未标注加减的调整项按加法（参见营业利润、利润总额、净利润的标准验算示例）。

【数据层】算术核验与跨表勾稽
- 实体名称与报表名称一致性（IFRS 下不应使用"Balance Sheet"/"Income Statement"；注意"Cash Flows"复数）
- 占位符检查：[date]、[审计报告编号]、【OS】、DRAFT 水印、董事签署栏空白
- 利润表：毛利→营业利润→税前利润→净利润→综合收益各环节逐行验算；归属母公司/少数股东(NCI)拆分之和等于合计；所得税符号方向（benefit 用正数、expense 用括号，须与税项附注方向一致）
- 资产负债表：流动/非流动资产合计、总资产、流动/非流动负债合计、负债合计、权益合计；资产=负债+权益
- 股东权益变动表：每列期初+本期变动=期末；期末余额与资产负债表权益行勾稽
- 所有附注表格：纵向（列合计）与横向（期初+变动=期末）双维度核验；含 Cost/累计折旧/账面净值三层结构者额外验算"账面净值=成本−累计折旧"；最小差异须追溯，不得用"可能为四舍五入"关闭（除非已独立重算证明）
- EPS 重算：归属于普通股股东净利润 / 加权平均股数；Basic 与 Diluted 分别重算并与利润表比对
- 现金流量表：期末余额=资产负债表现金(+受限现金)；三类活动+汇率影响=净变动；本期期初=上期期末

【数据层·现金流量表逐行深度勾稽】
- 间接法非现金调节项逐行勾稽：折旧/摊销=对应资产附注"本期计提"合计；减值=对应附注当期减值；股份支付=SBC附注；利息费用/收入=财务费用附注（须与筹资活动支付利息呼应）
- 营运资本变动三步法：① BS Delta=期末−期初；② 剔除并购取得部分(并购附注)、汇率影响(对应附注汇兑行)、已单列的减值/ECL、非流动部分及与长期资产采购相关的应付款；③ 理论值 vs CFS 列示值，差异须能解释或为零
- 投资活动逐行：购置PPE=PPE附注"购买新增"(剔除并购取得，并调整应付未付购置款及PPE相关预付款变动)；并购净现金=各次并购现金支付−并购取得现金，与并购附注一致
- 筹资活动逐行：发行股份=SOCE对应列且与股本附注股数×发行价双重验证；借款新增/偿还=借款附注；租赁本金/利息=融资对账表与租赁附注；关联方借款=融资对账表＋关联方往来余额变动（剔除非融资性往来）
- 融资活动对账表通常仅覆盖负债性融资项目，不含权益性筹资（回购、少数股东注资）；CFS筹资净额与对账表差异若=权益性项目，属正常口径差异

【数据层·新增核验维度】
- 线条规范（IFRS/HKFRS）：单实线下方须为上方明细之准确小计；双实线上方须为最终合计且表格终止；虚实线下方为跨项目引用汇总；双向核验（从线条推数字 + 从加总关系查线条是否误用/缺失）。US GAAP 无强制线条，以加粗与缩进层级判断，逻辑相同
- 正负号含义一致性：Increase/(decrease)、(Increase)/decrease、gain/(loss) 等行项目，正负方向须全文统一；重点查现金流量表营运资本变动行、SOCE 变动行、附注变动分析表；行项目名称未说明正负含义→低风险，建议补充
- Note 序号连续性：序号连续无跳号无重复、子项(a)(b)(c)连续；扫描"幽灵索引"——主表引用 Note X 但全文不存在 Note X
- 简称定义一致性：每个简称首次出现须有定义(全称("简称"))，定义后全文一致使用，不得同一概念两套简称；重点 the Company/the Group、IFRS/HKFRS、ECL/CGU/ROU/NCI/OCI、货币简称

【数据层·高频专项陷阱】
- IFRS7 流动性到期表：横向各期限列加总=Total 列；纵向各负债类型=各列合计；关键——含未来利息的负债其"合同未折现额"必然 ≥ 账面值，若某行 Total ≤ carrying amount，极可能误将账面值填入合同额列
- 公允价值层级：使用重大不可观察输入(DCF、预期现金流、私有股权估值、近期交易价)应归 Level 3，列为 Level 2 须警示；核查"描述详尽但金额为 nil"的层级错位
- EPS 加权平均股数：当期有回购/注销时，据加权股数倒算隐含完成日期，与附注叙述核对；优先股利润分配额须能独立勾稽且前后两期口径一致，一期可勾稽另一期不能即为口径变化信号
- Mezzanine accretion（US GAAP）：P&L Accretion 行 = SOCE Accretion 行 = CFS 非现金披露 = 优先股活动表加总，四处一致
- 母公司/单体简表不豁免：Condensed P&L/BS/CFS 本身须执行逐环加总，最基础的"综合收益=净利润+其他综合收益"也不得跳过

【批注级检查清单 — 对齐人工复核标准（本清单为最高优先级，逐项扫描全部主表与全部附注；发现问题须按"示例措辞"输出，使其与资深复核人批注一致）】
本清单系依据真实人工复核批注归纳，覆盖该类报告最常见的问题形态。每一类都必须主动核查，不得遗漏。

1) 同一金额全文一致性（最高频，约占问题三分之一）：
   - 对每一个关键金额（如净利润、未分配利润、一般风险准备、各资产/负债期末、少数股东权益、营业收入、税金、应付职工薪酬各明细、现金及现金等价物等），定位其在【合并主表、母公司主表、以及全部附注】中的所有出现处，逐一两两比对。
   - 当同一金额在多处出现、其中部分一致、部分不一致时，须明确指出与"哪一处一致、与哪一处不一致"。
   - 覆盖四种比对方向：① 主表↔附注；② 附注↔附注；③ 合并↔母公司；④ 同一张表内左右栏对应项（如"一般风险准备"列对应的"提取一般风险准备" vs "未分配利润"列对应的"提取一般风险准备"）。
   - 示例措辞（原样风格输出）："与附注六、15不一致，请检查。" / "与同表'负债和股东权益总计'和附注七、1一致，与附注七、2不一致，请检查。" / "与合并资产负债表一致，与附注六、46不一致，请检查。" / "与合并股东权益变动表'一般风险准备'对应数据不一致，与'未分配利润'对应数据一致，请检查。"

2) 加总核验（四个方向都要算）：
   - 竖向（列内明细=列合计）→ "竖向计算有误，请检查。"
   - 横向（行内各期/各列=行合计；期初+变动=期末）→ "横向计算有误，请检查。"
   - 逆向（由合计倒算明细、由小计倒推）→ "逆向加总有误，请检查。" / "逆向计算有误，请检查。"
   - 依据其他表/小计推算：→ "根据小计项加总计算有误，请检查。" / "根据上表年初合计数计算有误，请检查。" / "根据合并股东权益变动表计算有误，请检查。"
   - 比例/百分比重算 → "比例计算有误，请检查。"
   - 四舍五入导致的勾稽差 → "计算四舍五入有误，请检查。"
   - 千分位分隔符与小数点混用/错位 → "请检查该数据中千分号和小数点的使用。"
   - 当某加总仅在"上方某格为负数"时才成立，须提示："若上方数据为负数，则计算正确。"

3) 数据缺失：表格存在空白单元格时，须按"视作 0"完成纵横向验算并标注；正文/索引缺数据须提示补充。
   - "数据缺失，已视作0验算相关纵横向合计数。" / "此处数据缺失，已视作0验算相关纵向合计数，请检查。" / "数据缺失，请添加。"

4) 科目命名的正负方向（约占问题三分之一，务必逐个有方向性的科目名核查）：
   - 凡名称隐含双向（既可能为正也可能为负）的科目/行项目，其括号方向须与【最新一年实际金额方向】一致——正值在前、(负值)在后；若最新一年为负，则应把负方向词放前面。
   - 常见词对（出现即核查方向是否与数字相符）：收益/(损失)、(损失)/收益、利润/(损失)、(亏损)/利润、净利润/(亏损)、产生/(使用)、(使用)/产生、增加/(减少)、(减少)/增加、减少/(增加)、转回/(计提)、(计提)/转回、收入/(支出)、净亏损、(未弥补亏损)/未分配利润。
   - 示例措辞："请考虑修改为'收益/(损失)'，请检查。" / "请考虑为'(亏损)/利润'，请检查。" / "请考虑修改为'(使用)/产生'，请检查。" / "请考虑修改为'增加/(减少)'，请检查。" / "请考虑修改为'净亏损'，请检查。"
   - 减项数据方向不统一时："请统一减项的数据方向。" / "请考虑统一减项的数据方向表达。"

5) 零值列示统一：所有 0 与 (0) 须以"-"列示并通篇统一。
   - "请考虑是否需要将报告中的'(0)''0'修改为'-'，请考虑通篇检查。" / "请考虑使用'-'披露零，保持通篇格式统一。请通篇检查。"

6) 全/半角括号：金额或英文语境中误用全角'（ ）'者→ "请考虑在英文输入法下输入'( )'符号。"

7) 正数披露：本应以正数列示却用负数（或反之）→ "（与对应表/附注一致，但）请考虑用正数披露，请检查。"

8) 线条与版式（视觉路径下逐表核验；纯文本路径标"以原件为准/需人工复核"）：
   - 小计行应为单实线 → "请考虑修改为单实线。" / 缺失 → "请考虑添加单实线。"
   - 最终合计应为双实线 → "请考虑修改为双实线。"
   - 多余线条 → "请考虑删除线条。" / "请考虑删除线条或修改为单实线。"
   - 全篇虚线/虚实线 → "报告中多处使用虚线和虚实线，请考虑将其统一修改为单实线。"
   - 表头下方缺下划线 → "请考虑在表头下方补充下划线，请检查。"

9) 序号与编号一致性：
   - 中文括号序号错位/缺失 → "请考虑为'(五)'，请检查。"
   - 阿拉伯序号错 → "请考虑修改为'2'，请检查。"
   - 序号形式不统一 → "请考虑使用序号'(1)、(2)......'，并保持报告使用序号形式通篇一致。"
   - 子项编号 → "请考虑修改为'(b)'。" / "请考虑是否修改为'25/(1)'。"

10) 附注引用用语与编号：全文统一用"注"或"附注"，交叉引用的附注号须真实存在且指向正确。
   - "请考虑修改为'注/附注'。" / "请考虑修改为'注/附注六'，请检查。" / "请考虑修改为'附注六/注'，请检查。" / "请检查附注号是否正确。" / "请考虑添加对应附注号，请检查。"

11) 删除冗余：多余符号 → "请考虑删除多余符号，请检查。"；冗余/不一致的逆向小计行 → "逆向加总有误，下方同层级标题未披露逆向小计，请考虑删除此行统一披露格式。"；多余空行 → "请考虑删除空行。"

12) 主表名称缺"公司"二字：母公司（单体）四张主表标题前应含主体限定（如"公司资产负债表/公司利润表"），缺失则报问题。
   - 示例："PDF 第 X–Y 页主表名称前均未披露'公司'，请检查。"

13) 时效/更新痕迹：日期、比较期标签、会计政策采纳时效、交叉索引等明显需更新处 → "请考虑更新。"

14) 拆分披露：应分项披露却合并列示（如"信用减值损失"与"其他资产减值损失"）→ "请考虑此处是否需要拆分'信用减值损失''其他资产减值损失'披露，请检查。"

15) 期末/年末措辞：年报中"期末"宜统一为"年末" → "请考虑是否需要修改为'年末'，请检查。"

16) 需管理层确认（无法仅凭报告精确重算者，归入待确认）：如适用不同税率导致汇率变动对净利润/权益影响无法精确带入计算 → "由于适用不同的税率，无法带入确切的税率进行汇率变动对净利润/权益影响的计算，请检查。"

【本清单的归类映射】① 第 1~4、7、16 项（金额一致性、各类加总、数据缺失影响验算、正数披露、需管理层确认）→ 输出到 "## 财务数据复核"；其中第 16 项归"待管理层确认事项"，其余归"明显问题"。② 第 5、6、8~15 项（零值列示、全半角括号、线条版式、序号编号、附注引用用语、删除冗余、主表缺"公司"、时效更新、拆分披露、年末措辞）→ 输出到 "## 语法核查"。每条问题须给出涉及页码/表名/附注号，并采用上述"示例措辞"风格，确保与人工批注一致。

【数据层·IPO 上市文件跨章节一致性（仅当文本含 MD&A/OFR/业务/风险因素/资本化表等章节时执行；否则注明本项不适用）】
- 财报数字 vs MD&A/OFR：收入(分产品/地区)、毛利率(按披露金额重算)、费用口径、调整后EBITDA/Non-GAAP(调整项须有来源、无重复、口径跨期一致)、流动性章节(现金/借款/受限资金/未用授信)
- 财务数据 vs 业务运营数据：门店数/客户数/GMV/付费用户/ARPU 等与收入趋势是否自洽；运营改善但收入或现金流恶化须列入待确认
- 股本/资本化表/EPS/SOCE 股数一致；债务契约 covenant/waiver/refinancing 在借款附注/后续事项/风险因素/MD&A 一致；关联交易金额余额与各章节一致
- 后续事项三层日期：报告期至审计报告日 / 审计报告日至申报日 / 申报日后已知重大事项，三层披露一致

【AI 执行边界】凡无法仅凭报告文本直接定性的差异（需底稿、合同、管理层解释才能判断原因者），不得臆测原因关闭，须归入"待管理层确认事项"。

【格式与排版层】通篇格式核查（逐条扫描，发现即报，归入"语法核查"）
- 跨页表格：表格被分页截断导致表头未在续页重复、行项目断裂、小计/合计被拆到次页、续表无"（续）"标识等。
- 零金额列示规范：所有 0 及 (0) 金额均应以"-"列示；凡出现以阿拉伯数字 0 或 (0) 披露的，报为问题并建议改为"-"。
- 附注编号：附注标号须连续、无跳号无重复；编号格式须全文统一（如统一"附注一/(一)/1"层级）；主表/附注交叉引用的附注号须真实存在且指向正确。
- 文字差错：拼写错误、标点符号使用错误（中英文标点混用、全半角混用）、明显语法错误。
- 页码：页码须连续、不重复、不跳号；目录/正文/附注交叉引用的页码须与实际页码一致。
- 括号方向（科目命名）：当某科目最新一年披露金额为负数时，"产生/(使用)"须按金额方向排序——"产生"在前、"(使用)"在后，如"投资活动产生/（使用）的现金流量净额"；当两个年度金额均为同一方向时无需赘述相反项，如两年均为负的"现金及现金等价物净增加值"不应写"（减少）"。
- 千分位：金额千分位分隔须规范统一（每三位一个分隔符、小数位一致），不得漏标、错位或与全文格式不一致。
- 空白与占位符：明显未更新内容——页码空白、编号空白、内容空白，或以 [date]、[审计报告编号]、XX、TBD、占位符等形式呈现的未填栏位。
- 币种：附注正文文字中出现的金额须写明币种（如人民币/RMB/港元/HK$），未写明币种的报为问题。
- 四舍五入：因四舍五入导致的加总/勾稽差错须指出（仅在已独立重算确认确为舍入所致时归为低风险并说明，不得无依据地以"可能为四舍五入"草草关闭其他差异）。

【语言层】语言合规性
- 中英文语系一致性（英式 vs 美式拼写、日期格式、标点）
- 主谓一致、标点、大小写、句式完整性
- 专业术语规范、无中式英语、无口语化用词
- 法定声明完整性

---

【输出格式 — 严格遵守】

## 报告总览

| 项目 | 内容 |
|------|------|
| 报告名称 | [识别出的报告全称] |
| 报告类型 | [年度报告 / 半年度报告 / ...] |
| 报告期间 | [如 2024 年度] |
| 适用准则 | [按报告实际采用填写单一准则，如 企业会计准则 或 IFRS 或 HKFRS，不要并列多个；若为系统推断需注明"（系统推断）"] |
| 审计机构 | [XX 会计师事务所/核数师，未披露填"未披露"] |
| 签字会计师/项目合伙人 | [按报告实际披露填写：A 股/境内准则通常列两名签字注册会计师；港股/IFRS/HKFRS 通常以事务所名义出具并披露单一项目合伙人(engagement partner)，按报告原文如实填写，不要套用境内"两名签字注册会计师"格式；未披露填"未披露"] |
| 报告状态 | [正式版 / 草稿（含 DRAFT 水印）/ 未明确] |

## 财务数据复核

### 检查范围概述
（一段话，约 80–150 字，说明本次已对解析到的报告内容进行了哪些维度的复核——主要财务报表、附注数据、关键财务指标计算、前后文披露口径一致性等。措辞限定为"已解析到的内容"，不得声称"整份报告全量复核"。明确除下列需关注事项外，已复核项目暂未发现明显异常。）

### 检查成果摘要
发现问题：[N] 项（高风险 [X] 项，中风险 [Y] 项，低风险 [Z] 项）
（若本次复核未发现任何问题，则输出：未发现差异，全部通过）

### 需关注事项

（问题分两类，先列「明显问题（直接处理）」、再列「待管理层确认事项」；各类内部按风险等级从高到低排列。如未发现任何问题，则在本节输出：
"✅ 本次复核未发现明显的数据勾稽异常或披露不一致问题。已逐项核验：利润表各层级加总关系、资产负债表平衡等式、现金流量表三类活动汇总与期末余额、跨表勾稽一致性、附注与主表口径等。"

否则每个问题严格使用如下卡片格式（字段顺序固定，逐项填写，不得省略任一字段）：）

#### 问题 1：[问题简短标题]
- 问题类别：明显问题（直接处理） / 待管理层确认事项
- 审计层次：第 X 层 [对应复核层次名称，如「加总精度」「跨表勾稽」「现金流量表勾稽」「深层逻辑矛盾」「上市文件跨章节」等]
- 风险等级：🔴 高风险 / 🟡 中风险 / ⚪ 低风险
- 涉及位置：[页码 / 报表名称 / 附注编号]
- 问题描述：[客观描述，附原始数字]
- 证据链：来源位置=[页/表/注]；独立计算公式=[列出参与计算的科目与算式]；AI 重算数=[金额]；报告列示数=[金额]；差异金额=[金额]；差异方向=[偏高/偏低]；四舍五入判断=[是否可由四舍五入解释，并说明理由——禁止无依据地以"可能为四舍五入"草草带过]
- 可能影响：[审慎说明可能造成的披露/复核/合规影响]
- 修改建议：[具体可操作的建议]

#### 问题 2：...
（以此类推）

类别判定标准：
- 明显问题（直接处理）：可由报告内文本与数字独立重算/勾稽即可确认的差错（如加总不符、跨表数据不一致、序号/页码错误、格式线条违规等）。
- 待管理层确认事项：无法仅凭报告文本定性、需结合底稿或管理层口径方能判定的差异（如口径差异、估计判断、需外部信息佐证者）。严禁臆测，统一归入本类并说明需确认的具体事项。

## 语法核查

### 检查范围概述
（一段话，约 70–120 字，说明已对解析到的中英文正文及附注进行了哪些格式与语言合规性检查——跨页表格、零金额是否以"-"列示、附注编号连续性与格式统一、页码连续性、"产生/(使用)"等括号方向、千分位、空白与占位符、金额币种、四舍五入，以及中英文语系一致性、日期格式与标点、专业术语规范性、主谓一致性、法定声明完整性等。明确除下列需关注事项外，其他格式与语言检查项目暂未发现明显问题。）

### 需关注事项

（若未发现任何格式、语法或语言合规性问题，则输出：
"✅ 格式与语言合规性检查未发现明显问题。已核验：跨页表格、零金额'-'列示、附注编号连续性、页码连续性、括号方向、千分位、空白/占位符、金额币种、四舍五入，以及英式/美式拼写一致性、日期格式、专业术语规范性、主谓一致性、标点使用、法定声明完整性等。"

否则每个问题严格使用如下卡片格式：）

#### 语法问题 1：[问题简短标题]
- 风险等级：⚪ 低风险 / 🟡 中风险 / 🔴 高风险
- 涉及位置：[页码 / 章节名称]
- 问题描述：[客观描述问题所在及具体例子]
- 可能影响：[对报告专业度或合规性的影响]
- 修改建议：[具体可操作的建议]

#### 语法问题 2：...
（以此类推）`

/* ─────────────────────────────────────────────────────────────────────────────
 * 模块二 — 财务健康度分析 prompt
 * 输出：## 财务健康度分析
 * 按 7 个维度分小节呈现
 * ────────────────────────────────────────────────────────────────────────────*/

const FINANCIAL_ANALYSIS_PROMPT = `${SYSTEM_ROLE}

请基于报告已披露信息进行财务健康度分析与风险识别。

【强制要求】
- 按下列 7 个维度逐一输出，不可缺项。
- 每个维度首行必须输出"评估："，结论从以下四档中选择：
  · ✅ 未发现明显异常
  · 🟡 建议进一步关注
  · 🔴 存在显著风险信号
  · ⚪ 数据不足（无法判断）
- 评估之后给出 1–3 条关键指标（含公式与数字），再给一段 60–150 字的审慎结论文字。
- 严禁使用"良好""稳健""不存在风险"等绝对化判断；可用"未见明显异常""存在一定波动""需结合管理层解释"等审慎措辞。
- 数据不足时明确写出"N/A（数据不足）"，不得编造。

---

【输出格式 — 严格遵守】

## 财务健康度分析

### 整体评估
- 综合评级：🔴 高风险 / 🟡 中等风险 / ✅ 低风险 / ⚪ 数据不足
- 风险分布：🔴 [X] 项 / 🟡 [X] 项 / ✅ [X] 项 / ⚪ [X] 项
- 主要关注事项（按严重程度排序，至多 3 条）：
  1. ...
  2. ...
  3. ...
- 主要正面指标（至多 3 条）：
  1. ...
  2. ...
  3. ...
- 总体评语：[一段话，60–150 字，审慎措辞]

### 盈利能力
- 评估：[四档之一]
- 关键指标：毛利率、净利率、ROE（含杜邦分解：净利率 × 资产周转率 × 权益乘数）、ROA
- 简短结论：[60–150 字审慎结论]

### 偿债能力
- 评估：[四档之一]
- 关键指标：资产负债率、流动比率、速动比率、利息保障倍数、净债务/EBITDA
- 简短结论：[60–150 字]

### 现金流质量
- 评估：[四档之一]
- 关键指标：现金收益比（经营现金流/净利润）、自由现金流、资本支出/折旧
- 简短结论：[60–150 字。注意背离信号]

### 营运能力
- 评估：[四档之一]
- 关键指标：应收账款周转天数 DSO、存货周转天数、应付账款周转天数、现金转换周期
- 简短结论：[60–150 字]

### 成长性
- 评估：[四档之一]
- 关键指标：营业收入同比、归母净利润同比、扣非净利润同比、经营性现金流同比
- 简短结论：[60–150 字]

### 重大异常波动
- 评估：[四档之一]
- 关键指标：商誉/净资产比、在建工程多年未转固情况、其他应收款异常、政府补助/净利润比、应计项目比率、净利润与经营现金流背离程度
- 简短结论：[60–150 字]

### 持续经营与经营质量风险
- 评估：[四档之一]
- 关键指标：短期借款/总债务、一年内到期有息负债 vs 货币资金、关联交易占比、审计意见类型（如有披露）
- 简短结论：[60–150 字]`

/* ─────────────────────────────────────────────────────────────────────────────
 * Route handler
 * ────────────────────────────────────────────────────────────────────────────*/

/* 单次调用的字符预算：按模型上下文保守取值。
 * deepseek-chat 上下文较大，可放宽；doubao-32k 较小，取较保守值。 */
const CHAR_BUDGET = process.env.DEEPSEEK_API_KEY ? 90000 : 28000

/** 将长文本按段落边界切分为不超过 budget 的块 */
function chunkText(text: string, budget: number): string[] {
  if (text.length <= budget) return [text]
  const chunks: string[] = []
  const paras = text.split(/\n{2,}/)
  let buf = ''
  for (const p of paras) {
    if (buf.length + p.length + 2 > budget && buf) {
      chunks.push(buf)
      buf = ''
    }
    // 单段本身超长时硬切
    if (p.length > budget) {
      if (buf) {
        chunks.push(buf)
        buf = ''
      }
      for (let i = 0; i < p.length; i += budget) chunks.push(p.slice(i, i + budget))
      continue
    }
    buf += (buf ? '\n\n' : '') + p
  }
  if (buf) chunks.push(buf)
  return chunks
}

/** 非流式获取一次完整 completion 文本 */
async function complete(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  })
  return res.choices[0]?.message?.content || ''
}

/** 从一段复核 markdown 中提取 ## 财务数据复核 下的 #### 问题卡片块 */
function extractIssueCards(md: string, section: string): string[] {
  const re = new RegExp(`##\\s+${section}([\\s\\S]*?)(?=\\n##\\s|$)`)
  const m = md.match(re)
  if (!m) return []
  const body = m[1]
  return body.split(/(?=^####\s)/m).filter((b) => /^####\s/.test(b.trim()))
}

/** 重新编号问题卡片标题（#### 问题 N：xxx / #### 语法问题 N：xxx） */
function renumberCards(cards: string[], prefix: string): string {
  return cards
    .map((c, i) =>
      c.replace(/^####\s+.*?(?=[:：])/m, `#### ${prefix} ${i + 1}`).trim()
    )
    .join('\n\n')
}

/** 多块复核结果合并为单一 markdown（总览/语法概述取首块，问题卡片全量合并） */
function mergeReview(parts: string[]): string {
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  // 收集所有块的问题卡片
  const dataCards: string[] = []
  const grammarCards: string[] = []
  parts.forEach((p) => {
    dataCards.push(...extractIssueCards(p, '财务数据复核'))
    grammarCards.push(...extractIssueCards(p, '语法核查'))
  })

  // 以首块为骨架，替换两个"需关注事项"区的卡片内容
  const overviewMatch = first.match(/(##\s+报告总览[\s\S]*?)(?=\n##\s)/)
  const overview = overviewMatch ? overviewMatch[1].trim() : ''

  const dataScopeMatch = first.match(/##\s+财务数据复核([\s\S]*?)###\s+需关注事项/)
  const dataHead = dataScopeMatch ? `## 财务数据复核${dataScopeMatch[1]}### 需关注事项` : '## 财务数据复核\n\n### 需关注事项'

  const grammarScopeMatch = first.match(/##\s+语法核查([\s\S]*?)###\s+需关注事项/)
  const grammarHead = grammarScopeMatch ? `## 语法核查${grammarScopeMatch[1]}### 需关注事项` : '## 语法核查\n\n### 需关注事项'

  const dataBody = dataCards.length
    ? '\n\n' + renumberCards(dataCards, '问题')
    : '\n\n✅ 本次复核未发现明显的数据勾稽异常或披露不一致问题。'
  const grammarBody = grammarCards.length
    ? '\n\n' + renumberCards(grammarCards, '语法问题')
    : '\n\n✅ 语言合规性检查未发现明显问题。'

  return [overview, dataHead + dataBody, grammarHead + grammarBody].filter(Boolean).join('\n\n')
}

/** 按模式选择 system prompt */
function systemFor(mode: string): string {
  if (mode === 'review') return DATA_REVIEW_PROMPT
  if (mode === 'analysis') return FINANCIAL_ANALYSIS_PROMPT
  return `${DATA_REVIEW_PROMPT}\n\n---\n\n${FINANCIAL_ANALYSIS_PROMPT}`
}

/** 视觉路径（PDF 作为文档传入）下的用户指令 */
function visionInstruction(mode: string, standardNote: string): string {
  if (mode === 'review')
    return `${standardNote}请对随附 PDF 财务报告执行【报告总览 + 财务数据复核 + 语法核查】。务必逐页审阅全部主表（合并及母公司单体）与全部附注，并直接基于版面核验表格的横向/纵向加总、跨页表格、千分位、零金额是否以"-"列示等。`
  if (mode === 'analysis')
    return `${standardNote}请对随附 PDF 财务报告执行【财务健康度分析】。`
  return `${standardNote}请对随附 PDF 财务报告同时输出以下四大模块（顺序严格）：
1. ## 报告总览
2. ## 财务数据复核
3. ## 语法核查
4. ## 财务健康度分析

务必逐页审阅全部主表（合并及母公司单体）与全部附注，并直接基于版面核验表格的横向/纵向加总、跨页表格、千分位、零金额是否以"-"列示等格式细节。`
}

/** 心跳保活：立即刷新响应头，并在首字节到达前每 10s 发送一个零宽空格（U+200B），
 * 防止"模型解析/思考期间长时间无输出"被 Vercel 边缘 / 代理 / VPN / 浏览器判定为空闲连接而断开
 * （断开在前端表现为 "Failed to fetch"）。前端会过滤 ​，不影响最终内容。
 * 返回停止函数，须在 close 前调用。 */
function startHeartbeat(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): () => void {
  const beat = () => {
    try {
      controller.enqueue(encoder.encode('​'))
    } catch {
      /* 控制器已关闭，忽略 */
    }
  }
  beat() // 立即发一个字节，促使响应头尽快下发，让前端 fetch 立刻 resolve
  const timer = setInterval(beat, 10000)
  return () => clearInterval(timer)
}

/** Claude 视觉路径：把 PDF 作为 document 块直接交给模型逐页审阅，流式返回 */
function visionStream(base64: string, mode: string, standardNote: string): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const stopHb = startHeartbeat(controller, encoder)
      try {
        const stream = await anthropic!.messages.create({
          model: VISION_MODEL,
          max_tokens: mode === 'analysis' ? 8192 : 16000,
          system: systemFor(mode),
          stream: true,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                { type: 'text', text: visionInstruction(mode, standardNote) },
              ],
            },
          ],
        })
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        stopHb()
        controller.close()
      } catch (e) {
        stopHb()
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(encoder.encode(`分析失败（视觉路径）：${msg}`))
        controller.close()
      }
    },
  })
}

/** GLM-4.5V 单次调用：一批页图 + 指令，非流式取最终内容 */
async function glmComplete(systemPrompt: string, images: string[], instruction: string): Promise<string> {
  const params = {
    model: GLM_MODEL,
    max_tokens: 8192,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          { type: 'text' as const, text: instruction },
        ],
      },
    ],
    // 关闭 GLM 思考模式：本场景只需最终结构化结论，省时延与 token
    thinking: { type: 'disabled' },
  }
  const res = await glm!.chat.completions.create(
    params as unknown as Parameters<OpenAI['chat']['completions']['create']>[0]
  )
  const r = res as unknown as { choices?: { message?: { content?: string } }[] }
  return r.choices?.[0]?.message?.content || ''
}

/** GLM 视觉路径：服务端渲染 PDF→页图，按上下文限制分批审阅并合并，流式下发最终结果 */
function glmVisionStream(buf: Buffer, mode: string, standardNote: string): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const stopHb = startHeartbeat(controller, encoder)
      try {
        const { images, total, rendered } = await renderPdfToImages(buf, { maxPages: GLM_MAX_PAGES })
        if (!images.length) {
          stopHb()
          controller.enqueue(encoder.encode('分析失败（GLM 视觉路径）：未能从该 PDF 渲染出页面图像。'))
          controller.close()
          return
        }
        // 分批（受 GLM 64K 上下文限制）
        const batches: string[][] = []
        for (let i = 0; i < images.length; i += GLM_PAGES_PER_CALL) {
          batches.push(images.slice(i, i + GLM_PAGES_PER_CALL))
        }
        const want = (m: string) => mode === 'both' || mode === m

        const reviewPromise: Promise<string> = want('review')
          ? Promise.all(
              batches.map((b, i) => {
                const note =
                  batches.length > 1
                    ? `（注意：这是同一份报告的第 ${i + 1}/${batches.length} 部分页面图像。请仅就本部分页面执行复核，并照常输出"## 报告总览 / ## 财务数据复核 / ## 语法核查"结构；总览字段如本部分无法判断填"未披露"。）\n\n`
                    : ''
                return glmComplete(DATA_REVIEW_PROMPT, b, `${standardNote}${note}${visionInstruction('review', '')}`)
              })
            ).then((parts) => mergeReview(parts))
          : Promise.resolve('')

        // 健康度：在首批（通常含主要报表）上运行一次
        const healthPromise: Promise<string> = want('analysis')
          ? glmComplete(FINANCIAL_ANALYSIS_PROMPT, batches[0], `${standardNote}${visionInstruction('analysis', '')}`)
          : Promise.resolve('')

        const [reviewMd, healthMd] = await Promise.all([reviewPromise, healthPromise])
        let head = ''
        if (rendered < total) {
          head = `> ⚠️ 本份报告共 ${total} 页，受模型上下文限制本次仅复核了前 ${rendered} 页。如需全量复核，请拆分报告或调大 GLM_MAX_PAGES。\n\n`
        }
        stopHb()
        controller.enqueue(encoder.encode(head + [reviewMd, healthMd].filter(Boolean).join('\n\n')))
        controller.close()
      } catch (e) {
        stopHb()
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(encoder.encode(`分析失败（GLM 视觉路径）：${msg}`))
        controller.close()
      }
    },
  })
}

/** 上传 PDF 到 Moonshot 并取回解析后的文本内容（含扫描件 OCR / 表格还原） */
async function moonshotExtract(buf: Buffer, filename: string): Promise<string> {
  const key = cleanKey(process.env.MOONSHOT_API_KEY)
  const form = new FormData()
  form.append('purpose', 'file-extract')
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'application/pdf' }), filename || 'report.pdf')
  const up = await fetch(`${MOONSHOT_BASE_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!up.ok) throw new Error(`文件上传失败（${up.status}）：${(await up.text()).slice(0, 200)}`)
  const upJson = (await up.json()) as { id?: string }
  const fileId = upJson.id
  if (!fileId) throw new Error('文件上传未返回 file id')
  const cont = await fetch(`${MOONSHOT_BASE_URL}/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!cont.ok) throw new Error(`文件解析失败（${cont.status}）：${(await cont.text()).slice(0, 200)}`)
  const raw = await cont.text()
  try {
    const j = JSON.parse(raw) as { content?: string; text?: string }
    return j.content || j.text || raw
  } catch {
    return raw
  }
}

/** Kimi 路径：解析 PDF→长上下文流式复核 */
function moonshotStream(buf: Buffer, filename: string, mode: string, standardNote: string): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const stopHb = startHeartbeat(controller, encoder)
      try {
        const content = await moonshotExtract(buf, filename)
        if (!content.trim()) {
          stopHb()
          controller.enqueue(encoder.encode('分析失败（Kimi）：未能从该 PDF 解析出文本内容。'))
          controller.close()
          return
        }
        const userMessage =
          mode === 'review'
            ? `${standardNote}请对以下财务报告执行【报告总览 + 财务数据复核 + 语法核查】，逐表逐附注核验：\n\n${content}`
            : mode === 'analysis'
            ? `${standardNote}请对以下财务报告执行【财务健康度分析】：\n\n${content}`
            : `${standardNote}请对以下财务报告同时输出以下四大模块（顺序严格）：
1. ## 报告总览
2. ## 财务数据复核
3. ## 语法核查
4. ## 财务健康度分析

财务报告内容：

${content}`
        const stream = await moonshot!.chat.completions.create({
          model: MOONSHOT_MODEL,
          max_tokens: 8192,
          stream: true,
          messages: [
            { role: 'system', content: systemFor(mode) },
            { role: 'user', content: userMessage },
          ],
        })
        let firstByte = true
        for await (const chunk of stream) {
          const t = chunk.choices[0]?.delta?.content
          if (t) {
            if (firstByte) { stopHb(); firstByte = false }
            controller.enqueue(encoder.encode(t))
          }
        }
        stopHb()
        controller.close()
      } catch (e) {
        stopHb()
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(encoder.encode(`分析失败（Kimi 路径）：${msg}`))
        controller.close()
      }
    },
  })
}

export async function POST(request: NextRequest) {
  const blocked = guard(request, { limit: 15, windowMs: 60_000, name: 'analyze' })
  if (blocked) return blocked
  try {
    const ct = request.headers.get('content-type') || ''
    let text = ''
    let mode = 'both'
    let standard = ''
    let pdfBase64 = ''
    let pdfBuffer: Buffer | null = null
    let pdfBytes = 0
    let pageCount = 0
    let fileName = 'report.pdf'

    if (ct.includes('multipart/form-data')) {
      const form = await request.formData()
      text = (form.get('text') as string) || ''
      mode = (form.get('mode') as string) || 'both'
      standard = (form.get('standard') as string) || ''
      pageCount = Number(form.get('pageCount') || 0)
      const file = form.get('file')
      if (file && typeof file !== 'string') {
        const buf = Buffer.from(await (file as File).arrayBuffer())
        pdfBuffer = buf
        pdfBytes = buf.length
        pdfBase64 = buf.toString('base64')
        if ((file as File).name) fileName = (file as File).name
      }
    } else {
      const body = await request.json()
      text = body.text || ''
      mode = body.mode || 'both'
      standard = body.standard || ''
    }

    const standardNote = standard
      ? `用户指定的会计准则（如系统识别不同，请以本字段为准并在报告总览中注明）：${standard}\n\n`
      : '系统将自动识别报告适用准则。\n\n'

    /* ── 视觉引擎选择 ──
     * 显式 VISION_PROVIDER 优先；留空时自动：有 GLM(国内) key 先用 GLM，其次 Claude。
     * GLM：服务端渲染 PDF→页图分批审阅；Claude：原生读 PDF（≤100 页 / ≤30MB）。
     */
    const claudeFits =
      !!anthropic && !!pdfBase64 && pdfBytes <= VISION_MAX_BYTES && (pageCount === 0 || pageCount <= VISION_MAX_PAGES)
    let engine: 'kimi' | 'glm' | 'claude' | 'text' = 'text'
    if (VISION_PROVIDER === 'kimi' && moonshot && pdfBuffer) engine = 'kimi'
    else if (VISION_PROVIDER === 'glm' && glm && pdfBuffer) engine = 'glm'
    else if (VISION_PROVIDER === 'claude' && claudeFits) engine = 'claude'
    else if (!VISION_PROVIDER) {
      if (moonshot && pdfBuffer) engine = 'kimi'
      else if (glm && pdfBuffer) engine = 'glm'
      else if (claudeFits) engine = 'claude'
    }

    if (engine === 'kimi') {
      return new Response(moonshotStream(pdfBuffer!, fileName, mode, standardNote), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    if (engine === 'glm') {
      return new Response(glmVisionStream(pdfBuffer!, mode, standardNote), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    if (engine === 'claude') {
      return new Response(visionStream(pdfBase64, mode, standardNote), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    /* ── 回退：纯文本路径（无视觉 key、PDF 过大/过长，或仅传入文本） ── */
    if (!text) return new Response('缺少报告文本', { status: 400 })

    const chunks = chunkText(text, CHAR_BUDGET)
    const encoder = new TextEncoder()

    /* ── 单块：保留原流式体验 ── */
    if (chunks.length === 1) {
      let systemPrompt = ''
      let userMessage = ''
      if (mode === 'review') {
        systemPrompt = DATA_REVIEW_PROMPT
        userMessage = `${standardNote}请对以下财务报告文本执行【报告总览 + 财务数据复核 + 语法核查】：\n\n${text}`
      } else if (mode === 'analysis') {
        systemPrompt = FINANCIAL_ANALYSIS_PROMPT
        userMessage = `${standardNote}请对以下财务报告文本执行【财务健康度分析】：\n\n${text}`
      } else {
        systemPrompt = `${DATA_REVIEW_PROMPT}\n\n---\n\n${FINANCIAL_ANALYSIS_PROMPT}`
        userMessage = `${standardNote}请对以下财务报告文本同时输出以下四大模块（顺序严格）：
1. ## 报告总览
2. ## 财务数据复核
3. ## 语法核查
4. ## 财务健康度分析

财务报告文本：

${text}`
      }

      const stream = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 8192,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      })
      const readable = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const t = chunk.choices[0]?.delta?.content
            if (t) controller.enqueue(encoder.encode(t))
          }
          controller.close()
        },
      })
      return new Response(readable, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    /* ── 多块：分块分析 + 服务端合并，完成后整体下发 ── */
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const want = (m: string) => mode === 'both' || mode === m

          // 复核（含总览/语法）：各分块并行运行，缩短墙钟时间，规避长报告超时
          const reviewPromise: Promise<string> = want('review')
            ? Promise.all(
                chunks.map((chunk, i) => {
                  const note =
                    chunks.length > 1
                      ? `（注意：这是同一份报告的第 ${i + 1}/${chunks.length} 部分。请仅就本部分内容执行复核，并照常输出"## 报告总览 / ## 财务数据复核 / ## 语法核查"结构；总览字段如本部分无法判断填"未披露"。）\n\n`
                      : ''
                  return complete(
                    DATA_REVIEW_PROMPT,
                    `${standardNote}${note}请对以下财务报告文本（部分）执行【报告总览 + 财务数据复核 + 语法核查】：\n\n${chunk}`
                  )
                })
              ).then((parts) => mergeReview(parts))
            : Promise.resolve('')

          // 健康度：在首块（通常含主要报表）上运行一次；与复核并行
          const healthPromise: Promise<string> = want('analysis')
            ? complete(
                FINANCIAL_ANALYSIS_PROMPT,
                `${standardNote}（注意：报告较长，以下为其主要财务报表所在的前置部分，请基于可见数据进行健康度分析，数据不足处标注 N/A。）\n\n请对以下财务报告文本执行【财务健康度分析】：\n\n${chunks[0]}`
              )
            : Promise.resolve('')

          const [reviewMd, healthMd] = await Promise.all([reviewPromise, healthPromise])

          const finalMd = [reviewMd, healthMd].filter(Boolean).join('\n\n')
          controller.enqueue(encoder.encode(finalMd))
          controller.close()
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          controller.enqueue(encoder.encode(`分析失败：${msg}`))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Analysis error:', msg)
    return new Response(`分析失败：${msg}`, { status: 500 })
  }
}
