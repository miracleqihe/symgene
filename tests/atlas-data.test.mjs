import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LOCS, DISEASES, YEARS, PREVALENCE, GDP, SUICIDE,
  ETHNICITY_GROUPS, ETHNICITY_INDICATORS, SPECTRUMS, SPECTRUM_ORDER,
  SOURCES, DISCLAIMERS,
  getPrevalence, getGdp, getSuicide, getRegionGroups, pearson, linearFit, shadeColor, withAlpha
} from '../src/atlas/index.js';

test('atlas: 地区数量与 ISO3 唯一性', () => {
  assert.equal(LOCS.length, 204);
  const iso3s = new Set(LOCS.map((l) => l.iso3));
  assert.equal(iso3s.size, LOCS.length, 'ISO3 必须唯一');
  for (const loc of LOCS) {
    assert.match(loc.iso3, /^[A-Z]{3}$/, `ISO3 格式非法: ${loc.iso3}`);
    assert.ok(loc.zh && loc.en, `缺少名称: ${loc.iso3}`);
    assert.ok(loc.regionLabel, `缺少大区: ${loc.iso3}`);
  }
});

test('atlas: 谱系引用一致性', () => {
  assert.equal(DISEASES.length, 12);
  const spectrumIds = new Set(SPECTRUMS.map((s) => s.id));
  assert.equal(spectrumIds.size, SPECTRUMS.length);
  for (const disease of DISEASES) {
    assert.ok(spectrumIds.has(disease.spectrum), `未知谱系: ${disease.spectrum}`);
  }
  for (const spectrum of SPECTRUMS) {
    assert.match(spectrum.color, /^#[0-9a-f]{6}$/i);
    assert.ok(spectrum.blurb.length > 8);
  }
  assert.deepEqual(SPECTRUM_ORDER, SPECTRUMS.map((s) => s.id));
});

test('atlas: 患病率记录完整且数值合理', () => {
  assert.equal(YEARS.length, 8);
  assert.deepEqual(YEARS[0], 2016);
  assert.deepEqual(YEARS.at(-1), 2023);
  const expected = LOCS.length * DISEASES.length * YEARS.length;
  assert.equal(PREVALENCE.all.length, expected);
  assert.equal(PREVALENCE.std.length, expected);
  for (const rows of [PREVALENCE.all, PREVALENCE.std]) {
    for (const [li, yi, di, val] of rows) {
      assert.ok(li >= 0 && li < LOCS.length, 'locIdx 越界');
      assert.ok(yi >= 0 && yi < YEARS.length, 'yearIdx 越界');
      assert.ok(di >= 0 && di < DISEASES.length, 'diseaseIdx 越界');
      assert.ok(val >= 0 && val < 60, `患病率超出合理范围: ${val}`);
    }
  }
});

test('atlas: getPrevalence 查询抽查（全球抑郁症约 4%–6%）', () => {
  const china = LOCS.findIndex((l) => l.iso3 === 'CHN');
  const usa = LOCS.findIndex((l) => l.iso3 === 'USA');
  const germany = LOCS.findIndex((l) => l.iso3 === 'DEU');
  const depressive = DISEASES.findIndex((d) => d.key === 'depressive');
  const y2023 = YEARS.indexOf(2023);
  for (const li of [china, usa, germany]) {
    const val = getPrevalence('all', li, y2023, depressive);
    assert.ok(val !== null && val > 2 && val < 8, `抑郁症患病率异常: ${val}`);
  }
  // 年龄标准化口径也存在
  const std = getPrevalence('std', usa, y2023, depressive);
  assert.ok(std !== null && std > 1 && std < 10);
  // 缺失查询返回 null（越界索引）
  assert.equal(getPrevalence('all', 9999, 0, 0), null);
});

test('atlas: GDP 与自杀率数据可查询', () => {
  assert.ok(GDP.length > 4000, 'GDP 记录数过少');
  assert.ok(SUICIDE.length > 3000, '自杀率记录数过少');
  const usa = LOCS.findIndex((l) => l.iso3 === 'USA');
  const usaGdp = getGdp(usa, 2023);
  assert.ok(usaGdp !== null && usaGdp > 30000, `美国人均 GDP 异常: ${usaGdp}`);
  const usaSuicide = getSuicide(usa, 2019);
  assert.ok(usaSuicide !== null && usaSuicide > 5 && usaSuicide < 30, `美国自杀率异常: ${usaSuicide}`);
  assert.equal(getGdp(usa, 1990), null, '2000 年前数据应被裁剪');
});

test('atlas: 大区分组覆盖全部地区', () => {
  const groups = getRegionGroups();
  const total = groups.reduce((sum, g) => sum + g.locIdx.length, 0);
  assert.equal(total, LOCS.length);
  for (const group of groups) {
    assert.ok(group.label && group.label !== '其他', `存在未分组地区: ${group.label}`);
  }
});

test('atlas: 统计工具函数', () => {
  assert.equal(pearson([]), null);
  assert.equal(pearson([[1, 2]]), null);
  const r = pearson([[1, 1], [2, 2], [3, 3], [4, 4]]);
  assert.ok(Math.abs(r - 1) < 1e-9);
  const fit = linearFit([[1, 1], [2, 2], [3, 3]]);
  assert.ok(Math.abs(fit.k - 1) < 1e-9 && Math.abs(fit.b) < 1e-9);
  assert.equal(pearson([[1, 1], [1, 2], [1, 3]]), null, '零方差应返回 null');
});

test('atlas: 色阶工具', () => {
  assert.equal(withAlpha('#4f948b', 1), 'rgba(79, 148, 139, 1)');
  const low = shadeColor('#4f948b', 0, 10);
  const high = shadeColor('#4f948b', 10, 10);
  assert.match(low, /rgba\(79, 148, 139, 0\.12\)/);
  assert.match(high, /rgba\(79, 148, 139, 1\)/);
});

test('atlas: 族裔快照数据合规', () => {
  assert.ok(ETHNICITY_GROUPS.length >= 5);
  const groupIds = new Set(ETHNICITY_GROUPS.map((g) => g.id));
  for (const indicator of ETHNICITY_INDICATORS) {
    assert.ok(['prevalence', 'access', 'context'].includes(indicator.kind), `未知指标类型: ${indicator.kind}`);
    for (const [groupId, val] of Object.entries(indicator.values)) {
      assert.ok(groupIds.has(groupId), `未知族裔组: ${groupId}`);
      assert.ok(val > 0 && val < 100, `指标数值异常: ${indicator.id}/${groupId}=${val}`);
    }
  }
});

test('atlas: 来源与免责声明齐备', () => {
  assert.ok(SOURCES.length >= 4);
  for (const source of SOURCES) {
    assert.ok(source.org && source.url && source.coverage && source.license);
  }
  assert.ok(DISCLAIMERS.length >= 4);
});

test('atlas-china: 机构目录使用带国家命名空间的 JSON 契约', () => {
  const institutionsUrl = new URL('../src/atlas/institutions.json', import.meta.url);
  const legacyModuleUrl = new URL('../src/atlas/chinaInstitutions.js', import.meta.url);
  assert.ok(existsSync(institutionsUrl), '缺少 src/atlas/institutions.json');
  assert.equal(existsSync(legacyModuleUrl), false, '不应继续维护 chinaInstitutions.js');

  const document = JSON.parse(readFileSync(institutionsUrl, 'utf8'));
  assert.equal(document.schemaVersion, 1);
  assert.ok(document.country && typeof document.country === 'object', '缺少 country 命名空间');
  assert.ok(document.country.china, '缺少 country.china');
  assert.ok(Array.isArray(document.country.china.sources), 'country.china.sources 必须是数组');
  assert.ok(Array.isArray(document.country.china.institutions), 'country.china.institutions 必须是数组');
  assert.ok(document.country.china.institutions.length >= 1426, '迁移后不得丢失当前机构结果');

  const institutions = document.country.china.institutions;
  const ids = new Set(institutions.map((item) => item.id));
  assert.equal(ids.size, institutions.length, '机构 ID 必须在 country.china 内唯一');
  const sources = [...new Set(institutions.map((item) => item.source))].sort();
  assert.deepEqual(document.country.china.sources, sources, '来源列表必须与机构数据一致且稳定排序');
});

test('atlas-china: 机构名录完整且坐标合理', async () => {
  const { INSTITUTIONS, PROVINCES, PROVINCE_RESOURCE_STATS, PROVINCE_RESOURCE_YEAR } = await import('../src/atlas/china/index.js');
  assert.ok(INSTITUTIONS.length >= 200, `机构数过少: ${INSTITUTIONS.length}`);
  const provinceNames = new Set(PROVINCES.map((p) => p.name));
  for (const inst of INSTITUTIONS) {
    assert.ok(inst.name.length >= 3, `机构名称异常: ${inst.name}`);
    assert.ok(inst.lat > 17 && inst.lat < 55, `纬度超出中国范围: ${inst.name}`);
    assert.ok(inst.lng > 72 && inst.lng < 136, `经度超出中国范围: ${inst.name}`);
    assert.ok(provinceNames.has(inst.province), `省份未命中边界: ${inst.province}`);
    assert.ok(inst.categoryLabel, `缺少类别: ${inst.name}`);
  }
  assert.ok(PROVINCES.length >= 34, '省级边界数量不足');
  assert.equal(PROVINCE_RESOURCE_STATS.length, 31, '分省资源表应为 31 省');
  assert.equal(PROVINCE_RESOURCE_YEAR, 2024, '分省资源基线应为 2024 年');
  for (const row of PROVINCE_RESOURCE_STATS) {
    assert.ok(/(省|市|自治区)$/.test(row.name), `省份名异常: ${row.name}`);
    const beds = row.openBedsLatest ?? row.openBeds2015;
    const insts = row.institutionsLatest ?? row.institutions2015 ?? 0;
    assert.ok(beds >= 0 && insts >= 0, `数值异常: ${row.name}`);
  }
});

test('atlas-china: 南海诸岛数据落在合规范围内', async () => {
  const { SOUTH_CHINA_SEA } = await import('../src/atlas/china/index.js');
  assert.ok(SOUTH_CHINA_SEA.polygons.length > 0, '南海诸岛岛礁数据缺失');
  assert.ok(SOUTH_CHINA_SEA.source.includes('DataV'), '南海数据来源需可核查');
  let minLat = 90;
  for (const ring of SOUTH_CHINA_SEA.polygons) {
    assert.ok(ring.length >= 4, '岛礁环坐标过少');
    for (const [lng, lat] of ring) {
      assert.ok(lng > 105 && lng < 122, `南海经度越界: ${lng}`);
      assert.ok(lat > 3 && lat < 22, `南海纬度越界: ${lat}`);
      if (lat < minLat) minLat = lat;
    }
  }
  assert.ok(minLat < 10, '南海数据应覆盖南沙群岛（南至曾母暗沙附近）');
});

test('atlas-china: 发布态口碑数据不含任何可识别或外链字段', async () => {
  const { SOCIAL_REPUTATION, SOCIAL_REPUTATION_META } = await import('../src/atlas/china/index.js');
  const dump = JSON.stringify(SOCIAL_REPUTATION) + JSON.stringify(SOCIAL_REPUTATION_META);
  assert.ok(!/sci-?hub/i.test(dump), '发布数据不得包含 sci-hub 链接');
  assert.ok(!dump.includes('xiaohongshu.com'), '发布数据不得包含小红书原帖链接');
  assert.ok(!dump.includes('douyin.com'), '发布数据不得包含抖音原帖链接');
  assert.ok(!dump.includes('xsec_token'), '发布数据不得包含平台追踪参数');
  assert.equal(SOCIAL_REPUTATION_META.publicationGate, 'HUMAN_ADJUDICATED_ONLY', '发布口径必须是人工审阅后');
  const banned = ['notesList', 'authorRef', 'nickname', 'creator_hash', 'creatorHash', 'userId', 'url', 'ip'];
  for (const [name, agg] of Object.entries(SOCIAL_REPUTATION)) {
    for (const key of Object.keys(agg)) {
      assert.ok(!banned.includes(key), `${name} 含可识别/外链字段: ${key}`);
    }
    const threshold = SOCIAL_REPUTATION_META.review?.minSampleForScore ?? 20;
    if (agg.mentions < threshold) {
      assert.equal(agg.reputationScore, null, `${name} 样本不足不得给出评分`);
    }
    assert.equal(agg.strict + agg.relaxed, agg.mentions, `${name} 归因口径拆分之和应等于可用样本量`);
  }
});

test('atlas-china: 不产出机构综合口碑分，只产出服务体验倾向分', async () => {
  const { SOCIAL_REPUTATION, SOCIAL_REPUTATION_META } = await import('../src/atlas/china/index.js');
  const policy = SOCIAL_REPUTATION_META.scorePolicy ?? {};
  assert.equal(policy.producesCompositeScore, false, '发布口径必须声明不产出机构综合口碑分');
  assert.ok(policy.reason, '必须给出抽样偏差的读法提醒');
  assert.ok(policy.formula, '必须公开计分公式');
  const threshold = SOCIAL_REPUTATION_META.review?.minSampleForScore ?? 20;
  const minAspect = policy.minAspectSample ?? 3;
  const minDims = policy.minDimensionsForScore ?? 3;
  for (const [name, agg] of Object.entries(SOCIAL_REPUTATION)) {
    // 综合口碑分与旧三维评分永远不发
    assert.equal(agg.reputationScore, null, `${name} 不得产出机构综合口碑分`);
    assert.equal(agg.dimensions, null, `${name} 不得发布推算的三维评分`);

    // 极性计数必须能对上样本量
    const p = agg.polarity ?? { positive: 0, negative: 0, neutral: 0 };
    assert.equal(p.positive + p.negative + p.neutral, agg.mentions, `${name} 正/负/中性之和应等于可用样本量`);

    // 单维度样本不足时不得给分，避免 1 条好评 = 100 分
    const scored = [];
    for (const [aspect, d] of Object.entries(agg.dimensionScores ?? {})) {
      assert.equal(d.positive + d.negative + d.neutral, d.n, `${name}/${aspect} 极性计数之和应等于维度样本量`);
      if (d.n >= minAspect) {
        const expect = Math.round(((d.positive + 0.5 * d.neutral) / d.n) * 1000) / 10;
        assert.equal(d.score, expect, `${name}/${aspect} 维度分应符合公示公式`);
        assert.ok(d.score >= 0 && d.score <= 100, `${name}/${aspect} 维度分应在 0-100 内`);
        scored.push(aspect);
      } else {
        assert.equal(d.score, null, `${name}/${aspect} 仅 ${d.n} 条，低于 ${minAspect} 条下限不得给分`);
      }
    }

    if (agg.mentions >= threshold && scored.length >= minDims) {
      assert.equal(agg.reviewStatus, 'scored', `${name} 达标应标记为已评分`);
      const mean = Math.round((scored.reduce((s, a) => s + agg.dimensionScores[a].score, 0) / scored.length) * 10) / 10;
      assert.equal(agg.serviceScore, mean, `${name} 总分应为达标维度的简单平均`);
      assert.ok(agg.serviceScore >= 0 && agg.serviceScore <= 100, `${name} 总分应在 0-100 内`);
      assert.ok(agg.serviceScoreNote.includes(`${agg.polarity.positive} 条偏正面`),
        `${name} 必须同时公示正负面原始条数，不能只给一个分数`);
    } else {
      assert.equal(agg.serviceScore, null, `${name} 未达评分条件不得给出分数`);
      assert.equal(agg.reviewStatus, agg.mentions >= threshold ? 'profile_published' : 'insufficient_sample',
        `${name} 状态标记与样本量不符`);
    }
  }
});

test('atlas-china: 评分模型与事实卡片合规', async () => {
  const { SCORING_MODEL, CHINA_FACTS, SOCIAL_CRAWL_STATUS, computeScore } = await import('../src/atlas/china/index.js');
  const w = SCORING_MODEL.weights;
  assert.ok(Math.abs(w.reputation + w.resource + w.expertise - 1) < 1e-9, '评分权重之和应为 1');
  assert.equal(computeScore({ reputationScore: null }), null, '任一维度缺失不得估算总分');
  assert.equal(computeScore({ reputationScore: 3, resourceScore: 4, expertiseScore: 5 }).toFixed(2), '3.90');
  assert.ok(CHINA_FACTS.length >= 4);
  for (const fact of CHINA_FACTS) {
    assert.ok(fact.title && fact.body && fact.source);
  }
  assert.equal(SOCIAL_CRAWL_STATUS.status, 'xhs-v1-live');
});
