// 中国资源地图数据构建：
// - 合并 OSM POI（两次 Overpass 查询）与人工核校的知名专科机构名录（Nominatim 编码，市级质心兜底并标注精度）
// - 点位归属省份（射线法命中省级边界）
// - 分省精神卫生资源表（中国卫生政策研究 2019，数据截至 2015 年底）
// - 省级 GeoJSON 精简（坐标保留 2 位小数）
// 运行：node scripts/atlas/build-china-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'raw', 'atlas-public');
const OUT = join(ROOT, 'src', 'atlas');
const readJson = (f) => JSON.parse(readFileSync(join(RAW, f), 'utf-8'));

// ---------- 1. POI 合并与分类 ----------
const CATEGORY_RULES = [
  { id: 'health-center', label: '心理/精神卫生中心', test: (n) => /心理卫生|心理健康|心理康复|精神康复|心理援助|精神卫生中心|精神卫生防治/.test(n) },
  { id: 'specialized', label: '精神专科医院', test: (n) => /精神病|精神专科|精神科|心理医院|脑科|安定|安康|康宁|广济|仙岳|回龙观|第六医院|第七医院|第八医院|第一专科|安宁医院|平山|宁安/.test(n) },
  { id: 'counseling', label: '心理咨询机构', test: (n) => /心理咨询|心理治疗|心理诊所/.test(n) },
  { id: 'education', label: '心理健康教育机构', test: (n) => /心理健康教育|心理辅导/.test(n) }
];
// 兜底分类：来源集本身经过精神卫生关键词过滤或人工核校，
// 未命中上述规则的条目统一归为“精神卫生相关机构”
const FALLBACK_CATEGORY = { id: 'related', label: '精神卫生相关机构' };
// OSM 噪声条目（非医疗/非精神卫生场景，人工排查后剔除）
const NOISE_NAMES = ['沁音', '情缘婚姻家庭辅导'];
// 过于泛化的名称无法定位具体机构，不作为 POI/匹配目标
const GENERIC_NAMES = /^(精神科|心理咨询|心理门诊|心理科|精神病院|心理卫生|心理咨询科)$|^(精神|心理)$/
const classify = (name) => {
  for (const rule of CATEGORY_RULES) {
    if (rule.test(name)) return { id: rule.id, label: rule.label };
  }
  return FALLBACK_CATEGORY;
};

const osmRows = [];
for (const file of ['osm-mental.json', 'osm-mental-q3.json']) {
  const data = readJson(file);
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const name = (tags.name ?? '').replace(/\u200e/g, '').trim();
    if (!name || NOISE_NAMES.some((noise) => name.includes(noise)) || GENERIC_NAMES.test(name)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lng ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    osmRows.push({
      name,
      lat,
      lng,
      source: 'osm',
      osmType: el.type,
      osmId: el.id,
      addr: [tags['addr:province'], tags['addr:city']].filter(Boolean).join(' ') || null,
      kind: tags.amenity ?? tags.healthcare ?? 'unknown'
    });
  }
}

// Nominatim 逐省检索结果：只保留名称明确的精神卫生相关条目，剔除产业园/管委会/研究院等噪声
const sweep = readJson('nominatim-sweep.json')
  .filter((r) => {
    const n = r.name ?? '';
    return /精神|心理|脑科|安定|康宁|安宁医院/.test(n)
      && !/管理委员会|产业园|服务中心|服务中|研究院|研究所|学院|大学|车站|公司|宿舍|小区|家园$/.test(n);
  })
  .map((r) => ({
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    source: 'nominatim',
    city: null,
    precision: 'address',
    addr: (r.display ?? '').slice(0, 60) || null,
    note: null,
    kind: 'search'
  }));

const curated = readJson('curated-geocoded.json').map((r) => ({
  name: r.name,
  lat: r.lat,
  lng: r.lng,
  source: 'curated',
  city: r.city ?? null,
  precision: r.precision,
  addr: null,
  note: r.note || null,
  kind: 'hospital'
}));

