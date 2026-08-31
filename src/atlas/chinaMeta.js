// 中国视图元数据：评分模型、流行病学要点、求助资源与数据接入状态。
// 全部为手写维护内容，引用需可溯源。

// 综合评分模型（依据《心理治疗资源地图与综合评分系统》项目计划）
// 综合评分 = α × 大众口碑 + β × 医疗资源设备 + γ × 专业度
export const SCORING_MODEL = {
  formula: '综合评分 = α × 大众口碑 + β × 医疗资源设备 + γ × 专业度',
  weights: { reputation: 0.4, resource: 0.3, expertise: 0.3 },
  weightLabels: { reputation: '大众口碑 α=40%', resource: '医疗资源设备 β=30%', expertise: '专业度 γ=30%' },
  dims: [
    {
      id: 'reputation',
      label: '大众口碑',
      fields: '经授权、脱敏、人工复核后的服务体验维度统计（研究中）',
      status: 'pending',
      note: '公开社交平台样本存在授权、隐私、实体误配与代表性风险，当前不生成机构口碑分或排名；本地研究结果不会进入生产包。'
    },
    {
      id: 'resource',
      label: '医疗资源设备',
      fields: '机构等级、床位/诊室规模、设备配置、人员数量',
      status: 'partial',
      note: '当前仅部分条目带床位/科室信息（OSM 标签），后续需接入卫健委执业登记公开信息补全。'
    },
    {
      id: 'expertise',
      label: '专业度',
      fields: '医师资质与职称结构、重点专科建设、擅长方向覆盖度',
      status: 'pending',
      note: '待接入卫健委公开登记与机构公开介绍文本的标签抽取结果。'
    }
  ],
  // v1 阶段：所有机构综合评分为 null（不做无依据的估算），页面明示“待数据接入”
  version: 'v1-model-ready'
};

// 中国精神卫生调查（CMHS）核心结果 —— Huang Y, et al. Lancet Psychiatry. 2019;6(3):211-224.
// 覆盖全国 31 个省（自治区、直辖市）157 个县/区，面对面访问 32,552 人
export const CHINA_FACTS = [
  {
    id: 'cmhs-prevalence',
    title: '每 6 个人中约 1 人，一生中会受精神障碍困扰',
    body: '中国精神卫生调查（CMHS，现场调查 2013—2015 年）显示：除老年期痴呆外，任何精神障碍的终生患病率为 16.6%，12 个月患病率 9.3%；焦虑障碍终生约 7.6%、心境障碍终生约 7.4%。这是目前全国代表性最好的流行病学基线，不能当作某一年的“患者人数”。WHO 中国页面另估计：约 5,400 万人受抑郁困扰、约 4,100 万人受焦虑障碍困扰（疾病负担背景值，非年度序列）。',
    source: 'Huang Y, et al. Lancet Psychiatry, 2019；WHO 中国：精神健康',
    tone: 'mood'
  },
  {
    id: 'cmhs-gap',
    title: '患病很常见，求助却很少',
    body: 'CMHS 同时发现：多数符合诊断标准的精神障碍患者从未接受过任何专业治疗。求助延迟与病耻感、不知道去哪里求助、担心被歧视密切相关——这正是本页资源地图想解决的问题之一。',
    source: 'Huang Y, et al. Lancet Psychiatry, 2019',
    tone: 'sky'
  },
  {
    id: 'resource-gap',
    title: '精神卫生资源长期分布不均',
    body: '截至 2015 年底，全国仍有 41.4% 的区县没有任何精神卫生资源：西藏当时为 0 家机构，而北京有 114 家。到 2021 年，全国精神卫生医疗服务机构达 5,936 家，登记在册严重精神障碍患者约 660 万人、规范管理率 92%；2020 年研究显示各省每万人精神科床位从四川约 9.1 张到西藏约 0.36 张，相差 25 倍。据国家精神卫生项目办 2025 年介绍，省级 100%、除三沙外所有地市、88% 的县已设有本级精神卫生医疗机构，空白区县较 2015 年减少约 85%——但县域与中西部短板依然存在。',
    source: '马宁等. 2020年中国精神卫生资源状况分析（中华精神科杂志 2022）；国家卫健委 2021 年精神卫生工作发布；科学网专访马宁, 2025-10',
    tone: 'sand'
  },
  {
    id: 'hotline-12356',
    title: '全国心理援助热线：12356',
    body: '自 2025 年起，全国统一心理援助热线短号码 12356 已开通。如果你或身边的人正处于情绪困境，拨打 12356 是最直接的求助入口；紧急情况请拨打 120 或 110。',
    source: '国家卫生健康委员会',
    tone: 'mint'
  }
];

