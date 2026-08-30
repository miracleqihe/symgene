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
      fields: '公开评价数量、好评率、满意度均值、近期评价活跃度',
      status: 'pending',
      note: '数据源：小红书/微博/抖音等平台公开讨论的聚合统计（经 MediaCrawler 采集后汇总），仅保留机构级聚合指标，不收录任何作者个人信息。'
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
    body: '中国精神卫生调查（CMHS）显示：除老年期痴呆外，任何精神障碍的终生患病率为 16.6%，12 个月患病率为 9.3%。这意味着按人口比例换算，全国有上亿人在一生中的某个阶段会经历可诊断的精神障碍。',
    source: 'Huang Y, et al. Lancet Psychiatry, 2019（中国精神卫生调查 CMHS）',
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
    body: '截至 2015 年底，全国仍有 41.4% 的区县没有任何精神卫生资源：西藏当时为 0 家机构，而北京有 114 家；中西部多个省份一半以上区县为空白。到 2020 年底，全国精神卫生医疗机构增至 5,936 家、开放床位 79.8 万张、精神科执业（助理）医师 50,124 人；据国家精神卫生项目办 2025 年介绍，省级 100%、除三沙外所有地市、88% 的县已设有本级精神卫生医疗机构，资源空白区县较 2015 年减少约 85%——但县域与中西部短板依然存在。',
    source: '马宁等. 2020年中国精神卫生资源状况分析. 中华精神科杂志, 2022（截至2020年底）；科学网专访马宁, 2025-10',
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

// 社交平台口碑数据的接入状态（MediaCrawler 采集 → 聚合 → 口碑分）
export const SOCIAL_CRAWL_STATUS = {
  platforms: ['小红书', '微博', '抖音'],
  tool: 'MediaCrawler（开源项目，本地运行，需使用者本人账号登录）',
  method: '按机构名称与“精神卫生中心/心理咨询”等关键词检索公开讨论，仅做机构级聚合统计（提及量、讨论关键词、情感倾向占比），不收录、不展示任何作者个人信息或个案内容。',
  status: 'xhs-v1-live',
  note: '采集配置已就绪；数据到位后由聚合脚本生成口碑分，页面自动启用。此前所有机构的口碑分与综合评分显示为“待数据接入”，不做估算。'
};

export const CHINA_CATEGORY_ORDER = ['specialized', 'health-center', 'counseling', 'education', 'related'];
export const CHINA_CATEGORY_COLORS = {
  specialized: '#4f948b',
  'health-center': '#347f91',
  counseling: '#b98a4b',
  education: '#8b7cb6',
  related: '#7d8896'
};
