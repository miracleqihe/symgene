import knowledge from './content/knowledge.json' with { type: 'json' };

export const seedData = knowledge;

export const navItems = [
  { id: 'home', label: '首页', kicker: 'WELCOME' },
  { id: 'drugs', label: '药物', kicker: 'MEDICATIONS' },
  { id: 'disorders', label: '疾病科普', kicker: 'DISORDERS' },
  { id: 'cases', label: '案例分析', kicker: 'CASE NOTES' },
  { id: 'resources', label: '网络资源', kicker: 'LIBRARY' },
  { id: 'reviews', label: '前沿综述', kicker: 'FRONTIER REVIEWS' },
  { id: 'atlas', label: '信息可视化', kicker: 'DATA ATLAS' }
];

export const typeLabels = { drugs: '药物资料', disorders: '疾病线索', cases: '相似案例', resources: '资源' };

export function cloneSeed() {
  return JSON.parse(JSON.stringify(seedData));
}

function createSeedRevision(value) {
  const text = JSON.stringify(value);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${text.length}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export const seedRevision = createSeedRevision(seedData);