// 社交平台数据的研究状态（本地清洗与人工审阅，不生成生产口碑分）
export const SOCIAL_CRAWL_STATUS = {
  platforms: ['小红书', '抖音', '知乎'],
  tool: '本地研究流程（原始数据与清洗文本均不进入代码库或生产包）',
  method: '严格解析、去重、直接标识符遮盖、风险标记、机构实体核验与人工审阅；只研究服务可及性、费用、流程、沟通、环境和连续照护等维度。',
  status: 'research-audit',
  note: '社交数据仅用于本地研究。未完成来源授权、隐私影响、实体准确率、最小样本和偏差评估前，不展示机构口碑分、排名、原帖链接或用户文本。'
};

// 全国口径趋势（2021—2024）：数据与证据分级来自《2021—2025 中国精神卫生资源底稿》
// （raw/atlas-public/china_mental_health_2021_2025_report.md，2026-08-30 版）。
// 证据级别：A=官方原表确认；B=同行评议/可靠资料明确引用年鉴，未逐格复核；P=待发布。
// 口径：精神病医院=医院类别中的专科口径；与广义“精神卫生医疗服务机构”（2021 年 5,936 家）不同，不得混线。
export const NATIONAL_TREND = {
  unit: '家',
  source: '《中国卫生健康统计年鉴》历年卷（2022—2025 版），经底稿核验分级；2025 年同口径存量待官方发布',
  rows: [
    { year: 2021, hospitals: 2098, physicians: 51448, nurses: 131400, level: 'A', note: '床位原表口径待逐格提取；广义精神卫生医疗服务机构 5,936 家；登记在册严重精神障碍患者 660 万、规范管理率 92%' },
    { year: 2022, hospitals: 2277, physicians: 56166, nurses: 146451, bedsMentalHospitals: 840871, level: 'B', note: '床位 84.1 万张为“精神病医院”口径（同行评议文献引用 2023 年鉴）' },
    { year: 2023, hospitals: 2583, physicians: null, nurses: null, level: 'B', note: '人员/床位原表待逐格提取' },
    { year: 2024, hospitals: 2800, physicians: 68000, nurses: 192000, bedsMentalHospitals: 991751, level: 'B', note: '医院精神科床位 99.2 万张（全医疗卫生机构口径 104.9 万张，年鉴表 3-1-5/3-1-6）；另有约 1,000 家公立精神专科医院、近 2,000 家公立综合医院设心理/精神科' },
    { year: 2025, hospitals: null, physicians: null, nurses: null, level: 'P', note: '同口径年度存量待官方发布（不做插值）；当年服务建设数据见下方 2025 服务面板' }
  ]
};

// 2025 年服务可及性/政策实施结果（国家卫健委 2025-12 公布，A级）
export const SERVICE_2025 = {
  source: '国家卫生健康委员会“卫生健康系统为民服务实事”结果（2025-12-26）',
  items: [
    { label: '心理/睡眠门诊', value: '333 个地级市 + 87 个区县完成设置' },
    { label: '12356 心理援助热线', value: '各地均已开通，接听超 70 万通' },
    { label: '成功危机干预', value: '近 1 万起' },
    { label: '心理健康巡讲', value: '超 1 万场，直接受众 175 万余人' },
    { label: '心理门诊服务量', value: '同比 2024 +17%' },
    { label: '睡眠门诊服务量', value: '同比 2024 +39%' }
  ]
};

export const CHINA_CATEGORY_ORDER = ['specialized', 'health-center', 'counseling', 'education', 'related'];
export const CHINA_CATEGORY_COLORS = {
  specialized: '#4f948b',
  'health-center': '#347f91',
  counseling: '#b98a4b',
  education: '#8b7cb6',
  related: '#7d8896'
};
