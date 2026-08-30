// 一次性数据构建脚本：把 raw/ 中的 GBD 2023 患病率、世界银行 GDP、WHO GHO
// 精神卫生系统指标与 KFF/NSDUH 美国族裔快照，归一为 src/atlas/ 下的静态数据模块。
// 运行：node scripts/atlas/build-atlas-data.mjs （数据文件不入库，产物入库）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'raw', 'atlas-public');
const OUT = join(ROOT, 'src', 'atlas');
const GBD_CSV = join(ROOT, 'raw', 'IHME-GBD_2023_DATA-b6f7353f-1', 'IHME-GBD_2023_DATA-b6f7353f-1.csv');
const YEAR0 = 2016;

const readJson = (f) => JSON.parse(readFileSync(join(RAW, f), 'utf-8'));

// ---------- 1. GBD 患病率 ----------
const gbdRows = readFileSync(GBD_CSV, 'utf-8')
  .split(/\r?\n/).filter(Boolean);
const header = gbdRows[0].split(',');
const parseGbd = () => {
  const out = [];
  for (const line of gbdRows.slice(1)) {
    const cells = line.split(',');
    if (cells.length < header.length) continue;
    const r = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    out.push({
      loc: Number(r.location), year: Number(r.year), cause: Number(r.cause),
      age: Number(r.age), val: Number(r.val)
    });
  }
  return out;
};
const gbd = parseGbd();

// ---------- 2. 元数据：GBD 地区（中英文名）、层级树、世界银行国家 ----------
const metaEn = readJson('gbd-meta-en.json');
const metaZh = readJson('gbd-meta-zh.json');
const pickMeta = (meta, key) => {
  const data = meta.data ?? meta;
  const map = new Map();
  for (const entry of Object.values(data[key] ?? {})) {
    const id = Number(entry.id ?? entry.location_id ?? entry.cause_id);
    if (Number.isFinite(id)) map.set(id, entry);
  }
  return map;
};
const locEn = pickMeta(metaEn, 'location');
const locZh = pickMeta(metaZh, 'location');

const hierarchy = readJson('gbd-hierarchy.json');
const countryIds = [];
(function walk(node, depth) {
  if (depth === 3) countryIds.push(node.id);
  for (const child of node.children ?? []) walk(child, depth + 1);
})(hierarchy.data.locations['0'], 0);