// 去重：坐标取整到 3 位（约百米）且名称相近视为同一家
const normName = (n) => n.replace(/[\s（）()·]/g, '').toLowerCase();
const seen = new Map();
const merged = [];
for (const row of [...curated, ...sweep, ...osmRows]) {
  const key = `${row.lat.toFixed(3)}:${row.lng.toFixed(3)}`;
  const prev = seen.get(key);
  if (prev && (normName(prev.name).includes(normName(row.name)) || normName(row.name).includes(normName(prev.name)))) continue;
  if (prev && prev.source === 'osm' && (row.source === 'curated' || row.source === 'nominatim')) {
    // 人工核校/检索命中的条目优先于普通 OSM 条目
    seen.set(key, row);
    merged.splice(merged.findIndex((m) => m === prev), 1, row);
    continue;
  }
  if (prev && prev.source === 'nominatim' && row.source === 'curated') {
    seen.set(key, row);
    merged.splice(merged.findIndex((m) => m === prev), 1, row);
    continue;
  }
  if (prev) continue;
  seen.set(key, row);
  merged.push(row);
}

// ---------- 2. 点位归属省份（射线法） ----------
const geo = readJson('china-provinces.json');
const provinces = geo.features.map((f) => ({
  adcode: String(f.properties.adcode ?? ''),
  name: f.properties.name ?? '',
  polygons: (f.geometry?.type === 'MultiPolygon'
    ? f.geometry.coordinates
    : [f.geometry?.coordinates ?? []]).map((poly) => poly[0])
})).filter((p) => p.name);

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function provinceOf(lng, lat) {
  for (const p of provinces) {
    for (const ring of p.polygons) {
      if (pointInRing(lng, lat, ring)) return { adcode: p.adcode, name: p.name };
    }
  }
  return null;
}

const institutions = [];
const unmatchedPoi = [];
for (const row of merged) {
  const prov = provinceOf(row.lng, row.lat);
  if (!prov) { unmatchedPoi.push(row.name); continue; }
  const category = classify(row.name);
  institutions.push({
    id: `${row.source}-${institutions.length}`,
    name: row.name,
    lat: Number(row.lat.toFixed(4)),
    lng: Number(row.lng.toFixed(4)),
    province: prov.name,
    adcode: prov.adcode,
    city: row.city ?? row.addr ?? null,
    category: category.id,
    categoryLabel: category.label,
    precision: row.precision ?? (row.source === 'curated' ? 'address' : null),
    source: row.source,
    note: row.note ?? null
  });
}
institutions.sort((a, b) => a.province.localeCompare(b.province, 'zh-Hans') || a.name.localeCompare(b.name, 'zh-Hans'));

// ---------- 3. 分省资源表（2015 年底，中国卫生政策研究 2019） ----------
const rawTable = readJson('china-province-resources-2015.json');
const NAME_FIX = {
  '内蒙古区': '内蒙古自治区', '广西区': '广西壮族自治区', '西藏区': '西藏自治区',
  '新疆区': '新疆维吾尔自治区', '宁夏区': '宁夏回族自治区'
};
const clean = (v) => Number(String(v ?? '').replace(/\s/g, '')) || 0;
const provinceStats = [];
for (const row of rawTable.slice(3)) {
  const rawName = row[0];
  if (!rawName || rawName === '地区') continue;
  const name = NAME_FIX[rawName] ?? rawName;
  provinceStats.push({
    name,
    institutions2010: clean(row[1]),
    institutions2015: clean(row[2]),
    institutionsGrowth: clean(row[3]),
    openBeds2015: clean(row[8]),
    blankCountyTotal: clean(row[10]),
    blankCounty2015: clean(row[11]),
    blankCountyRate: clean(row[12]),
    national: rawName === '全国'
  });
}
const nationalRow = provinceStats.find((r) => r.national);
const provinceOnly = provinceStats.filter((r) => !r.national);

