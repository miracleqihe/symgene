import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reviewData = JSON.parse(readFileSync(
  new URL('../src/frontierReviews.json', import.meta.url),
  'utf8'
));

test('前沿综述包含六个主题且顺序唯一', () => {
  assert.equal(reviewData.moduleId, 'frontier-reviews');
  assert.equal(reviewData.menus.length, 6);
  assert.deepEqual(reviewData.menus.map((menu) => menu.order), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(reviewData.menus.map((menu) => menu.menuId)).size, 6);
  assert.equal(new Set(reviewData.menus.map((menu) => menu.slug)).size, 6);
});

test('每个主题包含三类完整正文、关键结论和 10 篇文献', () => {
  for (const menu of reviewData.menus) {
    assert.deepEqual(
      menu.bodySections.map((section) => section.heading),
      ['核心共识', '正在推进的前沿', '关键争议'],
      `${menu.menuId} 正文结构不完整`
    );
    assert.ok(menu.keyClaims.length >= 4, `${menu.menuId} 关键结论不足`);
    assert.equal(menu.references.length, 10, `${menu.menuId} 文献数量不合格`);
    for (const reference of menu.references) {
      assert.ok(reference.abstractZh?.length >= 50, `${reference.id} 缺少完整中文摘要`);
    }
  }
  assert.equal(reviewData.menus.reduce((sum, menu) => sum + menu.references.length, 0), 60);
});

test('正文三部分和关键结论的引用均可解析且 DOI 元数据有效', () => {
  for (const menu of reviewData.menus) {
    const referenceIds = new Set(menu.references.map((reference) => reference.id));
    assert.equal(referenceIds.size, menu.references.length, `${menu.menuId} 存在重复文献 ID`);
    for (const section of menu.bodySections) {
      assert.ok(section.referenceIds.length >= 3, `${menu.menuId} 的${section.heading}引用不足`);
      for (const referenceId of section.referenceIds) {
        assert.ok(referenceIds.has(referenceId), `${menu.menuId} 的${section.heading}引用不存在的 ${referenceId}`);
      }
    }
    for (const claim of menu.keyClaims) {
      assert.ok(claim.referenceIds.length > 0, `${claim.claimId} 没有来源`);
      for (const referenceId of claim.referenceIds) {
        assert.ok(referenceIds.has(referenceId), `${claim.claimId} 引用了不存在的 ${referenceId}`);
      }
    }
    for (const reference of menu.references) {
      assert.match(reference.doi, /^10\.\d{4,9}\/\S+$/);
      assert.equal(reference.canonicalUrl, `https://doi.org/${reference.doi}`);
      assert.ok(reference.year <= 2026);
    }
  }
});

test('安全边界禁止个体诊断、预测与治疗推荐', () => {
  assert.equal(reviewData.safety.allowIndividualDiagnosis, false);
  assert.equal(reviewData.safety.allowIndividualRiskPrediction, false);
  assert.equal(reviewData.safety.allowTreatmentRecommendation, false);
  assert.equal(reviewData.safety.highRiskSearchIntegration, 'excluded');
});

test('正文中的专业缩写提供英文全称与常用中文译名', () => {
  const serialized = JSON.stringify(reviewData);
  for (const fullName of [
    'Hierarchical Taxonomy of Psychopathology',
    'Research Domain Criteria',
    'N-methyl-D-aspartate receptor',
    'Area Under the Curve',
    'Concordance Statistic',
    'Outreach and Support in South London 1000',
    '3,4-methylenedioxymethamphetamine',
    'intermittent theta-burst stimulation',
    'repetitive transcranial magnetic stimulation',
    'Artificial Intelligence',
    'Large Language Model',
    'Cognitive Behavioral Therapy',
    'Digital Object Identifier',
  ]) {
    assert.ok(serialized.includes(fullName), `缺少缩写释义：${fullName}`);
  }
});
