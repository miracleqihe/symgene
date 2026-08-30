// 数据索引与查询助手。所有模块为纯数据，这里提供 O(1) 查询与统计工具。
import { LOCS } from './geo.js';
import { DISEASES, YEARS, PREVALENCE } from './prevalence.js';
import { GDP, SUICIDE, PSYCHIATRISTS, MENTAL_SPEND_PCT } from './context.js';
import { ETHNICITY_GROUPS, ETHNICITY_INDICATORS } from './ethnicity.js';
import { SPECTRUMS, SPECTRUM_BY_ID, SPECTRUM_ORDER } from './spectrum.js';
import { SOURCES, DISCLAIMERS, DATA_VERSION } from './sources.js';

export {
  LOCS, DISEASES, YEARS, PREVALENCE, GDP, SUICIDE, PSYCHIATRISTS, MENTAL_SPEND_PCT,
  ETHNICITY_GROUPS, ETHNICITY_INDICATORS, SPECTRUMS, SPECTRUM_BY_ID, SPECTRUM_ORDER,
  SOURCES, DISCLAIMERS, DATA_VERSION
};

const GDP_YEAR0 = 2000;

function pack(rows, yearBase, yearSpan) {
  const map = new Map();
  for (const [li, year, val] of rows) {
    if (year < yearBase || year >= yearBase + yearSpan) continue;
    map.set(li * yearSpan + (year - yearBase), val);
  }
  return map;
}

const PREV_MAP = {
  all: buildPrevMap(PREVALENCE.all),
  std: buildPrevMap(PREVALENCE.std)
};
const GDP_MAP = pack(GDP, GDP_YEAR0, 40);
const SUICIDE_MAP = pack(SUICIDE, GDP_YEAR0, 40);

function buildPrevMap(rows) {
  const map = new Map();
  for (const [li, yi, di, val] of rows) {
    map.set((li * YEARS.length + yi) * DISEASES.length + di, val);
  }
  return map;
}

/** 患病率（% 人口）。age: 'all' | 'std'，缺数据返回 null */
export function getPrevalence(age, locIdx, yearIdx, diseaseIdx) {
  const hit = PREV_MAP[age]?.get((locIdx * YEARS.length + yearIdx) * DISEASES.length + diseaseIdx);
  return hit === undefined ? null : hit;
}

/** 人均 GDP（现价美元），缺数据返回 null */
export function getGdp(locIdx, year) {
  const hit = GDP_MAP.get(locIdx * 40 + (year - GDP_YEAR0));
  return hit === undefined ? null : hit;
}

/** 自杀死亡率（每 10 万人），缺数据返回 null */
export function getSuicide(locIdx, year) {
  const hit = SUICIDE_MAP.get(locIdx * 40 + (year - GDP_YEAR0));
  return hit === undefined ? null : hit;
}

/** 精神科医生密度快照（每 10 万人）：{ year, val } | null */
export function getPsychiatrists(locIdx) {
  const iso3 = LOCS[locIdx]?.iso3;
  return iso3 ? PSYCHIATRISTS[iso3] ?? null : null;
}

/** 心理健康支出占政府卫生支出比例快照（%）：{ year, val } | null */
export function getSpendPct(locIdx) {
  const iso3 = LOCS[locIdx]?.iso3;
  return iso3 ? MENTAL_SPEND_PCT[iso3] ?? null : null;
}

const REGION_ORDER = ['北美', '欧洲与中亚', '拉美与加勒比', '东亚与太平洋', '南亚', '中东与北非', '撒哈拉以南非洲', '其他'];

/** 按大区分组的地区列表：[{ label, locIdx: [...] }]，组内按中文名排序 */
export function getRegionGroups() {
  const groups = new Map(REGION_ORDER.map((label) => [label, []]));
  LOCS.forEach((loc, locIdx) => {
    groups.get(loc.regionLabel ?? '其他').push(locIdx);
  });
  const collator = new Intl.Collator('zh-Hans');
  return REGION_ORDER
    .filter((label) => groups.get(label).length > 0)
    .map((label) => ({
      label,
      locIdx: groups.get(label).sort((a, b) => collator.compare(LOCS[a].zh, LOCS[b].zh))
    }));
}

/** 皮尔逊相关系数。pairs: [[x, y], ...]，有效对数 < 3 时返回 null */
export function pearson(pairs) {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = valid.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of valid) { sx += x; sy += y; }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of valid) {
    const a = x - mx;
    const b = y - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** 最小二乘拟合 y = kx + b；返回 { k, b } 或 null */
export function linearFit(pairs) {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = valid.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of valid) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const k = (n * sxy - sx * sy) / denom;
  return { k, b: (sy - k * sx) / n };
}

/** 患病率色阶：色相由谱系提供，明度随数值变化（value 为 % 人口） */
export function shadeColor(baseColor, value, max) {
  const t = Math.max(0, Math.min(1, value / (max || 1)));
  return withAlpha(baseColor, 0.12 + 0.88 * t);
}

export function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}