const wbCountries = readJson('wb-countries.json')[1] ?? [];
const wbByNormName = new Map();
for (const c of wbCountries) {
  if (c.region?.id === 'NA' && c.iso2Code === 'XK') continue; // 聚合行
  wbByNormName.set(normName(c.name), c);
  if (c.name === 'Korea, Rep.') wbByNormName.set(normName('South Korea'), c);
  if (c.name === 'Yemen, Rep.') wbByNormName.set(normName('Yemen'), c);
  if (c.name === 'Kyrgyz Republic') wbByNormName.set(normName('Kyrgyzstan'), c);
  if (c.name === 'Slovak Republic') wbByNormName.set(normName('Slovakia'), c);
  if (c.name === 'Egypt, Arab Rep.') wbByNormName.set(normName('Egypt'), c);
  if (c.name === 'Iran, Islamic Rep.') wbByNormName.set(normName('Iran'), c);
  if (c.name === 'Venezuela, RB') wbByNormName.set(normName('Venezuela'), c);
  if (c.name === 'Bolivia') wbByNormName.set(normName('Bolivia'), c);
  if (c.name === 'Gambia, The') wbByNormName.set(normName('Gambia'), c);
  if (c.name === 'Bahamas, The') wbByNormName.set(normName('The Bahamas'), c);
  if (c.name === 'Lao PDR') wbByNormName.set(normName("Lao People's Democratic Republic"), c);
  if (c.name === 'West Bank and Gaza') wbByNormName.set(normName('State of Palestine'), c);
  if (c.name === 'Micronesia, Fed. Sts.') wbByNormName.set(normName('Micronesia (Federated States of)'), c);
  if (c.name === 'Congo, Rep.') wbByNormName.set(normName('Congo'), c);
  if (c.name === 'Congo, Dem. Rep.') wbByNormName.set(normName('Democratic Republic of the Congo'), c);
  if (c.name === 'Tanzania') wbByNormName.set(normName('United Republic of Tanzania'), c);
  if (c.name === 'Moldova') wbByNormName.set(normName('Republic of Moldova'), c);
  if (c.name === 'Syrian Arab Republic') wbByNormName.set(normName('Syria'), c);
  if (c.name === 'Turkiye') wbByNormName.set(normName('Turkey'), c);
  if (c.name === 'Viet Nam') wbByNormName.set(normName('Vietnam'), c);
  if (c.name === 'Cote d\'Ivoire') wbByNormName.set(normName("Côte d'Ivoire"), c);
  if (c.name === 'Hong Kong SAR, China') wbByNormName.set(normName('Hong Kong SAR, China'), c);
  if (c.name === 'Macao SAR, China') wbByNormName.set(normName('Macao SAR, China'), c);
  if (c.name === 'Virgin Islands (U.S.)') wbByNormName.set(normName('United States Virgin Islands'), c);
  if (c.name === 'Curacao') wbByNormName.set(normName('Curaçao'), c);
  if (c.name === 'Brunei Darussalam') wbByNormName.set(normName('Brunei'), c);
  if (c.name === 'Russian Federation') wbByNormName.set(normName('Russia'), c);
  if (c.name === 'Czechia') wbByNormName.set(normName('Czech Republic'), c);
  if (c.name === 'Korea, Dem. People\'s Rep.') wbByNormName.set(normName('Democratic People\'s Republic of Korea'), c);
  if (c.name === 'United States') wbByNormName.set(normName('United States of America'), c);
}
function normName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// GBD 名称 → 世界银行记录 的手工兜底映射（按需要增补）
// locId -> { iso3, region }：世界银行名录中缺失或无法按名称匹配的经济体
const MANUAL_ISO3 = {
  8: { iso3: 'TWN', region: 'EAS' },       // Taiwan
  187: { iso3: 'SOM', region: 'SSF' },     // Somalia
  320: { iso3: 'COK', region: 'EAS' },     // Cook Islands
  369: { iso3: 'NRU', region: 'EAS' },     // Nauru
  374: { iso3: 'NIU', region: 'EAS' },     // Niue
  413: { iso3: 'TKL', region: 'EAS' }      // Tokelau
};
// 名称别名（GBD 写法 → 世界银行规范名归一化键）
const ALIAS_KEYS = [
  ['United States of America', 'United States'],
  ['Republic of Korea', 'Korea, Rep.'],
  ["Democratic People's Republic of Korea", "Korea, Dem. People's Rep."],
  ['Iran (Islamic Republic of)', 'Iran, Islamic Rep.'],
  ['Venezuela (Bolivarian Republic of)', 'Venezuela, RB'],
  ['Bolivia (Plurinational State of)', 'Bolivia'],
  ['Micronesia (Federated States of)', 'Micronesia, Fed. Sts.'],
  ['Democratic Republic of the Congo', 'Congo, Dem. Rep.'],
  ['United Republic of Tanzania', 'Tanzania'],
  ['Republic of Moldova', 'Moldova'],
  ['State of Palestine', 'West Bank and Gaza'],
  ['Palestine', 'West Bank and Gaza'],
  ['Bahamas', 'Bahamas, The'],
  ['The Bahamas', 'Bahamas, The'],
  ['Slovakia', 'Slovak Republic'],
  ['Kyrgyzstan', 'Kyrgyz Republic'],
  ['Egypt', 'Egypt, Arab Rep.'],
  ['Yemen', 'Yemen, Rep.'],
  ['Gambia', 'Gambia, The'],
  ['Lao People\'s Democratic Republic', 'Lao PDR'],
  ['Saint Lucia', 'St. Lucia'],
  ['Saint Vincent and the Grenadines', 'St. Vincent and the Grenadines'],
  ['Saint Kitts and Nevis', 'St. Kitts and Nevis'],
  ['United States Virgin Islands', 'Virgin Islands (U.S.)'],
  ['Curaçao', 'Curacao'],
  ['Turkey', 'Turkiye'],
  ['Türkiye', 'Turkiye'],
  ['Cape Verde', 'Cabo Verde']
];
function buildAliasMap() {
  const map = new Map();
  for (const [gbdName, wbName] of ALIAS_KEYS) {
    const hit = wbByNormName.get(normName(wbName));
    if (hit) map.set(normName(gbdName), hit);
  }
  return map;
}

const WB_REGION_LABEL = {
  NAC: '北美', ECS: '欧洲与中亚', LCN: '拉美与加勒比', EAS: '东亚与太平洋',
  SAS: '南亚', MEA: '中东与北非', SSF: '撒哈拉以南非洲'
};

