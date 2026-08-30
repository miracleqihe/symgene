// 疾病谱系定义：把 GBD 2023 的精神障碍条目按谱系簇组织，
// 色板从站点品牌色延展（tokens.css 的 sky/sand/mint/teal + 和谐化补色）。
// 同一谱系共用一个色相，深浅表示患病率高低。

export const SPECTRUMS = [
  {
    id: 'overview',
    label: '精神障碍总览',
    en: 'Mental disorders (all)',
    color: '#4f948b',
    blurb: 'GBD 精神障碍母类别的合计估计，可作为整体基线层。'
  },
  {
    id: 'mood',
    label: '心境谱系',
    en: 'Mood spectrum',
    color: '#b98a4b',
    blurb: '以心境为核心的内化谱系：抑郁症与双相情感障碍。情绪的低谷与高涨都会显著损害功能。'
  },
  {
    id: 'anxiety',
    label: '焦虑恐惧谱系',
    en: 'Anxiety-fear spectrum',
    color: '#5f9fb7',
    blurb: '以过度恐惧、担忧与回避为核心的内化谱系，是全球最常见的精神性障碍群。'
  },
  {
    id: 'psychotic',
    label: '精神病性谱系',
    en: 'Psychotic spectrum',
    color: '#8b7cb6',
    blurb: '以现实检验能力受损为核心特征的谱系，精神分裂症是其代表性疾病。'
  },
  {
    id: 'externalizing',
    label: '外化谱系（物质与行为）',
    en: 'Externalizing spectrum',
    color: '#c26d5a',
    blurb: '以外化行为为核心特征的谱系：物质使用障碍与品行障碍。在 HiTOP 分类学中它们同属外化簇。'
  },
  {
    id: 'neurodev',
    label: '神经发育谱系',
    en: 'Neurodevelopmental spectrum',
    color: '#5f9c85',
    blurb: '起病于发育期的谱系：注意缺陷多动障碍、自闭症谱系障碍与发育性智力障碍。'
  },
  {
    id: 'eating',
    label: '进食谱系',
    en: 'Eating spectrum',
    color: '#b56a8f',
    blurb: '以进食行为与体像困扰为核心的谱系，青少年期高发，需要早识别早干预。'
  },
  {
    id: 'other',
    label: '其他精神障碍',
    en: 'Other mental disorders',
    color: '#7d8896',
    blurb: 'GBD 归入“其他”的剩余精神障碍合计（含强迫、创伤应激、人格相关等非独立列出条目）。'
  }
];

export const SPECTRUM_BY_ID = new Map(SPECTRUMS.map((s) => [s.id, s]));

// 用于图例排序：总览层置顶，其余按谱系聚类展示
export const SPECTRUM_ORDER = SPECTRUMS.map((s) => s.id);
