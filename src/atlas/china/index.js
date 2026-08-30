// 中国资源地图聚合选择器：合并省级边界、收录机构、公开资源统计与评分模型。
import { PROVINCE_GEO } from '../chinaGeo.js';
import { INSTITUTIONS } from '../chinaInstitutions.js';
import { PROVINCE_RESOURCE_STATS, PROVINCE_RESOURCE_YEAR } from '../chinaProvinceStats.js';
import {
  SCORING_MODEL, CHINA_FACTS, SOCIAL_CRAWL_STATUS,
  CHINA_CATEGORY_ORDER, CHINA_CATEGORY_COLORS, NATIONAL_TREND, SERVICE_2025
} from '../chinaMeta.js';
import { SOCIAL_REPUTATION, SOCIAL_REPUTATION_META } from '../chinaSocialReputation.js';

export {
  PROVINCE_GEO, INSTITUTIONS, PROVINCE_RESOURCE_STATS, PROVINCE_RESOURCE_YEAR,
  SCORING_MODEL, CHINA_FACTS, SOCIAL_CRAWL_STATUS,
  CHINA_CATEGORY_ORDER, CHINA_CATEGORY_COLORS, NATIONAL_TREND, SERVICE_2025,
  SOCIAL_REPUTATION, SOCIAL_REPUTATION_META
};

/** 机构口碑聚合（社交平台公开讨论，仅机构级指标）：{ ...聚合值, reputationScore } | null */
export function getReputation(instName) {
  return SOCIAL_REPUTATION[instName] ?? null;
}

const STATS_BY_NAME = new Map(PROVINCE_RESOURCE_STATS.map((row) => [row.name, row]));

const countByProvince = new Map();
for (const inst of INSTITUTIONS) {
  countByProvince.set(inst.province, (countByProvince.get(inst.province) ?? 0) + 1);
}

const pickBeds = (row) => row?.openBedsLatest ?? row?.openBeds2015 ?? null;
const pickInstitutions = (row) => row?.institutionsLatest ?? row?.institutions2015 ?? null;

/** 省级合并视图：边界 + 收录机构数 + 公开资源统计（年份见 PROVINCE_RESOURCE_YEAR） */
export const PROVINCES = PROVINCE_GEO
  .map((geo) => {
    const stats = STATS_BY_NAME.get(geo.name) ?? null;
    return {
      adcode: geo.adcode,
      name: geo.name,
      polygons: geo.polygons,
      institutionCount: countByProvince.get(geo.name) ?? 0,
      institutionsStatsYear: pickInstitutions(stats),
      openBeds: pickBeds(stats),
      blankCountyRate: stats?.blankCountyRate ?? null
    };
  })
  .sort((a, b) => b.institutionCount - a.institutionCount);

export const INSTITUTIONS_BY_PROVINCE = (() => {
  const map = new Map();
  for (const inst of INSTITUTIONS) {
    if (!map.has(inst.province)) map.set(inst.province, []);
    map.get(inst.province).push(inst);
  }
  return map;
})();

export const CATEGORY_COUNTS = (() => {
  const counts = new Map();
  for (const inst of INSTITUTIONS) {
    counts.set(inst.category, (counts.get(inst.category) ?? 0) + 1);
  }
  return CHINA_CATEGORY_ORDER
    .filter((id) => counts.has(id))
    .map((id) => ({ id, label: labelOf(id), count: counts.get(id) }));
})();

function labelOf(categoryId) {
  const found = INSTITUTIONS.find((inst) => inst.category === categoryId);
  return found ? found.categoryLabel : categoryId;
}

/** 等值分档（5 档），用于 choropleth 深浅 */
export function quantileShade(value, max, steps = 5) {
  if (value === null || !max) return 0;
  return Math.min(steps - 1, Math.floor((value / max) * steps));
}

export function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}

/** 中国范围等经纬投影（含 cos(36°) 宽度校正）。返回 [x, y] 归一化到 [0, 1] */
const LNG0 = 73;
const LNG1 = 136;
const LAT0 = 17.5;
const LAT1 = 54.5;
const K = Math.cos((36 * Math.PI) / 180);
export function project(lng, lat) {
  const x = (lng - LNG0) / (LNG1 - LNG0) * (1 / K);
  const y = (LAT1 - lat) / (LAT1 - LAT0);
  return [x, y];
}

/** 综合评分（v1：任一维度缺失即返回 null，不做估算） */
export function computeScore(inst) {
  const w = SCORING_MODEL.weights;
  const parts = [inst.reputationScore, inst.resourceScore, inst.expertiseScore];
  if (parts.some((p) => p === null || p === undefined || !Number.isFinite(p))) return null;
  return w.reputation * parts[0] + w.resource * parts[1] + w.expertise * parts[2];
}
