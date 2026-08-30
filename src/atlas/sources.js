// 数据来源注册表与免责声明。公益科普必须如实标注来源、年份与局限。

export const SOURCES = [
  {
    id: 'gbd-2023',
    label: '患病率（各国 × 年份 × 疾病）',
    org: 'IHME 全球疾病负担研究（GBD 2023）',
    detail: 'Global Burden of Disease Study 2023 Results. Institute for Health Metrics and Evaluation (IHME), 2024.',
    url: 'https://vizhub.healthdata.org/gbd-results/',
    coverage: '204 个国家/地区 × 2016–2023 × 12 个精神障碍条目；点患病率（占人口百分比）；含全年龄与年龄标准化两个口径',
    license: '免费用于非商业用途，需注明出处；商业用途需向 IHME 申请授权'
  },
  {
    id: 'worldbank-gdp',
    label: '人均 GDP',
    org: '世界银行 World Development Indicators',
    detail: 'World Bank, World Development Indicators – GDP per capita (current US$)。',
    url: 'https://data.worldbank.org/indicator/NY.GDP.PCAP.CD',
    coverage: '2000–2024，现价美元',
    license: 'CC BY-4.0'
  },
  {
    id: 'who-atlas',
    label: '精神科医生密度 / 心理健康支出占比',
    org: '世界卫生组织 Mental Health Atlas（经 GHO 发布）',
    detail: 'WHO Global Health Observatory：MH_6 精神科医生（每 10 万人）；MH_4 政府心理健康支出占卫生总支出比例。',
    url: 'https://www.who.int/data/gho',
    coverage: '各国快照值（多为 2013–2020 年报告值），非连续时间序列',
    license: 'WHO 数据免费使用，需注明出处'
  },
  {
    id: 'who-suicide',
    label: '自杀死亡率',
    org: '世界卫生组织全球卫生估计（经 GHO 发布）',
    detail: 'WHO Global Health Observatory：MH_12 年龄标准化自杀死亡率（每 10 万人，两性合计）。',
    url: 'https://www.who.int/data/gho',
    coverage: '2000 年以来的国家 × 年份序列',
    license: 'WHO 数据免费使用，需注明出处'
  },
  {
    id: 'kff-nsduh',
    label: '美国族裔患病率与治疗可及性',
    org: 'KFF 对 SAMHSA 全国药物使用与健康调查（NSDUH 2024）与 CDC 数据的整理',
    detail: 'KFF, Key Data on Health and Health Care by Race and Ethnicity（2025 年 12 月更新）。',
    url: 'https://www.kff.org/racial-equity-and-health-policy/key-data-on-health-and-health-care-by-race-and-ethnicity/',
    coverage: '美国全国层面单年快照：成人任何精神障碍患病率、患者接受精神健康服务比例（2024）；自杀与药物过量死亡率（2023）；部分族裔无公布值',
    license: 'KFF 内容可引用，需注明出处'
  }
];

export const DISCLAIMERS = [
  '本页面的患病率为流行病学模型估计值（GBD），不是诊断工具，也不代表任何个体的健康状况。如果你正在经历困扰，请参考本站“疾病科普”与“网络资源”栏目，或寻求专业帮助。',
  '不同国家的患病率差异，同时反映真实差异与各国调查体系、诊断标准、报告意愿与模型假设的差异；国家之间的比较应谨慎解读。',
  '族裔/种族之间的差异主要反映社会决定因素（经济条件、医疗服务可及性、污名与歧视等）的历史与现实影响，不是任何族群的生物学属性。',
  '散点图展示的是相关关系，不是因果关系。人均 GDP、精神科医生密度等指标与患病率的相关性不能推断“谁导致谁”。',
  '治疗可及性在“族裔视图”中使用患者接受服务的比例（NSDUH）；在国家视图尚无统一的治疗覆盖率数据，相关维度使用精神科医生密度等供给侧代理指标，页面会明确标注。'
];

// 构建信息：数据版本标记，便于追溯
export const DATA_VERSION = '2026-08-29';
