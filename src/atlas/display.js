// 展示配置：大区配色、散点维度定义。与数据分离，便于调整视觉语言。

import { getPrevalence, getGdp, getSuicide, getPsychiatrists, getSpendPct } from './index.js';

// 大区配色：从站点品牌色延展，保持低饱和纸面气质
export const REGION_COLORS = {
  北美: '#397970',
  欧洲与中亚: '#347f91',
  拉美与加勒比: '#c26d5a',
  东亚与太平洋: '#5f9c85',
  南亚: '#b98a4b',
  中东与北非: '#8b7cb6',
  撒哈拉以南非洲: '#7d8896',
  其他: '#a9b2ba'
};

export const REGION_ORDER_FOR_LEGEND = Object.keys(REGION_COLORS);

// 散点图可选维度。yearDependent = 是否随时间滑块联动
export const SCATTER_DIMS = [
  {
    id: 'prevalence',
    label: '患病率',
    unit: '% 人口',
    yearDependent: true,
    getValue: (locIdx, yearIdx, diseaseIdx) => getPrevalence('all', locIdx, yearIdx, diseaseIdx)
  },
  {
    id: 'gdp',
    label: '人均 GDP',
    unit: '美元（对数轴）',
    yearDependent: true,
    log: true,
    getValue: (locIdx, yearIdx) => getGdp(locIdx, 2016 + yearIdx)
  },
  {
    id: 'psychiatrists',
    label: '精神科医生密度',
    unit: '每 10 万人（快照）',
    yearDependent: false,
    getValue: (locIdx) => getPsychiatrists(locIdx)?.val ?? null
  },
  {
    id: 'spend',
    label: '心理健康支出占比',
    unit: '% 卫生支出（快照）',
    yearDependent: false,
    getValue: (locIdx) => getSpendPct(locIdx)?.val ?? null
  },
  {
    id: 'suicide',
    label: '自杀死亡率',
    unit: '每 10 万人',
    yearDependent: true,
    getValue: (locIdx, yearIdx) => getSuicide(locIdx, 2016 + yearIdx)
  }
];

export const SCATTER_DIM_BY_ID = new Map(SCATTER_DIMS.map((d) => [d.id, d]));
