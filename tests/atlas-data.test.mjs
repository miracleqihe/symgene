import assert from 'node:assert/strict';
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

test('atlas-china: 机构名录完整且坐标合理', async () => {
  const { INSTITUTIONS, PROVINCES, PROVINCE_RESOURCE_STATS } = await import('../src/atlas/china/index.js');
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
  for (const row of PROVINCE_RESOURCE_STATS) {
    assert.ok(row.name.endsWith('省') || row.name.endsWith('自治区') || row.name.endsWith('市'), `省份名异常: ${row.name}`);
    assert.ok(row.institutions2015 >= 0 && row.openBeds2015 >= 0);
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
