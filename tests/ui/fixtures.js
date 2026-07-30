import { cloneSeed } from '../../src/data.js';
import { SCHEMA_VERSION, SEED_VERSION } from '../../src/storage/constants.js';

export const STORAGE_KEY = 'symgene-wiki-data-v1';

export function createStoredData() {
  return {
    meta: { version: 10 },
    drugs: [{
      id: 'drug-sertraline',
      name: '舍曲林',
      aliases: 'Sertraline',
      section: '抗抑郁药',
      categoryLabel: '选择性5-羟色胺再摄取抑制剂',
      className: '选择性5-羟色胺再摄取抑制剂',
      classOrder: 1,
      indication: '抑郁障碍等',
      action: '测试药物作用',
      kinetics: '测试动力学',
      interactions: '测试联用说明',
      sideEffects: '测试副作用',
      contraindications: '测试警示',
      source: '公开测试来源',
      updated: '2026-07-29'
    }],
    disorders: [{
      id: 'disorder-depression',
      name: '抑郁障碍',
      aliases: ['抑郁症'],
      category: '心境障碍',
      summary: '持续低落、精力下降和早醒。',
      details: '测试疾病说明。',
      symptoms: ['早醒', '精力下降'],
      patientPhrases: ['最近总是早醒'],
      courseClues: ['持续两周以上'],
      functionalImpact: ['工作效率下降'],
      assessment: ['持续时间'],
      differentials: ['睡眠障碍'],
      treatmentOverview: ['专业评估'],
      emergencySignals: ['自杀想法'],
      relatedDrugIds: ['drug-sertraline'],
      source: '公开测试来源'
    }],
    cases: [{
      id: 'case-depression',
      disorderId: 'disorder-depression',
      title: '持续低落与早醒案例',
      stage: '初步评估',
      tags: ['早醒'],
      summary: '持续低落并出现早醒。',
      presentation: ['精力下降'],
      timeline: '持续三个月',
      functionImpact: '不想见人',
      riskSignals: '无急性风险',
      assessmentFocus: ['睡眠变化'],
      differentialClues: ['躯体因素'],
      safetyNote: '必要时寻求专业帮助',
      source: '公开测试来源'
    }],
    resources: [{
      id: 'resource-public',
      kind: '网站',
      title: '公开心理健康资源',
      description: '公开测试资源。',
      url: 'https://example.com/mental-health',
      source: '示例机构'
    }]
  };
}

export function seedStoredData(data = createStoredData()) {
  const seedData = cloneSeed();
  const deletedIds = Object.fromEntries(
    Object.entries(seedData).map(([type, items]) => {
      const savedIds = new Set(data[type].map((item) => item.id));
      return [type, items.map((item) => item.id).filter((id) => !savedIds.has(id))];
    })
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    seedVersion: SEED_VERSION,
    savedAt: '2026-07-29T12:00:00.000Z',
    data,
    deletedIds
  }));
  return data;
}