const locs = [];
const iso3ByLoc = new Map();
const iso3Set = new Set();
const unmatched = [];
const aliasMap = buildAliasMap();
for (const locId of countryIds.sort((a, b) => a - b)) {
  const en = locEn.get(locId)?.medium_name ?? locEn.get(locId)?.name ?? '';
  const manual = MANUAL_ISO3[locId];
  const hit = wbByNormName.get(normName(en)) ?? aliasMap.get(normName(en));
  const iso3 = manual?.iso3 ?? (hit ? hit.id : null);
  if (!manual && !hit) unmatched.push({ locId, en });
  if (!iso3) continue;
  iso3ByLoc.set(locId, iso3);
  iso3Set.add(iso3);
  const zh = locZh.get(locId)?.medium_name ?? locZh.get(locId)?.name ?? en;
  const wbRegion = manual?.region ?? (hit?.region?.id ?? null);
  locs.push({ iso3, locId, en, zh, region: wbRegion, regionLabel: WB_REGION_LABEL[wbRegion] ?? '其他' });
}
function wbNameByIso3(iso3) {
  const c = wbCountries.find((x) => x.id === iso3);
  return c ? c.name : '';
}

// ---------- 3. 患病率记录（紧凑数组） ----------
const CAUSES = [
  { gbdId: 558, key: 'all_mental', spectrum: 'overview', zh: '全部精神障碍', en: 'Mental disorders' },
  { gbdId: 567, key: 'depressive', spectrum: 'mood', zh: '抑郁症', en: 'Depressive disorders' },
  { gbdId: 570, key: 'bipolar', spectrum: 'mood', zh: '双相情感障碍', en: 'Bipolar disorder' },
  { gbdId: 571, key: 'anxiety', spectrum: 'anxiety', zh: '焦虑症', en: 'Anxiety disorders' },
  { gbdId: 559, key: 'schizophrenia', spectrum: 'psychotic', zh: '精神分裂症', en: 'Schizophrenia' },
  { gbdId: 572, key: 'eating', spectrum: 'eating', zh: '进食障碍', en: 'Eating disorders' },
  { gbdId: 973, key: 'substance', spectrum: 'externalizing', zh: '物质使用障碍', en: 'Substance use disorders' },
  { gbdId: 579, key: 'conduct', spectrum: 'externalizing', zh: '品行障碍', en: 'Conduct disorder' },
  { gbdId: 578, key: 'adhd', spectrum: 'neurodev', zh: '注意缺陷多动障碍', en: 'ADHD' },
  { gbdId: 575, key: 'autism', spectrum: 'neurodev', zh: '自闭症谱系障碍', en: 'Autism spectrum disorders' },
  { gbdId: 582, key: 'intellectual', spectrum: 'neurodev', zh: '特发性发育性智力障碍', en: 'Idiopathic developmental intellectual disability' },
  { gbdId: 585, key: 'other_mental', spectrum: 'other', zh: '其他精神障碍', en: 'Other mental disorders' }
];
const YEARS = []; for (let y = YEAR0; y <= 2023; y++) YEARS.push(y);
const causeIdx = new Map(CAUSES.map((c, i) => [c.gbdId, i]));
const yearIdx = new Map(YEARS.map((y, i) => [y, i]));
const locIdx = new Map(locs.map((l, i) => [l.iso3, i]));

const emit = { all: [], std: [] };
let dropped = 0;
for (const row of gbd) {
  const iso3 = iso3ByLoc.get(row.loc);
  const ci = causeIdx.get(row.cause);
  const yi = yearIdx.get(row.year);
  if (iso3 === undefined || ci === undefined || yi === undefined) { dropped += 1; continue; }
  const bucket = row.age === 22 ? emit.all : row.age === 27 ? emit.std : null;
  if (!bucket) { dropped += 1; continue; }
  bucket.push([locIdx.get(iso3), yi, ci, Number((row.val * 100).toFixed(4))]);
}
for (const key of Object.keys(emit)) emit[key].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));

// ---------- 4. 语境指标 ----------
const wbGdp = readJson('wb-gdp.json')[1] ?? [];
const gdp = [];
for (const rec of wbGdp) {
  if (!rec.value || !rec.date) continue;
  const li = locIdx.get(rec.countryiso3code);
  if (li === undefined) continue;
  if (Number(rec.date) < 2000) continue;
  gdp.push([li, Number(rec.date), Math.round(rec.value)]);
}
gdp.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

const ghoByIso = (file) => {
  const data = readJson(file).value ?? [];
  const map = new Map();
  for (const rec of data) {
    if (!Number.isFinite(rec.NumericValue)) continue;
    const iso3 = rec.SpatialDim;
    if (!iso3Set.has(iso3)) continue;
    const prev = map.get(iso3);
    if (!prev || Number(rec.TimeDim) > prev.year) {
      map.set(iso3, { year: Number(rec.TimeDim), val: rec.NumericValue });
    }
  }
  return map;
};
const psychiatrists = ghoByIso('gho-mh6.json');
const spendPct = ghoByIso('gho-mh4.json');