// 短省名 → GeoJSON 全称（按名合并分省统计与边界所必需）
function normalizeProvinceName(name) {
  const SPECIAL = { 北京: '北京市', 天津: '天津市', 上海: '上海市', 重庆: '重庆市', 内蒙古: '内蒙古自治区', 广西: '广西壮族自治区', 西藏: '西藏自治区', 宁夏: '宁夏回族自治区', 新疆: '新疆维吾尔自治区' };
  if (SPECIAL[name]) return SPECIAL[name];
  if (/(省|市|自治区)$/.test(name)) return name;
  return name + '省';
}

// 可选的最新分省数据：若 raw/atlas-public/china-province-resources-latest.json 存在则替换分省基线。
// 建议来源：《中国卫生健康统计年鉴》表“各地区精神病医院机构、床位及人员数”（2024/2025 版）。
// 期望格式：{ "year": 2024, "rows": [{ "name": "北京市", "institutions": 64, "openBeds": 10560 }, ...] }
let LATEST_PROVINCE_YEAR = 2015;
let provinceResourceOut = provinceOnly;
try {
  const latest = readJson('china-province-resources-latest.json');
  const rows = Array.isArray(latest) ? latest : latest.rows ?? [];
  if (rows.length) {
    LATEST_PROVINCE_YEAR = latest.year ?? 2024;
    provinceResourceOut = rows
      .map((r) => ({
        name: String(r.name ?? r[0] ?? '').trim(),
        institutionsLatest: r.institutions ?? null,
        openBedsLatest: Number(r.openBeds ?? r[2]) || 0
      }))
      .filter((r) => r.name && r.name !== '总计' && r.name !== '全国')
      .map((r) => ({ ...r, name: normalizeProvinceName(r.name) }));
    console.log('latest provincial resource data loaded, year =', LATEST_PROVINCE_YEAR);
  }
} catch {
  // 无最新文件时沿用 2015 年公开基线
}

// ---------- 4. GeoJSON 精简（2 位小数） ----------
const roundRing = (ring) => ring.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
const geoOut = provinces.map((p) => ({
  adcode: p.adcode,
  name: p.name,
  polygons: p.polygons.map((ring) => roundRing(ring))
}));

// ---------- 5. 产物 ----------
const banner = (note) => `// 由 scripts/atlas/build-china-data.mjs 生成，请勿手改。${note}\n`;

writeFileSync(
  join(OUT, 'chinaGeo.js'),
  banner('边界数据来源：阿里云 DataV GeoAtlas（公开）。') +
  `export const PROVINCE_GEO = ${JSON.stringify(geoOut)};\n`
);
writeFileSync(
  join(OUT, 'chinaInstitutions.js'),
  banner('POI 来源：OpenStreetMap（ODbL）+ 人工核校知名专科机构名录；坐标精度见 precision 字段。') +
  `export const INSTITUTIONS = ${JSON.stringify(institutions)};\n`
);
writeFileSync(
  join(OUT, 'chinaProvinceStats.js'),
  banner(`分省资源数据：史晨辉等《中国精神卫生资源状况分析》，中国卫生政策研究 2019，数据截至 2015 年底。当前基线年份：${LATEST_PROVINCE_YEAR}。`) +
  `export const PROVINCE_RESOURCE_YEAR = ${LATEST_PROVINCE_YEAR};\n` +
  `export const PROVINCE_RESOURCE_STATS = ${JSON.stringify(provinceResourceOut)};\n` +
  `export const NATIONAL_RESOURCE_2015 = ${JSON.stringify(nationalRow)};\n`
);

// ---------- 6. 摘要 ----------
const byCat = {};
for (const inst of institutions) byCat[inst.categoryLabel] = (byCat[inst.categoryLabel] ?? 0) + 1;
const provCounts = {};
for (const inst of institutions) provCounts[inst.province] = (provCounts[inst.province] ?? 0) + 1;
console.log('POI merged:', merged.length, '| assigned to province:', institutions.length, '| unmatched:', unmatchedPoi.length);
console.log('unmatched:', JSON.stringify(unmatchedPoi.slice(0, 10)));
console.log('by category:', JSON.stringify(byCat));
console.log('provinces covered:', Object.keys(provCounts).length, '| top:', JSON.stringify(
  Object.entries(provCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
));