const mh12 = readJson('gho-mh12.json').value ?? [];
const suicide = [];
const suicideSeen = new Set();
for (const rec of mh12) {
  if (!Number.isFinite(rec.NumericValue)) continue;
  const iso3 = rec.SpatialDim;
  const li = locIdx.get(iso3);
  const year = Number(rec.TimeDim);
  if (li === undefined || year < 2000) continue;
  const dim = rec.Dim1 ?? '';
  if (dim && dim !== 'SEX_BTSX') continue;
  const key = iso3 + ':' + year;
  if (suicideSeen.has(key)) continue;
  suicideSeen.add(key);
  suicide.push([li, year, rec.NumericValue]);
}
suicide.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

// ---------- 5. 美国族裔快照（KFF 对 NSDUH/CDC 数据的整理，2025-12 发布） ----------
const ETHNICITY_GROUPS = [
  { id: 'white', zh: '白人（非西裔）', en: 'White' },
  { id: 'black', zh: '黑人（非西裔）', en: 'Black' },
  { id: 'hispanic', zh: '西裔', en: 'Hispanic' },
  { id: 'asian', zh: '亚裔', en: 'Asian' },
  { id: 'aian', zh: '美洲原住民/阿拉斯加原住民', en: 'AIAN' },
  { id: 'nhpi', zh: '夏威夷原住民/太平洋岛民', en: 'NHPI' }
];
const ETHNICITY_INDICATORS = [
  {
    id: 'ami', kind: 'prevalence', zh: '任何精神障碍（成人，过去一年）', unit: '%', year: 2024,
    source: 'kff-nsduh-2024',
    values: { white: 25, black: 21, hispanic: 21, asian: 17 }
  },
  {
    id: 'treatment', kind: 'access', zh: '成年患者过去一年接受精神健康服务比例', unit: '%', year: 2024,
    source: 'kff-nsduh-2024',
    values: { white: 58, hispanic: 44, black: 39, asian: 33 }
  },
  {
    id: 'suicide', kind: 'context', zh: '自杀死亡率（每 10 万人）', unit: '每10万人', year: 2023,
    source: 'kff-cdc-nvss-2023',
    values: { aian: 23.8, white: 17.6, black: 9.1, hispanic: 8.2, asian: 6.5 }
  },
  {
    id: 'overdose', kind: 'context', zh: '药物过量死亡率（每 10 万人）', unit: '每10万人', year: 2023,
    source: 'kff-cdc-nvss-2023',
    values: { aian: 65, black: 48.9, white: 33.1, nhpi: 26.2, hispanic: 22.8, asian: 5.1 }
  }
];

// ---------- 6. 产物 ----------
const banner = (note) => `// 由 scripts/atlas/build-atlas-data.mjs 生成，请勿手改。${note}\n`;

writeFileSync(join(OUT, 'geo.js'), banner() + `export const LOCS = ${JSON.stringify(locs)};\n`);
writeFileSync(
  join(OUT, 'prevalence.js'),
  banner() +
  `export const DISEASES = ${JSON.stringify(CAUSES)};\n` +
  `export const YEARS = ${JSON.stringify(YEARS)};\n` +
  `export const PREVALENCE = ${JSON.stringify(emit)};\n`
);
writeFileSync(
  join(OUT, 'context.js'),
  banner() +
  `export const GDP = ${JSON.stringify(gdp)};\n` +
  `export const SUICIDE = ${JSON.stringify(suicide)};\n` +
  `export const PSYCHIATRISTS = ${JSON.stringify(Object.fromEntries(psychiatrists))};\n` +
  `export const MENTAL_SPEND_PCT = ${JSON.stringify(Object.fromEntries(spendPct))};\n`
);
writeFileSync(
  join(OUT, 'ethnicity.js'),
  banner() +
  `export const ETHNICITY_GROUPS = ${JSON.stringify(ETHNICITY_GROUPS)};\n` +
  `export const ETHNICITY_INDICATORS = ${JSON.stringify(ETHNICITY_INDICATORS)};\n`
);

// ---------- 7. 摘要 ----------
const iso3List = locs.map((l) => l.iso3);
console.log('GBD rows parsed:', gbd.length, '| dropped (no iso3/cause/year/age):', dropped);
console.log('countries mapped:', locs.length, '| unmatched:', unmatched.length);
console.log('unmatched list:', JSON.stringify(unmatched));
console.log('prevalence all/std rows:', emit.all.length, emit.std.length);
console.log('gdp rows:', gdp.length, '| suicide rows:', suicide.length,
  '| psychiatrists countries:', psychiatrists.size, '| spend countries:', spendPct.size);
console.log('regions:', JSON.stringify(Object.fromEntries(Object.entries(
  iso3List.reduce((acc, iso3) => {
    const l = locs.find((x) => x.iso3 === iso3);
    acc[l.regionLabel] = (acc[l.regionLabel] ?? 0) + 1;
    return acc;
  }, {})
))));
